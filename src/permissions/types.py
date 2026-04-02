"""Permission types and enums."""

from enum import Enum


class PermissionLevel(Enum):
    """Three-tier permission level for tool operations.

    AUTO — Execute without asking. Read-only ops within project directory.
    ASK  — Prompt user for y/n confirmation. Write/edit ops.
    DENY — Block unless user explicitly requested this action.
           Destructive ops, out-of-boundary access, system modifications.
    """
    AUTO = "auto"
    ASK = "ask"
    DENY = "deny"


class PermissionMode(Enum):
    """Global permission mode, set at startup via --mode flag.

    NORMAL — L1 auto, L2 asks, L3 denied.
    AUTO   — L1+L2 auto, L3 still asks.
    YOLO   — Everything auto EXCEPT bypass-immune checks.
    """
    NORMAL = "normal"
    AUTO = "auto"
    YOLO = "yolo"
