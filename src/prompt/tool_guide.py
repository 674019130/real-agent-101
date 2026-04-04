"""Tool usage guidelines: strategy-definition prompts.

# 这是纯粹的策略定义型 prompt engineering:
#
#   工具的 schema 告诉模型工具"能做什么"（能力补偿型）。
#   Tool guide 告诉模型"什么时候该用什么"（策略定义型）。
#
#   没有 tool guide 的后果：
#     - 模型用 bash 的 cat 读文件（应该用 file_read）
#     - 模型用 bash 的 grep 搜索（应该用专门的搜索工具）
#     - 模型用 bash 的 sed 编辑文件（应该用 file_edit）
#     - 模型在不需要 bash 的场景下默认用 bash
#
#   CC 的 system prompt 里有大段这类指南：
#     "Do NOT use Bash to run grep when Grep tool is available"
#     "Use Read instead of cat, head, tail"
#     "Use Edit instead of sed or awk"
#
#   本质：模型有工具选择的自由度，但缺乏场景判断力。
#   Tool guide 补的是"判断力"，不是"能力"。

# 两种实现方式:
#
#   1. 硬编码（CC 的做法）：
#      在 system prompt 里写死一大段工具使用规则。
#      优点：精确控制措辞，可以针对常见错误写 case。
#      缺点：新增工具需要手动更新指南。
#
#   2. 从 registry 动态生成（我们的做法）：
#      基于注册的工具列表生成通用规则 + 工具特定规则。
#      优点：新工具自动有基本指南。
#      缺点：措辞不如手写精确。
#
#   我们选混合方案：通用规则硬编码 + 工具特定规则从 registry 生成。
"""

from src.tools.registry import ToolRegistry


# ── 通用规则（硬编码）──
# 这些是模型最容易犯的错误，需要明确纠正

GENERAL_RULES = """# Tool Usage Guidelines

IMPORTANT: Use dedicated tools instead of Bash when available.
- To read files: use file_read (NOT cat, head, tail, or bash)
- To edit files: use file_edit (NOT sed, awk, or bash)
- To write/create files: use file_write (NOT echo/cat with heredoc)
- To run shell commands: use bash (for system commands that need shell execution)

Reserve Bash exclusively for system commands and terminal operations.
If you are unsure and a dedicated tool exists, default to the dedicated tool.

When calling tools:
- Read a file before editing it (understand existing code first)
- Prefer editing existing files over creating new ones
- Do not add features or make changes beyond what was asked
- Be careful not to introduce security vulnerabilities"""


def _generate_tool_specific_rules(registry: ToolRegistry) -> str:
    """从 registry 的工具列表生成工具特定的使用提示。

    不是复述 schema（那是能力补偿型），
    而是补充"什么场景该用这个工具"（策略定义型）。
    """
    # 工具特定的策略提示（手写 > 自动生成）
    # key = tool name, value = usage hint
    tool_hints: dict[str, str] = {
        "bash": (
            "Use for: git commands, package management, running tests, "
            "system operations. NOT for: reading/writing/editing files."
        ),
        "file_read": (
            "Use for: reading file contents. Supports offset/limit for large files. "
            "Always read before editing."
        ),
        "file_edit": (
            "Use for: modifying existing files via old_string → new_string replacement. "
            "The old_string must be unique in the file."
        ),
        "file_write": (
            "Use for: creating new files or complete rewrites. "
            "Prefer file_edit for modifying existing files."
        ),
        "todo": (
            "Use for: tracking tasks during the conversation. "
            "List before adding to avoid duplicates."
        ),
        "sub_agent": (
            "Use for: complex subtasks that benefit from isolated context. "
            "The sub-agent inherits your tools but has its own message history."
        ),
        "web_search": (
            "Use for: finding current information not in your training data. "
            "Returns content snippets directly — no need to visit URLs afterward."
        ),
    }

    lines = ["\n# Tool-Specific Guidance\n"]
    for tool in registry.get_all_tools():
        hint = tool_hints.get(tool.name)
        if hint:
            lines.append(f"- **{tool.name}**: {hint}")

    return "\n".join(lines) if len(lines) > 1 else ""


def get_tool_guide(registry: ToolRegistry) -> str:
    """生成完整的工具使用指南。

    组合：
        1. 通用规则（硬编码，纠正常见错误）
        2. 工具特定规则（从 registry 生成 + 手写补充）

    返回: 格式化的指南文本，直接拼入 system prompt
    """
    parts = [GENERAL_RULES]

    tool_rules = _generate_tool_specific_rules(registry)
    if tool_rules:
        parts.append(tool_rules)

    return "\n".join(parts)
