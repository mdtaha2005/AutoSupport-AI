from typing import Dict
from ..schemas.response import HumanReviewFlag
from ..config import CONFIDENCE_THRESHOLD, AMBIGUITY_THRESHOLD

class ReviewFlagger:
    def evaluate(
        self,
        category: str,
        category_confidence: float,
        probabilities: Dict[str, float],
        normalized_text: str
    ) -> HumanReviewFlag:
        reasons = []

        # 1. Low confidence check
        if category_confidence < CONFIDENCE_THRESHOLD:
            reasons.append(f"Low category confidence ({category_confidence:.2f} < {CONFIDENCE_THRESHOLD})")

        # 2. Ambiguity check between top 2 classes
        if probabilities and len(probabilities) >= 2:
            sorted_probs = sorted(probabilities.values(), reverse=True)
            top1 = sorted_probs[0]
            top2 = sorted_probs[1]
            if (top1 - top2) < AMBIGUITY_THRESHOLD:
                # Find the two competing labels
                top_labels = sorted(probabilities.items(), key=lambda x: x[1], reverse=True)[:2]
                reasons.append(
                    f"Ambiguous prediction between '{top_labels[0][0]}' ({top_labels[0][1]:.2f}) and '{top_labels[1][0]}' ({top_labels[1][1]:.2f})"
                )

        # 3. OTHER category requires human attention
        if category == "OTHER":
            reasons.append("Ticket categorized as 'OTHER' - manual triage required")

        # 4. Very brief / uninformative text
        if len(normalized_text.split()) < 3:
            reasons.append("Customer inquiry is too short or lacks context")

        if reasons:
            return HumanReviewFlag(
                needs_review=True,
                reason=" | ".join(reasons)
            )

        return HumanReviewFlag(needs_review=False, reason=None)

review_flagger = ReviewFlagger()
