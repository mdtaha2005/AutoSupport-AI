import re
from typing import List, Tuple
from ..schemas.response import SentimentResult

# Sentiment Lexicons tuned for customer support
POSITIVE_WORDS = {
    "great", "excellent", "good", "wonderful", "amazing", "love", "helpful",
    "pleased", "thank", "thanks", "resolved", "awesome", "perfect", "appreciate",
    "satisfied", "fast", "smooth", "happy", "best"
}

NEGATIVE_WORDS = {
    "broken", "terrible", "worst", "unacceptable", "fraud", "scam", "waste",
    "failed", "error", "horrible", "awful", "angry", "disappointed", "furious",
    "poor", "bad", "useless", "ridiculous", "delayed", "missing", "crash",
    "lost", "double", "declined", "unauthorized", "locked", "timeout", "bug"
}

URGENCY_KEYWORDS = {
    "immediately", "urgent", "emergency", "asap", "critical", "lawyer",
    "attorney", "chargeback", "police", "right now", "escalate", "unacceptable",
    "today", "now", "deadline", "press charges"
}

INTENSIFIERS = {
    "very", "extremely", "totally", "completely", "really", "so", "absolutely"
}

class SentimentAnalyzer:
    def __init__(self):
        self.urgency_regex = re.compile(
            r"\b(" + "|".join(re.escape(w) for w in URGENCY_KEYWORDS) + r")\b",
            re.IGNORECASE
        )

    def analyze(self, text: str) -> SentimentResult:
        """
        Computes sentiment polarity score in [-1.0, 1.0], label (POSITIVE, NEUTRAL, NEGATIVE),
        and detects urgent customer signals.
        """
        words = re.findall(r"\b\w+\b", text.lower())
        
        pos_score = 0.0
        neg_score = 0.0
        
        i = 0
        while i < len(words):
            word = words[i]
            multiplier = 1.0

            # Check for intensifiers before the word
            if i > 0 and words[i - 1] in INTENSIFIERS:
                multiplier = 1.5

            # Check for negation before the word (e.g., "not good")
            is_negated = i > 0 and words[i - 1] in {"not", "never", "cannot", "no"}

            if word in POSITIVE_WORDS:
                if is_negated:
                    neg_score += 1.0 * multiplier
                else:
                    pos_score += 1.0 * multiplier
            elif word in NEGATIVE_WORDS:
                if is_negated:
                    pos_score += 0.5 * multiplier
                else:
                    neg_score += 1.2 * multiplier

            i += 1

        total_words = max(len(words), 1)
        # Compute normalized score between -1.0 and 1.0
        diff = pos_score - neg_score
        total_valence = pos_score + neg_score

        if total_valence == 0:
            score = 0.0
            label = "NEUTRAL"
        else:
            score = max(-1.0, min(1.0, diff / max(total_valence, 1.0)))
            if score > 0.15:
                label = "POSITIVE"
            elif score < -0.15:
                label = "NEGATIVE"
            else:
                label = "NEUTRAL"

        # Detect urgency keywords
        urgency_matches = list(set(self.urgency_regex.findall(text)))
        urgency_detected = len(urgency_matches) > 0 or score < -0.6

        return SentimentResult(
            label=label,
            score=round(score, 3),
            urgency_detected=urgency_detected,
            urgency_keywords=urgency_matches,
        )

sentiment_analyzer = SentimentAnalyzer()
