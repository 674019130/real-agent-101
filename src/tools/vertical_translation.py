"""Vertical scenario: Translation Agent tools (pseudocode).

These tools demonstrate how a vertical/domain-specific agent differs from
a general-purpose agent. The tools are business-level (translation-specific)
rather than infrastructure-level (filesystem/process).

NOT real implementations — pseudocode for L03 discussion.
"""

from src.types import Tool


class TranslateTool(Tool):
    """Atomic translation: one chunk of text at a time."""

    @property
    def name(self) -> str:
        return "translate"

    @property
    def description(self) -> str:
        return (
            "Translate a piece of text from source language to target language. "
            "Follow the project's style guide for consistent terminology. "
            "Keep paragraphs intact. Preserve formatting markers."
        )

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "source_text": {"type": "string", "description": "Text to translate."},
                "source_lang": {"type": "string", "enum": ["en", "zh", "ja", "ko", "fr", "de", "es"]},
                "target_lang": {"type": "string", "enum": ["en", "zh", "ja", "ko", "fr", "de", "es"]},
            },
            "required": ["source_text", "source_lang", "target_lang"],
        }

    @property
    def is_concurrent_safe(self) -> bool:
        return True  # stateless translation

    async def execute(self, source_text: str = "", source_lang: str = "", target_lang: str = "", **_) -> str:
        # PSEUDOCODE:
        # 1. Load style guide for target_lang from project config
        # 2. Call translation API / LLM with style constraints
        # 3. Post-process: apply terminology dictionary replacements
        # 4. Return translated text
        raise NotImplementedError("Pseudocode — not a real implementation")


class ProgressTrackerTool(Tool):
    """Track translation progress across sessions. Enables resume-from-checkpoint."""

    @property
    def name(self) -> str:
        return "translation_progress"

    @property
    def description(self) -> str:
        return (
            "Track and query translation progress. "
            "Use 'get' to see where we left off. Use 'update' after completing a section. "
            "Progress persists across sessions."
        )

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["get", "update"]},
                "chapter": {"type": "integer", "description": "Chapter number."},
                "page": {"type": "integer", "description": "Page number within chapter."},
                "status": {"type": "string", "enum": ["not_started", "in_progress", "review", "done"]},
            },
            "required": ["action"],
        }

    @property
    def is_concurrent_safe(self) -> bool:
        return False  # modifies persistent state

    async def execute(self, action: str = "", **params) -> str:
        # PSEUDOCODE:
        # State stored in .translation/progress.json:
        # {
        #   "book": "some_book.txt",
        #   "total_chapters": 12,
        #   "chapters": {
        #     "1": {"pages_done": 15, "total_pages": 20, "status": "in_progress"},
        #     "2": {"pages_done": 0, "total_pages": 18, "status": "not_started"},
        #   }
        # }
        #
        # On "get": return current progress summary
        # On "update": mark chapter/page as done, save to disk
        # On agent startup: load progress.json, inject summary into system prompt
        raise NotImplementedError("Pseudocode — not a real implementation")


class StyleGuideTool(Tool):
    """Manage translation style consistency: terminology, tone, formatting rules."""

    @property
    def name(self) -> str:
        return "style_guide"

    @property
    def description(self) -> str:
        return (
            "Query or update the translation style guide. "
            "Use 'get' to retrieve current style rules and terminology. "
            "Use 'add_term' to add a new term mapping. "
            "Always check the style guide before translating a new chapter."
        )

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["get", "add_term"]},
                "source_term": {"type": "string", "description": "Original term (for add_term)."},
                "target_term": {"type": "string", "description": "Translated term (for add_term)."},
                "category": {"type": "string", "enum": ["terminology", "tone", "formatting"]},
            },
            "required": ["action"],
        }

    @property
    def is_concurrent_safe(self) -> bool:
        return False

    async def execute(self, action: str = "", **params) -> str:
        # PSEUDOCODE:
        # Style guide stored in .translation/style.json:
        # {
        #   "tone": "formal, third person",
        #   "terminology": {
        #     "agent": "智能体",
        #     "context window": "上下文窗口",
        #     "prompt engineering": "提示工程"
        #   },
        #   "formatting": [
        #     "Preserve code blocks unchanged",
        #     "Use full-width punctuation for Chinese",
        #     "Keep proper nouns in original language"
        #   ]
        # }
        #
        # On "get": return full style guide as formatted text
        # On "add_term": add to terminology dict, save to disk
        raise NotImplementedError("Pseudocode — not a real implementation")
