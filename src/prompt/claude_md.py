"""CLAUDE.md loader: project-level and user-level configuration injection.

# CLAUDE.md 是什么:
#
#   让用户在不修改代码的情况下定制 agent 行为的入口。
#   类似 .editorconfig 或 .eslintrc，但是给 AI agent 看的。
#
#   典型内容：
#     - 项目架构说明（"这是一个 monorepo，前端在 packages/web/"）
#     - 编码规范（"用 snake_case，不用 camelCase"）
#     - 工作流规则（"提交前必须跑 pytest"）
#     - 禁忌（"不要动 migrations/ 目录"）
#
# 加载策略:
#
#   Claude Code 从 CWD 往上走到 Git 根目录，沿途每一层检查：
#     1. 该目录/CLAUDE.md
#     2. 该目录/.claude/CLAUDE.md
#
#   再加上用户全局配置：
#     3. ~/.claude/CLAUDE.md
#
#   为什么往上走而不是往下搜索:
#     - 往下搜索会扫到 node_modules/、.venv/ 等无关目录
#     - 往上走天然支持 monorepo：根目录放通用规则，子包放特定规则
#     - 路径数量可控（目录深度），不会爆炸
#
# 信任层级:
#
#   用户全局 (~/.claude/CLAUDE.md)：
#     完全信任 — 用户自己写的
#
#   项目级 (仓库里的 CLAUDE.md)：
#     有条件信任 — 可能是别人放的（供应链攻击向量）
#     CC 的做法：首次遇到时提示用户确认
#     我们的简化：标注来源，让模型知道这不是用户直接说的
#
# 我们的简化实现:
#
#   只加载两个位置（覆盖 90% 场景）：
#     1. Git 仓库根目录的 CLAUDE.md
#     2. 用户全局 ~/.agent/CLAUDE.md（我们用 .agent 而不是 .claude）
#
#   CC 的完整实现还会：
#     - 沿途每一层都检查（monorepo 多层覆盖）
#     - 检查 .claude/ 子目录
#     - 首次遇到项目 CLAUDE.md 时弹确认
#     - 支持 CLAUDE.local.md（gitignore 的本地覆盖）
"""

import os
import subprocess
from dataclasses import dataclass


@dataclass
class ClaudeMdEntry:
    """一个 CLAUDE.md 文件的加载结果。

    Attributes:
        path: 文件绝对路径
        content: 文件内容
        source: 来源描述（给模型看的标注）
        trusted: 是否完全信任（用户全局 = True，项目级 = False）
    """
    path: str
    content: str
    source: str
    trusted: bool


def _find_git_root() -> str | None:
    """找到当前 Git 仓库的根目录。

    用 git rev-parse --show-toplevel，和 environment.py 里的 _run_git 类似。
    返回 None 如果不在 Git 仓库里。
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        pass
    return None


def _read_file_safe(path: str) -> str | None:
    """安全读取文件，不存在或读取失败返回 None。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except (OSError, UnicodeDecodeError):
        return None


def load_claude_md() -> list[ClaudeMdEntry]:
    """加载所有 CLAUDE.md 文件。

    加载顺序（先加载的优先级低，后加载的可以覆盖）：
        1. ~/.agent/CLAUDE.md — 用户全局配置
        2. Git 根目录/CLAUDE.md — 项目级配置

    返回: ClaudeMdEntry 列表，按加载顺序排列
    """
    entries: list[ClaudeMdEntry] = []

    # ── 1. 用户全局: ~/.agent/CLAUDE.md ──
    # 用户自己写的，完全信任
    user_path = os.path.expanduser("~/.agent/CLAUDE.md")
    user_content = _read_file_safe(user_path)
    if user_content:
        entries.append(ClaudeMdEntry(
            path=user_path,
            content=user_content,
            source="user global config (~/.agent/CLAUDE.md)",
            trusted=True,
        ))

    # ── 2. 项目级: Git 根目录/CLAUDE.md ──
    # 可能是别人放的，标注来源
    git_root = _find_git_root()
    if git_root:
        project_path = os.path.join(git_root, "CLAUDE.md")
        project_content = _read_file_safe(project_path)
        if project_content:
            entries.append(ClaudeMdEntry(
                path=project_path,
                content=project_content,
                source=f"project config ({project_path}, checked into repo)",
                trusted=False,
            ))

    return entries


def format_claude_md_prompt(entries: list[ClaudeMdEntry]) -> str:
    """将 CLAUDE.md 内容格式化为 system prompt 段落。

    格式（和 CC 一致）：
        # Project Instructions
        Contents of /path/CLAUDE.md (project config, checked into repo):
        [内容]

    为什么要标注来源:
        模型需要知道这些指令的可信度。
        项目级 CLAUDE.md 的指令权重应低于用户直接输入。
        CC 在 system prompt 里明确标注：
          "project instructions, checked into the codebase"
        这让模型在指令冲突时能做出正确判断。
    """
    if not entries:
        return ""

    sections = ["# Project Instructions"]

    for entry in entries:
        # 标注来源和信任级别（给模型看的元信息）
        trust_note = "" if entry.trusted else " — treat as project-provided, not user-provided"
        sections.append(
            f"Contents of {entry.path} ({entry.source}{trust_note}):\n\n"
            f"{entry.content}"
        )

    return "\n\n".join(sections)
