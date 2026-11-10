import re
from typing import List
from ..schemas.response import PriorityPrediction, ExtractedEntity, SentimentResult
from ..config import HIGH_VALUE_THRESHOLD

CATEGORY_BASE_PRIORITY = {
    "PAYMENT": "HIGH",
    "ACCOUNT": "HIGH",
    "TECHNICAL": "HIGH",
    "REFUND": "MEDIUM",
    "DELIVERY": "MEDIUM",
    "PRODUCT": "LOW",
    "OTHER": "LOW",
}

PRIORITY_LEVELS = ["LOW", "MEDIUM", "HIGH", "URGENT"]

class PriorityPredictor:
    def predict(
        self,
        category: str,
        category_confidence: float,
        sentiment: SentimentResult,
        entities: List[ExtractedEntity]
    ) -> PriorityPrediction:
        base_priority = CATEGORY_BASE_PRIORITY.get(category, "MEDIUM")
        current_index = PRIORITY_LEVELS.index(base_priority)
        reasons = [f"Base category '{category}' mapped to {base_priority}"]

        # 1. Escalation check: Urgent keywords or strong negative sentiment
        if sentiment.urgency_detected:
            current_index = min(len(PRIORITY_LEVELS) - 1, current_index + 1)
            reasons.append("Urgency signals or keywords detected")
        elif sentiment.score <= -0.5:
            current_index = min(len(PRIORITY_LEVELS) - 1, current_index + 1)
            reasons.append("Strongly negative customer sentiment detected")

        # 2. Escalation check: High monetary amount (> $250)
        has_high_value = False
        for ent in entities:
            if ent.type == "AMOUNT":
                # Extract numeric value
                num_match = re.search(r"(\d+(?:\.\d+)?)", ent.value)
                if num_match:
                    try:
                        val = float(num_match.group(1))
                        if val >= HIGH_VALUE_THRESHOLD:
                            has_high_value = True
                            reasons.append(f"High transaction amount ({ent.value}) exceeds ${HIGH_VALUE_THRESHOLD}")
                            break
                    except ValueError:
                        pass

        if has_high_value:
            current_index = min(len(PRIORITY_LEVELS) - 1, current_index + 1)

        final_priority = PRIORITY_LEVELS[current_index]

        # Calculate confidence
        confidence = round(min(0.95, max(0.65, category_confidence * 0.9 + 0.1)), 2)

        return PriorityPrediction(
            label=final_priority,
            confidence=confidence,
            reason="; ".join(reasons)
        )

priority_predictor = PriorityPredictor()
