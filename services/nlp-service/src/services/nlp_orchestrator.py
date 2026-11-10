from datetime import datetime, timezone
from typing import Optional
from .normalizer import normalizer
from .classifier import category_classifier
from .intent_detector import intent_detector
from .ner_extractor import entity_extractor
from .sentiment_analyzer import sentiment_analyzer
from .priority_predictor import priority_predictor
from .review_flagger import review_flagger
from ..schemas.request import TicketProcessRequest
from ..schemas.response import TicketProcessResponse

class NlpOrchestrator:
    def process_ticket(self, request: TicketProcessRequest) -> TicketProcessResponse:
        # 1. Combine title and description for holistic text representation
        combined_raw = f"{request.title}. {request.description}".strip()

        # 2. Text Normalization
        clean_text = normalizer.normalize(combined_raw)

        # 3. Category Classification (TF-IDF + Logistic Regression)
        category_pred = category_classifier.predict(clean_text)

        # 4. Intent Detection
        intent_pred = intent_detector.detect_intent(clean_text, category_pred.label)

        # 5. Entity Extraction (NER + regex)
        entities = entity_extractor.extract_entities(combined_raw)

        # 6. Sentiment & Urgency Analysis
        sentiment = sentiment_analyzer.analyze(combined_raw)

        # 7. Priority Prediction (Multi-factor weighting)
        priority = priority_predictor.predict(
            category=category_pred.label,
            category_confidence=category_pred.confidence,
            sentiment=sentiment,
            entities=entities
        )

        # 8. Human Review Flagging
        review_flag = review_flagger.evaluate(
            category=category_pred.label,
            category_confidence=category_pred.confidence,
            probabilities=category_pred.probabilities,
            normalized_text=clean_text
        )

        return TicketProcessResponse(
            ticket_id=request.ticket_id,
            category=category_pred,
            intent=intent_pred,
            priority=priority,
            sentiment=sentiment,
            entities=entities,
            human_review=review_flag,
            normalized_text=clean_text,
            processed_at=datetime.now(timezone.utc).isoformat(),
        )

nlp_orchestrator = NlpOrchestrator()
