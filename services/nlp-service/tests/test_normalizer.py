import pytest
from src.services.normalizer import normalizer

def test_normalize_strips_html_and_urls():
    raw = "<div>Hello! Please check <a href='https://acme.com'>this link</a> for my issue.</div>"
    clean = normalizer.normalize(raw)
    assert "<div>" not in clean
    assert "https://" not in clean
    assert "Hello" in clean
    assert "issue" in clean

def test_normalize_preserves_negations_and_contractions():
    raw = "I can't access my account and the reset link didn't arrive."
    clean = normalizer.normalize(raw)
    assert "cannot" in clean
    assert "not" in clean
    assert "arrive" in clean

def test_normalize_preserves_currency_and_order_hashes():
    raw = "I paid $150.00 for order #48291 and ref TXN-9912."
    clean = normalizer.normalize(raw)
    assert "$150.00" in clean
    assert "#48291" in clean
    assert "TXN-9912" in clean
