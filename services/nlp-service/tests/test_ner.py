import pytest
from src.services.ner_extractor import entity_extractor

def test_extract_order_id():
    text = "Please check order ORD-98214 and also reference #58291."
    entities = entity_extractor.extract_entities(text)
    order_ids = [e.value for e in entities if e.type == "ORDER_ID"]
    assert "ORD-98214" in order_ids
    assert "#58291" in order_ids

def test_extract_amounts():
    text = "Charged $49.99 and another €120.00, total was 250 USD."
    entities = entity_extractor.extract_entities(text)
    amounts = [e.value for e in entities if e.type == "AMOUNT"]
    assert any("$49.99" in a for a in amounts)
    assert any("€120.00" in a for a in amounts)
    assert any("250 USD" in a for a in amounts)

def test_extract_dates():
    text = "Order was placed yesterday, scheduled for 2026-11-04 or Nov 10."
    entities = entity_extractor.extract_entities(text)
    dates = [e.value.lower() for e in entities if e.type == "DATE"]
    assert any("yesterday" in d for d in dates)
    assert any("2026-11-04" in d for d in dates)

def test_extract_products():
    text = "The Cloud Backup Pro service failed to synchronize with Enterprise Gateway."
    entities = entity_extractor.extract_entities(text)
    products = [e.value for e in entities if e.type == "PRODUCT"]
    assert "Cloud Backup Pro" in products
    assert "Enterprise Gateway" in products

def test_extract_transaction_refs():
    text = "Payment reference TXN-88192 and Stripe charge ID ch_3M4K281902812 were logged."
    entities = entity_extractor.extract_entities(text)
    txns = [e.value for e in entities if e.type == "TRANSACTION_REF"]
    assert "TXN-88192" in txns
    assert "ch_3M4K281902812" in txns
