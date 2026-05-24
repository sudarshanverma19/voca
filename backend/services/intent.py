import re
from difflib import SequenceMatcher
from typing import Optional

# Explicit STT correction map — checked before fuzzy similarity
_CORRECTIONS: dict[str, list[str]] = {
    "extend": ["xtend", "exten", "extendd", "extand", "exted", "exend", "extende"],
    "completed": ["compelted", "completel", "complted", "completd", "compleated", "complete"],
    "skip": ["skp", "skiped", "skkip", "skipp"],
}

_KEYWORDS = ["extend", "completed", "skip"]

# For multi-word text that bypasses per-word normalization
_EXTEND_VARIANTS = ("extend", "exted", "extand", "exten", "more time")


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def _correct_word(word: str) -> str:
    """Return the corrected keyword for a word, or the word unchanged."""
    # Explicit map first (O(1), no false positives)
    for keyword, variants in _CORRECTIONS.items():
        if word in variants:
            return keyword
    # Fuzzy fallback — only correct if confidence is high enough
    best = max(_KEYWORDS, key=lambda k: _similarity(word, k))
    if _similarity(word, best) >= 0.75:
        return best
    return word


def normalize_short_text(text: str) -> str:
    """
    For short input (≤2 words), apply per-word correction using explicit map
    then fuzzy similarity. Longer text is returned lowercased but uncorrected
    (multi-word intent parsing handles those via _EXTEND_VARIANTS).
    """
    words = text.lower().split()
    if len(words) > 2:
        return text.lower()
    return " ".join(_correct_word(w) for w in words)


def _extract_duration(text: str) -> Optional[int]:
    """Parse spoken duration into minutes. Handles hours, minutes, combinations."""
    hour_match = re.search(r'(\d+)\s*hour', text)
    min_match = re.search(r'(\d+)\s*min', text)
    if not hour_match and not min_match:
        return None
    hours = int(hour_match.group(1)) if hour_match else 0
    mins = int(min_match.group(1)) if min_match else 0
    total = hours * 60 + mins
    return total if total > 0 else None


def extract_intent(text: str) -> dict:
    """
    Returns {"intent", "duration", "low_confidence"}.
    low_confidence=True when a single spoken word doesn't cleanly resolve to a command.
    """
    normalized = normalize_short_text(text)
    t = normalized.lower()
    words = t.split()
    duration = _extract_duration(t)

    # Single-word confidence gate: after normalization the word must be an exact keyword
    if len(words) == 1 and words[0] not in _KEYWORDS:
        return {"intent": None, "duration": None, "low_confidence": True}

    if "done" in t or "completed" in t:
        return {"intent": "completed", "duration": None, "low_confidence": False}
    if any(v in t for v in _EXTEND_VARIANTS):
        return {"intent": "extend", "duration": duration, "low_confidence": False}
    if "skip" in t:
        return {"intent": "skip", "duration": None, "low_confidence": False}

    return {"intent": None, "duration": duration, "low_confidence": False}
