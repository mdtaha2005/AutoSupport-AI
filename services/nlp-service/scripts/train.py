"""
Offline Model Training & Evaluation Pipeline for Customer Ticket NLP Microservice.
Trains TF-IDF + Logistic Regression classifiers for Category and Intent,
computes precision, recall, F1-scores, and confusion matrices,
and saves production model artifacts.
"""
import json
import sys
from pathlib import Path
import pandas as pd
import numpy as np
import joblib

from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

# Add parent directory to sys.path so we can import services
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from src.services.normalizer import normalizer

DATA_FILE = BASE_DIR / "data" / "customer_support_data.csv"
ARTIFACTS_DIR = BASE_DIR / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

def train_models():
    print("======================================================================")
    print("STARTING NLP MODEL TRAINING PIPELINE")
    print("======================================================================")

    # 1. Load dataset
    print(f"Loading customer support dataset from: {DATA_FILE}")
    df = pd.read_csv(DATA_FILE)
    print(f"Total labeled records: {len(df)}")
    print("Class distribution:")
    print(df["category"].value_counts().to_string())

    # 2. Text normalization
    print("\nNormalizing input texts...")
    df["clean_text"] = df["text"].apply(normalizer.normalize)

    # 3. Category Classification Model
    print("\n" + "-" * 50)
    print("Training Category Classifier (TF-IDF + Logistic Regression)")
    print("-" * 50)

    X_train_cat, X_test_cat, y_train_cat, y_test_cat = train_test_split(
        df["clean_text"],
        df["category"],
        test_size=0.20,
        random_state=42,
        stratify=df["category"]
    )

    cat_vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        max_features=5000,
        sublinear_tf=True
    )
    X_train_cat_vec = cat_vectorizer.fit_transform(X_train_cat)
    X_test_cat_vec = cat_vectorizer.transform(X_test_cat)

    cat_model = LogisticRegression(
        C=3.0,
        max_iter=1000,
        class_weight="balanced",
        random_state=42
    )
    cat_model.fit(X_train_cat_vec, y_train_cat)

    # Evaluate Category Classifier
    y_pred_cat = cat_model.predict(X_test_cat_vec)
    cat_report_dict = classification_report(y_test_cat, y_pred_cat, output_dict=True)
    cat_report_str = classification_report(y_test_cat, y_pred_cat)
    cat_cm = confusion_matrix(y_test_cat, y_pred_cat, labels=cat_model.classes_)
    cat_acc = accuracy_score(y_test_cat, y_pred_cat)

    print("\nCategory Classification Report:")
    print(cat_report_str)
    print(f"Overall Accuracy: {cat_acc:.4f}")

    print("\nCategory Confusion Matrix:")
    labels = list(cat_model.classes_)
    header = f"{'':<14} " + " ".join([f"{l[:4]:>6}" for l in labels])
    print(header)
    for i, row in enumerate(cat_cm):
        row_str = f"{labels[i]:<14} " + " ".join([f"{val:>6}" for val in row])
        print(row_str)

    # 4. Intent Detection Model
    print("\n" + "-" * 50)
    print("Training Intent Classifier (TF-IDF + Logistic Regression)")
    print("-" * 50)

    X_train_int, X_test_int, y_train_int, y_test_int = train_test_split(
        df["clean_text"],
        df["intent"],
        test_size=0.20,
        random_state=42,
        stratify=df["intent"]
    )

    intent_vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        max_features=5000,
        sublinear_tf=True
    )
    X_train_int_vec = intent_vectorizer.fit_transform(X_train_int)
    X_test_int_vec = intent_vectorizer.transform(X_test_int)

    intent_model = LogisticRegression(
        C=1.5,
        max_iter=1000,
        class_weight="balanced",
        random_state=42
    )
    intent_model.fit(X_train_int_vec, y_train_int)

    y_pred_int = intent_model.predict(X_test_int_vec)
    intent_acc = accuracy_score(y_test_int, y_pred_int)
    print(f"Intent Classification Accuracy: {intent_acc:.4f}")

    # 5. Save Artifacts
    print("\n" + "-" * 50)
    print(f"Saving model artifacts to {ARTIFACTS_DIR}...")
    print("-" * 50)

    joblib.dump(cat_model, ARTIFACTS_DIR / "category_classifier.joblib")
    joblib.dump(cat_vectorizer, ARTIFACTS_DIR / "category_vectorizer.joblib")
    joblib.dump(intent_model, ARTIFACTS_DIR / "intent_classifier.joblib")
    joblib.dump(intent_vectorizer, ARTIFACTS_DIR / "intent_vectorizer.joblib")

    metrics_payload = {
        "dataset": {
            "total_records": len(df),
            "train_size": len(X_train_cat),
            "test_size": len(X_test_cat),
        },
        "category_classification": {
            "accuracy": round(cat_acc, 4),
            "classes": labels,
            "report": cat_report_dict,
            "confusion_matrix": cat_cm.tolist(),
        },
        "intent_classification": {
            "accuracy": round(intent_acc, 4),
            "classes": list(intent_model.classes_),
        },
        "version": "1.0.0",
    }

    with open(ARTIFACTS_DIR / "evaluation_metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics_payload, f, indent=2)

    print("[SUCCESS] All model artifacts & evaluation metrics saved successfully.")
    print("=" * 70)

if __name__ == "__main__":
    train_models()
