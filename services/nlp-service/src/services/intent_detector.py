import re
from pathlib import Path
from typing import Dict, Any
import joblib
from ..config import ARTIFACTS_DIR
from ..schemas.response import IntentPrediction

class IntentDetector:
    def __init__(self):
        self.model = None
        self.vectorizer = None
        self.classes = []
        self._load_artifacts()

    def _load_artifacts(self):
        model_path = ARTIFACTS_DIR / "intent_classifier.joblib"
        vec_path = ARTIFACTS_DIR / "intent_vectorizer.joblib"

        if model_path.exists() and vec_path.exists():
            self.model = joblib.load(model_path)
            self.vectorizer = joblib.load(vec_path)
            self.classes = list(self.model.classes_)
        else:
            self.model = None
            self.vectorizer = None

    def detect_intent(self, clean_text: str, category: str) -> IntentPrediction:
        """
        Detects fine-grained customer intent using trained model and category alignment.
        """
        if not self.model or not self.vectorizer or not clean_text:
            return IntentPrediction(label="general_inquiry", confidence=0.50)

        features = self.vectorizer.transform([clean_text])
        probabilities = self.model.predict_proba(features)[0]

        top_idx = int(probabilities.argmax())
        top_label = self.classes[top_idx]
        top_confidence = round(float(probabilities[top_idx]), 4)

        return IntentPrediction(
            label=top_label,
            confidence=top_confidence
        )

intent_detector = IntentDetector()
