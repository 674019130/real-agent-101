"""Skill & Command loader: progressive disclosure system.

# Directory structure:
#
#   .agent/skills/           ← skill 存放目录
#   ├── frontend-design.md   ← 一个 skill 一个 markdown 文件
#   ├── code-review.md
#   └── translate.md
#
#   .agent/commands/          ← command 存放目录
#   ├── commit.md            ← /commit 快捷命令
#   └── deploy.md
#
# Skill 文件格式 (Markdown + YAML front matter):
#
#   ---
#   name: frontend-design
#   description: Create distinctive frontend interfaces with high design quality
#   ---
#
#   (下面是 skill 正文，只在被调用时才加载)
#
#   When building frontend interfaces, follow these principles...
#
# Command 文件格式同理，但没有渐进式披露——调用时直接全文展开。

# 两层渐进式披露:
#
#   Layer 1 (系统提示词，始终存在):
#     只注入 name + description 列表
#     → 每个 skill ~50 tokens，10 个 skill ~500 tokens
#
#   Layer 2 (按需加载):
#     用户输入 /skill-name 或模型通过 Skill 工具调用时
#     → 加载完整正文到上下文（可能 2,000+ tokens）
#
# 为什么不一开始全部加载:
#   - 10 个 skill 每个 2K tokens = 20K tokens 的系统提示词
#   - 大部分 skill 在一次对话中用不到
#   - 只加载摘要 (500 tokens) vs 全部正文 (20K tokens) = 40x 节省
"""

import os
import re
from dataclasses import dataclass

# ── 目录配置 ──

SKILLS_DIR = ".agent/skills"
COMMANDS_DIR = ".agent/commands"


# ── 数据结构 ──

@dataclass
class SkillMeta:
    """Skill 的元数据（从 front matter 解析）。

    name 和 description 始终在系统提示词中。
    body 只在被调用时加载。
    """
    name: str           # skill 标识符，也是调用名
    description: str    # 一句话描述，给模型看的
    file_path: str      # 文件路径，用于按需加载 body


@dataclass
class CommandMeta:
    """Command 的元数据。

    和 Skill 的区别：
    - Command 只能用户显式调用 (/commit)
    - 没有渐进式披露——调用时直接全文展开为用户消息
    """
    name: str
    description: str
    file_path: str


# ── Front Matter 解析 ──

def _parse_front_matter(content: str) -> tuple[dict, str]:
    """解析 Markdown 文件的 YAML front matter。

    格式：
        ---
        name: xxx
        description: xxx
        ---
        正文内容

    返回: (front_matter_dict, body_text)

    为什么不用 yaml 库:
        front matter 只有 name 和 description 两个字段，
        简单的正则就够了，不需要引入 pyyaml 依赖。
    """
    # 匹配 --- 开头和结尾包围的 front matter 块
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)', content, re.DOTALL)
    if not match:
        return {}, content

    front_matter_text = match.group(1)
    body = match.group(2)

    # 逐行解析 key: value
    meta = {}
    for line in front_matter_text.strip().split('\n'):
        line = line.strip()
        if ':' in line:
            key, _, value = line.partition(':')
            meta[key.strip()] = value.strip()

    return meta, body


# ── Skill 加载 ──

def scan_skills() -> list[SkillMeta]:
    """扫描 skills 目录，提取所有 skill 的元数据。

    只读取 front matter（name + description），不读 body。
    这是渐进式披露的 Layer 1：轻量扫描。

    返回: SkillMeta 列表
    """
    skills = []

    if not os.path.isdir(SKILLS_DIR):
        return skills

    for filename in sorted(os.listdir(SKILLS_DIR)):
        if not filename.endswith('.md'):
            continue

        file_path = os.path.join(SKILLS_DIR, filename)
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except OSError:
            continue

        meta, _ = _parse_front_matter(content)

        # name 默认使用文件名（去掉 .md）
        name = meta.get('name', filename[:-3])
        description = meta.get('description', '')

        if not description:
            continue  # 没有 description 的 skill 不注册（模型无法判断何时使用）

        skills.append(SkillMeta(
            name=name,
            description=description,
            file_path=file_path,
        ))

    return skills


def load_skill_body(skill: SkillMeta) -> str:
    """加载 skill 的完整正文。

    这是渐进式披露的 Layer 2：按需加载。
    只在用户调用 /skill-name 或模型通过 Skill 工具触发时调用。

    返回: skill 正文（不含 front matter）
    """
    try:
        with open(skill.file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except OSError:
        return f"Error: cannot read skill file '{skill.file_path}'"

    _, body = _parse_front_matter(content)
    return body.strip()


# ── Command 加载 ──

def scan_commands() -> list[CommandMeta]:
    """扫描 commands 目录，提取所有 command 的元数据。

    和 scan_skills 逻辑相同，但 command 没有渐进式披露。
    """
    commands = []

    if not os.path.isdir(COMMANDS_DIR):
        return commands

    for filename in sorted(os.listdir(COMMANDS_DIR)):
        if not filename.endswith('.md'):
            continue

        file_path = os.path.join(COMMANDS_DIR, filename)
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except OSError:
            continue

        meta, _ = _parse_front_matter(content)
        name = meta.get('name', filename[:-3])
        description = meta.get('description', '')

        commands.append(CommandMeta(
            name=name,
            description=description,
            file_path=file_path,
        ))

    return commands


def load_command_body(command: CommandMeta) -> str:
    """加载 command 的完整正文。

    Command 被调用时直接全文展开为用户消息。
    没有渐进式——因为 command 只在用户主动输入 /xxx 时触发，
    不需要模型自己判断。
    """
    try:
        with open(command.file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except OSError:
        return f"Error: cannot read command file '{command.file_path}'"

    _, body = _parse_front_matter(content)
    return body.strip()


# ── 系统提示词注入 ──

def get_skills_prompt(skills: list[SkillMeta]) -> str:
    """生成 skills 的系统提示词段落。

    只包含 name + description（Layer 1）。
    全文（Layer 2）通过 Skill 工具按需加载。

    输出格式:
        # Available Skills
        Use the Skill tool to invoke a skill by name.

        - frontend-design: Create distinctive frontend interfaces...
        - code-review: Review code for quality and security...
    """
    if not skills:
        return ""

    lines = [
        "# Available Skills",
        "Use the Skill tool to invoke a skill by name.",
        "",
    ]
    for skill in skills:
        lines.append(f"- {skill.name}: {skill.description}")

    return "\n".join(lines)


def get_commands_prompt(commands: list[CommandMeta]) -> str:
    """生成 commands 的系统提示词段落。

    告诉模型有哪些可用的 slash commands。

    输出格式:
        # Available Commands
        - /commit: Commit changes with a good message
        - /deploy: Deploy to production
    """
    if not commands:
        return ""

    lines = [
        "# Available Commands",
        "",
    ]
    for cmd in commands:
        desc = f": {cmd.description}" if cmd.description else ""
        lines.append(f"- /{cmd.name}{desc}")

    return "\n".join(lines)
