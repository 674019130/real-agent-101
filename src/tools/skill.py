"""Skill tool: model-invoked skill loading (Layer 2 of progressive disclosure).

# 渐进式披露的实现:
#
#   系统提示词里有:
#     "- frontend-design: Create distinctive frontend interfaces..."
#
#   模型看到用户说 "帮我设计一个页面"，判断需要 frontend-design skill
#   → 调用 Skill 工具: {"skill": "frontend-design"}
#   → Skill 工具加载完整正文，返回给模型
#   → 模型基于 skill 正文内容执行任务
#
# 为什么是一个工具而不是自动加载:
#   - 模型决定何时需要哪个 skill（不是客户端猜测）
#   - 只在需要时占用上下文（省 token）
#   - 和 Claude Code 的 Skill 工具设计一致
"""

from src.types import Tool
from src.permissions.types import PermissionLevel
from src.skills.loader import SkillMeta, load_skill_body


class SkillTool(Tool):
    """供模型调用的 Skill 加载工具。

    模型在系统提示词中看到 skill 列表（name + description），
    认为需要某个 skill 时调用此工具加载完整正文。
    """

    def __init__(self, skills: list[SkillMeta]):
        """接收扫描到的 skill 列表。

        Args:
            skills: scan_skills() 的结果，包含所有已注册 skill 的元数据
        """
        # 建索引：name → SkillMeta，O(1) 查找
        self._skills = {s.name: s for s in skills}

    @property
    def name(self) -> str:
        return "skill"

    @property
    def description(self) -> str:
        # 这个 description 本身就是 prompt engineering（策略定义型）：
        # 告诉模型什么时候该用这个工具、怎么用
        return (
            "Load a skill by name to get detailed instructions. "
            "Use this when a user's request matches an available skill, "
            "or when you need specialized guidance for a task. "
            "Available skills are listed in your system prompt."
        )

    @property
    def input_schema(self) -> dict:
        # enum 约束：模型只能传已注册的 skill 名
        # 这比在 description 里写"只能用这些名字"更有效（L03 讨论过）
        return {
            "type": "object",
            "properties": {
                "skill": {
                    "type": "string",
                    "enum": list(self._skills.keys()),
                    "description": "The skill name to load.",
                },
            },
            "required": ["skill"],
        }

    @property
    def is_concurrent_safe(self) -> bool:
        # 纯读操作：加载文件内容，不修改任何状态
        return True

    def check_permission(self, **_) -> tuple[PermissionLevel, bool]:
        # Skill 加载永远自动通过：
        # - 只是读文件，没有副作用
        # - 如果每次加载都要用户确认，渐进式披露就没意义了
        return PermissionLevel.AUTO, False

    async def execute(self, skill: str = "", **_) -> str:
        """加载 skill 的完整正文。

        返回给模型的内容会被 append 到 messages 中，
        模型在后续对话中就能基于 skill 正文工作。
        """
        if not skill:
            return "Error: 'skill' is required. Provide the skill name to load."

        meta = self._skills.get(skill)
        if not meta:
            # actionable error：列出可用的 skill
            available = ", ".join(self._skills.keys())
            return (
                f"Error: skill '{skill}' not found. "
                f"Available skills: {available}"
            )

        body = load_skill_body(meta)

        if not body:
            return f"Error: skill '{skill}' has no content."

        # 返回格式：skill 名 + 正文
        # 模型收到后知道这是 skill 的指令内容
        return f"# Skill: {meta.name}\n\n{body}"
