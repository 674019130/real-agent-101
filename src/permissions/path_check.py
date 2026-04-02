"""Path boundary checking: is a path within the project directory?"""

import os

# Paths that are ALWAYS denied, even in yolo mode (bypass-immune)
BYPASS_IMMUNE_PATTERNS = [
    ".git/",          # git internals
    ".env",           # environment secrets
    ".ssh/",          # SSH keys
    ".gnupg/",        # GPG keys
    ".aws/",          # AWS credentials
    ".kube/",         # Kubernetes configs
]

# Sensitive files that trigger DENY even within project
SENSITIVE_FILES = [
    ".env",
    ".env.local",
    ".env.production",
    "credentials.json",
    "secrets.yaml",
    "id_rsa",
    "id_ed25519",
]


def is_within_project(file_path: str, project_dir: str) -> bool:
    """Check if file_path is within the project directory.
    Resolves symlinks to prevent escape."""
    resolved = os.path.realpath(os.path.abspath(file_path))
    project = os.path.realpath(os.path.abspath(project_dir))
    return resolved.startswith(project + os.sep) or resolved == project


def is_bypass_immune(file_path: str) -> bool:
    """Check if a path matches bypass-immune patterns.
    These are ALWAYS denied, even in yolo mode."""
    normalized = file_path.replace("\\", "/")
    for pattern in BYPASS_IMMUNE_PATTERNS:
        if pattern in normalized:
            return True
    return False


def is_sensitive_file(file_path: str) -> bool:
    """Check if a file is a known sensitive file."""
    basename = os.path.basename(file_path)
    return basename in SENSITIVE_FILES
