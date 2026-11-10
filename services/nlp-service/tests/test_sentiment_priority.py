import pytest
from src.services.sentiment_analyzer import sentiment_analyzer
from src.services.priority_predictor import priority_predictor
from src.services.review_flagger import review_flagger
from src.schemas.response import ExtractedEntity

def test_sentiment_negative_and_urgent():
    text = "URGENT: This is completely unacceptable, my money was stolen and I will contact a lawyer immediately!"
    res = sentiment_analyzer.analyze(text)
    assert res.label == "NEGATIVE"
    assert res.score < 0
    assert res.urgency_detected is True
    assert "urgent" in [k.lower() for k in res.urgency_keywords] or "immediately" in [k.lower() for k in res.urgency_keywords]

def test_sentiment_positive():
    text = "Thank you so much! The support was wonderful and everything is resolved perfectly."
    res = sentiment_analyzer.analyze(text)
    assert res.label == "POSITIVE"
    assert res.score > 0.3
    assert res.urgency_detected is False

def test_priority_escalation_on_urgency_and_high_value():
    sent = sentiment_analyzer.analyze("URGENT: double charge of $450 on my credit card!")
    entities = [
        ExtractedEntity(type="AMOUNT", value="$450.00", text="$450", start=0, end=4, confidence=1.0)
    ]
    p = priority_predictor.predict("PAYMENT", 0.95, sent, entities)
    assert p.label in ("HIGH", "URGENT")
    assert "Base category" in p.reason

def test_review_flagger_flags_low_confidence():
    flag = review_flagger.evaluate(
        category="TECHNICAL",
        category_confidence=0.42,
        probabilities={"TECHNICAL": 0.42, "PAYMENT": 0.38, "OTHER": 0.20},
        normalized_text="Error occurred."
    )
    assert flag.needs_review is True
    assert "Low category confidence" in flag.reason or "Ambiguous" in flag.reason

def test_review_flagger_accepts_high_confidence():
    flag = review_flagger.evaluate(
        category="PAYMENT",
        category_confidence=0.92,
        probabilities={"PAYMENT": 0.92, "TECHNICAL": 0.05, "REFUND": 0.03},
        normalized_text="My credit card payment was declined for order ORD-1234."
    )
    assert flag.needs_review is False
    assert flag.reason is None
