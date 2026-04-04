"""System prompt assembler: the final integration point.

# System Prompt 的架构决策:
#
#   1. 一次组装，永不改变
#      所有组件在启动时收集并拼接。之后每轮对话复用同一个字符串。
#      原因：KV Cache。system prompt 在所有轮次间共享缓存前缀。
#      如果每轮重建 system prompt，缓存前缀失效 → token 浪费。
#
#   2. 静态 vs 动态分离
#      静态信息 → system prompt（角色、环境、工具指南、CLAUDE.md）
#      动态信息 → system-reminder 标签，注入到 user message 中
#
#      为什么不把动态信息也放 system prompt：
#        - 当前日期每天变 → system prompt 每天变 → KV cache 失效
#        - Git status 每次操作后变 → 更频繁的失效
#        - 放到 messages 末尾，只影响最后几个 token 的计算
#
#   3. 组件拼接顺序
#      CC 的经验：角色定义在最前面，工具指南紧跟，CLAUDE.md 在后面。
#      原因：模型对 system prompt 开头的内容权重更高（primacy effect）。
#      工具使用规则比项目配置更重要（避免 bash 代替一切的问题）。
#
# 组件清单:
#
#   ┌─────────────────────────────────────────────┐
#   │ 1. 角色定义（你是谁，怎么做）               │  ← 最高权重
#   │ 2. 工具使用指南（什么时候用什么工具）       │
#   │ 3. 环境信息（OS/Shell/CWD/Git）             │
#   │ 4. 模型信息（你用的是哪个模型）             │
#   │ 5. 上下文持久化路径说明                     │
#   │ 6. Git 状态快照（branch/status/log）         │  ← 启动时快照
#   │ 7. CLAUDE.md（项目级 + 用户级配置）          │  ← 用户定制
#   │ 8. Skills 摘要（name + description）         │
#   │ 9. Commands 列表（/xxx）                     │
#   └─────────────────────────────────────────────┘
#
#   Per-turn 动态注入（不在 system prompt 里）：
#     - 当前日期
#     - Git status 变更
#     - Memory 索引
"""

from datetime import datetime

from src.environment import get_environment_prompt, get_git_status_snapshot
from src.context.persistence import get_context_dir_description
from src.skills.loader import (
    SkillMeta, CommandMeta,
    get_skills_prompt, get_commands_prompt,
)
from src.prompt.claude_md import load_claude_md, format_claude_md_prompt
from src.prompt.tool_guide import get_tool_guide
from src.tools.registry import ToolRegistry


# ── 角色定义 ──
# 这是能力补偿型 prompt：告诉模型它的身份和基本行为准则
# 保持简短 — 详细的行为指南在 tool_guide 和 CLAUDE.md 里

ROLE_PROMPT = (
    "You are a helpful coding assistant running as a CLI agent. "
    "Be concise and direct. "
    "Think step by step for complex tasks. "
    "Always read files before modifying them."
)


def build_system_prompt(
    registry: ToolRegistry,
    model: str,
    skills: list[SkillMeta],
    commands: list[CommandMeta],
) -> str:
    """组装完整的 system prompt。

    在 agent 启动时调用一次，之后不再改变。
    所有参数在启动时就确定了。

    Args:
        registry: 已注册的工具集，用于生成工具指南
        model: 模型名称（如 "gpt-4o"），注入让模型知道自己是谁
        skills: scan_skills() 的结果
        commands: scan_commands() 的结果

    Returns:
        完整的 system prompt 字符串

    设计决策 — 为什么参数不是一个 config dict:
        显式参数 > 隐式 config。每个参数的用途一目了然。
        如果以后组件超过 10 个，再考虑 config 对象。
    """
    components: list[str] = []

    # 1. 角色定义（最高权重位置）
    components.append(ROLE_PROMPT)

    # 2. 工具使用指南（紧跟角色，避免 bash 代替一切）
    components.append(get_tool_guide(registry))

    # 3. 环境信息
    components.append(get_environment_prompt())

    # 4. 模型信息
    # 模型需要知道自己是谁 — 影响它对自身能力的判断
    # CC 注入的是完整信息："You are powered by claude-sonnet-4-20250514"
    components.append(f"# Model\nYou are powered by {model}.")

    # 5. 上下文持久化
    # 告诉模型 .agent/context/ 目录的存在和用途
    # 模型可以用 file_read 工具去读取之前保存的上下文
    context_desc = get_context_dir_description()
    if context_desc:
        components.append(f"# Context Persistence\n{context_desc}")

    # 6. Git status 快照
    # CC 在对话开始时注入 gitStatus 块。
    # 放 system prompt 里（每次启动 agent_loop 构建一次），
    # 而不是 system-reminder（那是每轮都注入的）。
    # 标注 "snapshot" 让模型知道这不会自动更新。
    git_snapshot = get_git_status_snapshot()
    if git_snapshot:
        components.append(git_snapshot)

    # 7. CLAUDE.md（项目级 + 用户级）
    # 在工具指南之后，因为 CLAUDE.md 的优先级低于内置规则
    # 但高于 skills/commands（CLAUDE.md 是用户意图，skills 是能力）
    claude_md_entries = load_claude_md()
    claude_md_prompt = format_claude_md_prompt(claude_md_entries)
    if claude_md_prompt:
        components.append(claude_md_prompt)

    # 8. Skills 摘要（Layer 1 of progressive disclosure）
    skills_prompt = get_skills_prompt(skills)
    if skills_prompt:
        components.append(skills_prompt)

    # 9. Commands 列表
    commands_prompt = get_commands_prompt(commands)
    if commands_prompt:
        components.append(commands_prompt)

    # 拼接：双换行分隔，filter 掉空字符串
    return "\n\n".join(filter(None, components))


def build_system_reminder() -> str:
    """生成 per-turn 动态信息，作为 system-reminder 注入。

    这些信息每轮可能变化，不放 system prompt（避免 KV cache 失效）。
    调用时机：每次构建 user message 时追加。

    注入方式（在 agent loop 里）：
        reminder = build_system_reminder()
        user_msg = f"{user_input}\n{reminder}"

    为什么用 <system-reminder> 标签：
        和 CC 一致。模型认识这个标签，知道这是系统注入的元信息，
        不是用户说的话。这很重要 — 避免模型把日期当成用户指令。
    """
    parts = []

    # 当前日期（模型训练截止日期之后的日期它不知道）
    today = datetime.now().strftime("%Y-%m-%d")
    parts.append(f"Today's date is {today}.")

    if not parts:
        return ""

    inner = "\n".join(parts)
    return f"<system-reminder>\n{inner}\n</system-reminder>"
