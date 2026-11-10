import pytest
import math
from fastapi.testclient import TestClient
from src.main import app
from src.services.embedder import text_embedder

client = TestClient(app)

def test_embedder_single_encode():
    text = "Refund requested for double charge on credit card"
    vec = text_embedder.encode(text)
    assert isinstance(vec, list)
    assert len(vec) == 384
    # Check L2 unit normalization: norm approx 1.0
    norm = math.sqrt(sum(x * x for x in vec))
    assert abs(norm - 1.0) < 1e-3

def test_embedder_batch_encode():
    texts = [
        "Refund requested for double charge",
        "Cannot log in after resetting password",
        "Package delayed in transit with tracking number"
    ]
    vecs = text_embedder.encode_batch(texts)
    assert len(vecs) == 3
    for vec in vecs:
        assert len(vec) == 384
        norm = math.sqrt(sum(x * x for x in vec))
        assert abs(norm - 1.0) < 1e-3

def test_embedder_empty_string():
    vec = text_embedder.encode("")
    assert len(vec) == 384
    assert all(x == 0.0 for x in vec)

def test_api_embed_endpoint():
    response = client.post(
        "/api/v1/nlp/embed",
        json={"text": "How do I upgrade my software license?"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "embedding" in data
    assert data["dimension"] == 384
    assert len(data["embedding"]) == 384
    assert data["model"] == "all-MiniLM-L6-v2"

def test_api_embed_batch_endpoint():
    response = client.post(
        "/api/v1/nlp/embed-batch",
        json={"texts": ["Order cancelled", "Server error 500"]}
    )
    assert response.status_code == 200
    data = response.json()
    assert "embeddings" in data
    assert data["count"] == 2
    assert len(data["embeddings"]) == 2
    assert len(data["embeddings"][0]) == 384
