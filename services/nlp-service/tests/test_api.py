import pytest
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)

def test_api_health():
    res = client.get("/api/v1/nlp/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["artifacts_loaded"] is True

def test_api_model_info():
    res = client.get("/api/v1/nlp/model-info")
    assert res.status_code == 200
    data = res.json()
    assert "PAYMENT" in data["categories"]
    assert "metrics" in data

def test_api_process_ticket_full_pipeline():
    payload = {
        "ticket_id": "123e4567-e89b-12d3-a456-426614174000",
        "title": "Double charge on subscription renewal",
        "description": "My card was charged $150.00 twice on yesterday for Cloud Backup Pro. Ref TXN-88192. Please fix immediately."
    }
    res = client.post("/api/v1/nlp/process", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["ticket_id"] == payload["ticket_id"]
    assert data["category"]["label"] in ("PAYMENT", "REFUND")
    assert data["category"]["confidence"] > 0.50
    assert data["intent"]["label"] is not None
    assert data["priority"]["label"] in ("HIGH", "URGENT")
    assert data["sentiment"]["label"] in ("NEGATIVE", "NEUTRAL")
    assert len(data["entities"]) > 0

    types = [e["type"] for e in data["entities"]]
    assert "AMOUNT" in types or "TRANSACTION_REF" in types or "PRODUCT" in types
    assert "human_review" in data

def test_api_batch_process():
    payload = {
        "tickets": [
            {
                "title": "Refund request",
                "description": "I need a full refund of $49.99 for order ORD-1234."
            },
            {
                "title": "Password reset link broken",
                "description": "I cannot sign into my account, email never arrives."
            }
        ]
    }
    res = client.post("/api/v1/nlp/batch", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2
    assert data[0]["category"]["label"] == "REFUND"
    assert data[1]["category"]["label"] == "ACCOUNT"
