import re
from typing import List, Set
import spacy
from ..schemas.response import ExtractedEntity

KNOWN_PRODUCTS = [
    "Cloud Backup Pro", "SmartHub X1", "Enterprise Gateway",
    "Wireless Pro Headset", "OmniSensor 2.0", "Security Suite Pro",
    "Database Cluster", "API Gateway", "Analytics Dashboard"
]

class EntityExtractor:
    def __init__(self):
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except Exception:
            self.nlp = spacy.blank("en")

        # Regex patterns for deterministic extraction
        self.order_patterns = [
            re.compile(r"\bORD-\d+\b", re.IGNORECASE),
            re.compile(r"\border\s*#?([A-Za-z0-9-_]{4,15})\b", re.IGNORECASE),
            re.compile(r"#\d{5,8}\b"),
        ]

        self.amount_patterns = [
            re.compile(r"[\$\€\£\¥]\s*\d+(?:\.\d{1,2})?"),
            re.compile(r"\b\d+(?:\.\d{1,2})?\s*(?:USD|EUR|GBP|INR|CAD|AUD)\b", re.IGNORECASE),
        ]

        self.date_patterns = [
            re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
            re.compile(r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b", re.IGNORECASE),
            re.compile(r"\b(?:yesterday|today|tomorrow|last\s+(?:friday|monday|week|month)|\d+\s+days?\s+ago)\b", re.IGNORECASE),
        ]

        self.txn_patterns = [
            re.compile(r"\bTXN-[A-Za-z0-9-_]+\b", re.IGNORECASE),
            re.compile(r"\bch_[A-Za-z0-9_]{10,}\b"),
            re.compile(r"\bPAY-[A-Za-z0-9-_]+\b", re.IGNORECASE),
            re.compile(r"\bref#[A-Za-z0-9-_]+\b", re.IGNORECASE),
        ]

        self.product_regex = re.compile(
            r"\b(" + "|".join(re.escape(p) for p in KNOWN_PRODUCTS) + r")\b",
            re.IGNORECASE
        )

    def extract_entities(self, text: str) -> List[ExtractedEntity]:
        """
        Combines spaCy NER with regex rules to extract domain entities:
        ORDER_ID, AMOUNT, DATE, PRODUCT, and TRANSACTION_REF.
        """
        entities: List[ExtractedEntity] = []
        covered_spans: Set[tuple] = set()

        def is_overlapping(start: int, end: int) -> bool:
            return any(not (end <= s or start >= e) for s, e in covered_spans)

        # 1. Custom Regex Rule Extractions (High precision)
        # Order IDs
        for pattern in self.order_patterns:
            for match in pattern.finditer(text):
                start, end = match.span()
                if not is_overlapping(start, end):
                    val = match.group(0).strip()
                    entities.append(ExtractedEntity(
                        type="ORDER_ID",
                        value=val.upper() if val.lower().startswith("ord-") else val,
                        text=val,
                        start=start,
                        end=end,
                        confidence=0.98,
                    ))
                    covered_spans.add((start, end))

        # Transaction References
        for pattern in self.txn_patterns:
            for match in pattern.finditer(text):
                start, end = match.span()
                if not is_overlapping(start, end):
                    val = match.group(0).strip()
                    entities.append(ExtractedEntity(
                        type="TRANSACTION_REF",
                        value=val,
                        text=val,
                        start=start,
                        end=end,
                        confidence=0.98,
                    ))
                    covered_spans.add((start, end))

        # Monetary Amounts
        for pattern in self.amount_patterns:
            for match in pattern.finditer(text):
                start, end = match.span()
                if not is_overlapping(start, end):
                    val = match.group(0).strip()
                    entities.append(ExtractedEntity(
                        type="AMOUNT",
                        value=val,
                        text=val,
                        start=start,
                        end=end,
                        confidence=0.95,
                    ))
                    covered_spans.add((start, end))

        # Known Products
        for match in self.product_regex.finditer(text):
            start, end = match.span()
            if not is_overlapping(start, end):
                val = match.group(0).strip()
                entities.append(ExtractedEntity(
                    type="PRODUCT",
                    value=val,
                    text=val,
                    start=start,
                    end=end,
                    confidence=0.95,
                ))
                covered_spans.add((start, end))

        # Regex Dates
        for pattern in self.date_patterns:
            for match in pattern.finditer(text):
                start, end = match.span()
                if not is_overlapping(start, end):
                    val = match.group(0).strip()
                    entities.append(ExtractedEntity(
                        type="DATE",
                        value=val,
                        text=val,
                        start=start,
                        end=end,
                        confidence=0.90,
                    ))
                    covered_spans.add((start, end))

        # 2. spaCy Model Enhancements (Dates and additional entities)
        doc = self.nlp(text)
        for ent in doc.ents:
            start, end = ent.start_char, ent.end_char
            if is_overlapping(start, end):
                continue

            if ent.label_ in ("DATE", "TIME"):
                entities.append(ExtractedEntity(
                    type="DATE",
                    value=ent.text,
                    text=ent.text,
                    start=start,
                    end=end,
                    confidence=0.88,
                ))
                covered_spans.add((start, end))
            elif ent.label_ == "MONEY":
                entities.append(ExtractedEntity(
                    type="AMOUNT",
                    value=ent.text,
                    text=ent.text,
                    start=start,
                    end=end,
                    confidence=0.90,
                ))
                covered_spans.add((start, end))
            elif ent.label_ == "PRODUCT" and len(ent.text) > 2:
                entities.append(ExtractedEntity(
                    type="PRODUCT",
                    value=ent.text,
                    text=ent.text,
                    start=start,
                    end=end,
                    confidence=0.85,
                ))
                covered_spans.add((start, end))

        # Sort entities by start position
        entities.sort(key=lambda e: e.start)
        return entities

entity_extractor = EntityExtractor()
