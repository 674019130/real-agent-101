"""Environment info collection: gather system details on first startup.

Collects OS, shell, Python version, cwd, git info and caches to
.agent/environment.json. Re-collects when agent version changes.
"""

import json
import os
import platform
import subprocess
import sys

# Agent version from pyproject.toml — kept in sync manually
AGENT_VERSION = "0.1.0"

ENV_FILE = ".agent/environment.json"


def _run_git(args: list[str]) -> str | None:
    """Run a git command, return stdout or None on failure."""
    try:
        result = subprocess.run(
            ["git"] + args,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return None
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None


def _collect_static() -> dict:
    """Collect static info (rarely changes, safe to cache)."""
    return {
        "agent_version": AGENT_VERSION,
        "os_name": platform.system(),
        "os_version": platform.release(),
        "shell": os.environ.get("SHELL", "unknown"),
        "python_version": platform.python_version(),
    }


def _collect_dynamic() -> dict:
    """Collect dynamic info (changes per session, always fresh)."""
    return {
        "cwd": os.getcwd(),
        "git_branch": _run_git(["rev-parse", "--abbrev-ref", "HEAD"]),
        "git_user": _run_git(["config", "user.name"]),
    }


def _load_cached() -> dict | None:
    """Load cached environment info from disk. Returns None if missing or corrupt."""
    if not os.path.exists(ENV_FILE):
        return None
    try:
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def _save(info: dict) -> None:
    """Save environment info to disk."""
    os.makedirs(os.path.dirname(ENV_FILE), exist_ok=True)
    with open(ENV_FILE, "w", encoding="utf-8") as f:
        json.dump(info, f, indent=2, ensure_ascii=False)


def get_environment_info() -> dict:
    """Get environment info: static from cache, dynamic always fresh.

    Static (OS, Shell, Python version): cached, only re-collected on version change.
    Dynamic (cwd, git branch): collected every startup.
    """
    cached = _load_cached()

    if cached and cached.get("agent_version") == AGENT_VERSION:
        static = {k: cached[k] for k in ("agent_version", "os_name", "os_version", "shell", "python_version") if k in cached}
    else:
        static = _collect_static()

    dynamic = _collect_dynamic()
    info = {**static, **dynamic}
    _save(info)
    return info


def get_environment_prompt() -> str:
    """Format environment info for system prompt injection.

    Returns a human-readable block suitable for embedding in the
    system prompt so the model knows about the runtime environment.
    """
    info = get_environment_info()

    lines = [
        "# Environment",
        f"- OS: {info['os_name']} {info['os_version']}",
        f"- Shell: {info['shell']}",
        f"- Python: {info['python_version']}",
        f"- Working directory: {info['cwd']}",
    ]

    if info.get("git_branch"):
        lines.append(f"- Git branch: {info['git_branch']}")
    if info.get("git_user"):
        lines.append(f"- Git user: {info['git_user']}")

    lines.append(f"- Agent version: {info['agent_version']}")

    return "\n".join(lines)


def get_git_status_snapshot() -> str:
    """获取 Git 仓库的启动时快照。

    CC 在对话开始时注入一段 gitStatus，包含：
      - 当前 branch
      - git status（工作区变更）
      - 最近 5 条 commit

    标注为 "snapshot in time" — 告诉模型这是启动时的状态，
    对话过程中如果 agent 执行了 git 操作，这个快照不会更新。
    模型需要自己通过 bash 工具获取最新状态。

    返回: 格式化的 git 快照文本，空字符串如果不在 git 仓库里
    """
    # 先确认是否在 git 仓库里
    branch = _run_git(["rev-parse", "--abbrev-ref", "HEAD"])
    if not branch:
        return ""

    lines = [
        "# Git Status (snapshot at conversation start, will not auto-update)",
        f"Current branch: {branch}",
    ]

    # git status --short: 简洁的工作区变更列表
    # 不用 -uall（CC 也不用 — 大仓库会很慢）
    status = _run_git(["status", "--short"])
    if status:
        lines.append(f"\nChanges:\n{status}")
    else:
        lines.append("\nWorking tree: clean")

    # 最近 5 条 commit（给模型上下文：最近在做什么）
    log = _run_git(["log", "--oneline", "-5"])
    if log:
        lines.append(f"\nRecent commits:\n{log}")

    return "\n".join(lines)
