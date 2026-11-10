import pytest
from src.services.classifier import category_classifier
from src.services.intent_detector import intent_detector

def test_classify_payment_ticket():
    text = "My credit card was declined when trying to pay $99.50 for order ORD-1234. Transaction ref TXN-9912."
    pred = category_classifier.predict(text)
    assert pred.label == "PAYMENT"
    assert pred.confidence > 0.60
    assert "PAYMENT" in pred.probabilities

def test_classify_refund_ticket():
    text = "I cancelled order ORD-58291 yesterday and need a full refund of €120.00 to my account."
    pred = category_classifier.predict(text)
    assert pred.label == "REFUND"
    assert pred.confidence > 0.60

def test_classify_delivery_ticket():
    text = "Where is my parcel for order ORD-10928? The delivery tracking has not updated since Nov 10."
    pred = category_classifier.predict(text)
    assert pred.label == "DELIVERY"
    assert pred.confidence > 0.60

def test_classify_account_ticket():
    text = "My account is locked and the 2FA authentication code is not working when I log in."
    pred = category_classifier.predict(text)
    assert pred.label == "ACCOUNT"
    assert pred.confidence > 0.40

def test_classify_technical_ticket():
    text = "Getting HTTP 500 Internal Server Error when calling the REST API endpoint."
    pred = category_classifier.predict(text)
    assert pred.label == "TECHNICAL"
    assert pred.confidence > 0.50

def test_classify_product_ticket():
    text = "Does the SmartHub X1 support dual-band Wi-Fi and Docker container deployment?"
    pred = category_classifier.predict(text)
    assert pred.label == "PRODUCT"
    assert pred.confidence > 0.50

def test_detect_intent():
    text = "I cancelled order ORD-58291 and want a full refund."
    intent = intent_detector.detect_intent(text, "REFUND")
    assert intent.label == "request_refund"
    assert intent.confidence > 0.15
