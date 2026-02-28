"""Tests for router.py — pure functions, no Ollama needed."""

import sys
from pathlib import Path

# Add project root to path so we can import router directly
sys.path.insert(0, str(Path(__file__).parent.parent))

from router import route, URGENT_KEYWORDS, URGENT_PATTERNS


MODEL = "test-model:7b"


class TestUrgentPatterns:
    """Phrase-based urgent detection."""

    def test_exact_pattern_match(self):
        result = route("I'm bleeding badly", MODEL)
        assert result["is_urgent"] is True
        assert "pattern" in result["reason"].lower()

    def test_pattern_case_insensitive(self):
        result = route("I'M TRAPPED in the building", MODEL)
        assert result["is_urgent"] is True

    def test_pattern_embedded_in_sentence(self):
        result = route("Please help, I think I broke my leg", MODEL)
        assert result["is_urgent"] is True

    def test_all_patterns_are_lowercase(self):
        for p in URGENT_PATTERNS:
            assert p == p.lower(), f"Pattern should be lowercase: {p}"


class TestUrgentKeywords:
    """Keyword density detection."""

    def test_two_keywords_triggers_urgent(self):
        result = route("bleeding wound on my arm", MODEL)
        assert result["is_urgent"] is True
        assert "keywords" in result["reason"].lower()

    def test_single_strong_keyword(self):
        result = route("earthquake", MODEL)
        assert result["is_urgent"] is True
        assert "strong" in result["reason"].lower()

    def test_single_weak_keyword_not_urgent(self):
        # "help" is in URGENT_KEYWORDS but not in strong_signals
        result = route("help", MODEL)
        assert result["is_urgent"] is False

    def test_no_keywords_not_urgent(self):
        result = route("how do I purify water", MODEL)
        assert result["is_urgent"] is False


class TestModelPassthrough:
    """The router should pass the model name through unchanged."""

    def test_model_in_urgent_result(self):
        result = route("I'm bleeding", MODEL)
        assert result["model"] == MODEL

    def test_model_in_general_result(self):
        result = route("how to build a shelter", MODEL)
        assert result["model"] == MODEL

    def test_different_model_name(self):
        result = route("hello", "llama3:8b")
        assert result["model"] == "llama3:8b"


class TestReturnStructure:
    """Every result should have the expected keys."""

    def test_urgent_result_keys(self):
        result = route("I'm trapped", MODEL)
        assert set(result.keys()) == {"model", "is_urgent", "reason"}

    def test_general_result_keys(self):
        result = route("how to tie a bowline", MODEL)
        assert set(result.keys()) == {"model", "is_urgent", "reason"}


class TestEdgeCases:

    def test_empty_message(self):
        result = route("", MODEL)
        assert result["is_urgent"] is False

    def test_whitespace_only(self):
        result = route("   ", MODEL)
        assert result["is_urgent"] is False

    def test_general_knowledge_query(self):
        result = route("What plants can I eat in the forest?", MODEL)
        assert result["is_urgent"] is False
        assert "general" in result["reason"].lower()
