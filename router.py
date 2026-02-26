"""
Router — classifies queries as urgent survival or general knowledge.
Urgent queries get a faster, more structured response.
All queries go to the same model.
"""

MODEL = "qwen3.5:35b-a3b"

# Keep these for backward compatibility with api.py imports
CODER_MODEL = MODEL
BASE_MODEL = MODEL

# Keywords that signal an urgent/active emergency
URGENT_KEYWORDS = {
    "bleeding", "blood", "broken", "fracture", "unconscious", "choking",
    "drowning", "hypothermia", "heatstroke", "heat stroke", "shock",
    "snake bite", "snakebite", "poisoned", "poison", "allergic", "anaphylaxis",
    "heart attack", "stroke", "seizure", "concussion",
    "fire", "wildfire", "flood", "earthquake", "tornado", "hurricane",
    "tsunami", "explosion", "collapse", "trapped", "buried",
    "gunshot", "wound", "stabbed", "burned", "burn",
    "cant breathe", "can't breathe", "not breathing",
    "lost", "stranded", "dehydrated", "starving",
    "radiation", "fallout", "contaminated",
    "help", "emergency", "dying", "danger", "urgent",
}

# Phrases that strongly indicate an active emergency
URGENT_PATTERNS = [
    "i'm hurt",
    "i am hurt",
    "i'm injured",
    "i am injured",
    "i'm bleeding",
    "someone is hurt",
    "need help now",
    "what do i do",
    "i think i broke",
    "i've been bitten",
    "i've been stung",
    "there's a fire",
    "water is rising",
    "i'm trapped",
    "i'm lost",
    "can't find my way",
    "running out of water",
    "no food left",
    "how do i stop the bleeding",
    "is this safe to eat",
    "is this safe to drink",
]


def route(message: str) -> dict:
    """
    Classify the query as urgent survival or general knowledge.

    Returns:
        dict with 'model', 'is_code' (repurposed as 'is_urgent'), and 'reason'
    """
    lower = message.lower().strip()

    # Check for urgent phrases
    for pattern in URGENT_PATTERNS:
        if pattern in lower:
            return {
                "model": MODEL,
                "is_code": True,  # repurposed: True = urgent, triggers review pass
                "reason": f"Urgent pattern: '{pattern}'",
            }

    # Check for urgent keyword density
    words = set(lower.split())
    matches = words & URGENT_KEYWORDS
    if len(matches) >= 2:
        return {
            "model": MODEL,
            "is_code": True,
            "reason": f"Urgent keywords: {matches}",
        }

    # Single strong urgent keyword
    if len(matches) == 1:
        keyword = matches.pop()
        strong_signals = {
            "bleeding", "choking", "drowning", "unconscious", "trapped",
            "earthquake", "tornado", "wildfire", "tsunami", "explosion",
            "emergency", "dying", "radiation", "fallout",
        }
        if keyword in strong_signals:
            return {
                "model": MODEL,
                "is_code": True,
                "reason": f"Strong urgent keyword: '{keyword}'",
            }

    # Default: general knowledge query
    return {
        "model": MODEL,
        "is_code": False,
        "reason": "General survival knowledge query",
    }
