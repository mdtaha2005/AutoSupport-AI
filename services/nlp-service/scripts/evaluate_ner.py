"""
Dedicated Named Entity Recognition (NER) Evaluation Pipeline.
Evaluates precision, recall, and F1-score across:
ORDER_ID, AMOUNT, DATE, PRODUCT, and TRANSACTION_REF.
"""
import json
import sys
from pathlib import Path
from typing import List, Dict, Any

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from src.services.ner_extractor import entity_extractor

ARTIFACTS_DIR = BASE_DIR / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

# Labeled test instances for NER benchmark
NER_TEST_SAMPLES = [
    {
        "text": "My card was charged $49.99 for order ORD-48291 on 2026-11-04 with reference TXN-88192.",
        "expected": [
            {"type": "AMOUNT", "value": "$49.99"},
            {"type": "ORDER_ID", "value": "ORD-48291"},
            {"type": "DATE", "value": "2026-11-04"},
            {"type": "TRANSACTION_REF", "value": "TXN-88192"},
        ]
    },
    {
        "text": "Please refund €120.00 for Wireless Pro Headset under order #58291 cancelled yesterday.",
        "expected": [
            {"type": "AMOUNT", "value": "€120.00"},
            {"type": "PRODUCT", "value": "Wireless Pro Headset"},
            {"type": "ORDER_ID", "value": "#58291"},
            {"type": "DATE", "value": "yesterday"},
        ]
    },
    {
        "text": "Payment failed for 250 USD on transaction ch_3M4K281290381 regarding Cloud Backup Pro.",
        "expected": [
            {"type": "AMOUNT", "value": "250 USD"},
            {"type": "TRANSACTION_REF", "value": "ch_3M4K281290381"},
            {"type": "PRODUCT", "value": "Cloud Backup Pro"},
        ]
    },
    {
        "text": "Tracking number for order ORD-10928 has not updated since Nov 10.",
        "expected": [
            {"type": "ORDER_ID", "value": "ORD-10928"},
            {"type": "DATE", "value": "Nov 10"},
        ]
    },
    {
        "text": "SmartHub X1 delivery delay for order #77312. Charge of £85.00 ref#88219 was deducted.",
        "expected": [
            {"type": "PRODUCT", "value": "SmartHub X1"},
            {"type": "ORDER_ID", "value": "#77312"},
            {"type": "AMOUNT", "value": "£85.00"},
            {"type": "TRANSACTION_REF", "value": "ref#88219"},
        ]
    },
    {
        "text": "I purchased Enterprise Gateway on October 28th for $450.00. Payment ref PAY-9921.",
        "expected": [
            {"type": "PRODUCT", "value": "Enterprise Gateway"},
            {"type": "DATE", "value": "October 28th"},
            {"type": "AMOUNT", "value": "$450.00"},
            {"type": "TRANSACTION_REF", "value": "PAY-9921"},
        ]
    },
    {
        "text": "Account locked today after paying $99.50 for OmniSensor 2.0. Order ref ORD-33412.",
        "expected": [
            {"type": "DATE", "value": "today"},
            {"type": "AMOUNT", "value": "$99.50"},
            {"type": "PRODUCT", "value": "OmniSensor 2.0"},
            {"type": "ORDER_ID", "value": "ORD-33412"},
        ]
    },
    {
        "text": "Refund of €35.50 needed for order ORD-77312 following gateway timeout yesterday.",
        "expected": [
            {"type": "AMOUNT", "value": "€35.50"},
            {"type": "ORDER_ID", "value": "ORD-77312"},
            {"type": "DATE", "value": "yesterday"},
        ]
    }
]

def evaluate_ner():
    print("=" * 70)
    print("STARTING DEDICATED NER EVALUATION PIPELINE")
    print("=" * 70)

    entity_types = ["ORDER_ID", "AMOUNT", "DATE", "PRODUCT", "TRANSACTION_REF"]
    stats: Dict[str, Dict[str, int]] = {
        etype: {"tp": 0, "fp": 0, "fn": 0} for etype in entity_types
    }

    for sample in NER_TEST_SAMPLES:
        text = sample["text"]
        expected = sample["expected"]
        extracted = entity_extractor.extract_entities(text)

        # Map by type
        expected_by_type: Dict[str, List[str]] = {etype: [] for etype in entity_types}
        for exp in expected:
            expected_by_type[exp["type"]].append(exp["value"].lower().strip())

        extracted_by_type: Dict[str, List[str]] = {etype: [] for etype in entity_types}
        for ext in extracted:
            if ext.type in extracted_by_type:
                extracted_by_type[ext.type].append(ext.value.lower().strip())

        for etype in entity_types:
            exp_vals = expected_by_type[etype]
            ext_vals = extracted_by_type[etype]

            # Count true positives
            matched = 0
            for val in ext_vals:
                if any(val in e or e in val for e in exp_vals):
                    matched += 1

            stats[etype]["tp"] += matched
            stats[etype]["fp"] += max(0, len(ext_vals) - matched)
            stats[etype]["fn"] += max(0, len(exp_vals) - matched)

    # Compute metrics per entity type
    results = {}
    total_tp = 0
    total_fp = 0
    total_fn = 0

    print(f"{'Entity Type':<18} {'Precision':<12} {'Recall':<12} {'F1-Score':<12} {'Support':<8}")
    print("-" * 65)

    for etype in entity_types:
        tp = stats[etype]["tp"]
        fp = stats[etype]["fp"]
        fn = stats[etype]["fn"]
        support = tp + fn

        total_tp += tp
        total_fp += fp
        total_fn += fn

        precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
        f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 1.0

        results[etype] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4),
            "support": support,
        }

        print(f"{etype:<18} {precision:<12.4f} {recall:<12.4f} {f1:<12.4f} {support:<8}")

    # Micro average
    micro_p = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 1.0
    micro_r = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 1.0
    micro_f1 = (2 * micro_p * micro_r) / (micro_p + micro_r) if (micro_p + micro_r) > 0 else 1.0

    print("-" * 65)
    print(f"{'MICRO AVERAGE':<18} {micro_p:<12.4f} {micro_r:<12.4f} {micro_f1:<12.4f} {total_tp + total_fn:<8}")

    output_payload = {
        "per_entity_metrics": results,
        "micro_average": {
            "precision": round(micro_p, 4),
            "recall": round(micro_r, 4),
            "f1_score": round(micro_f1, 4),
            "total_entities": total_tp + total_fn,
        }
    }

    with open(ARTIFACTS_DIR / "ner_evaluation_metrics.json", "w", encoding="utf-8") as f:
        json.dump(output_payload, f, indent=2)

    print(f"\n[SUCCESS] NER evaluation metrics saved to {ARTIFACTS_DIR / 'ner_evaluation_metrics.json'}")
    print("=" * 70)

if __name__ == "__main__":
    evaluate_ner()
