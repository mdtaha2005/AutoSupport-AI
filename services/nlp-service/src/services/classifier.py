from pathlib import Path
from typing import Dict, Any, Tuple
import joblib
from ..config import ARTIFACTS_DIR
from ..schemas.response import CategoryPrediction

class CategoryClassifier:
    def __init__(self):
        self.model = None
        self.vectorizer = None
        self.classes = []
        self._load_artifacts()

    def _load_artifacts(self):
        model_path = ARTIFACTS_DIR / "category_classifier.joblib"
        vec_path = ARTIFACTS_DIR / "category_vectorizer.joblib"

        if model_path.exists() and vec_path.exists():
            self.model = joblib.load(model_path)
            self.vectorizer = joblib.load(vec_path)
            self.classes = list(self.model.classes_)
        else:
            self.model = None
            self.vectorizer = None

    def predict(self, clean_text: str) -> CategoryPrediction:
        """
        Classifies preprocessed text into target categories with calibrated probabilities.
        """
        if not self.model or not self.vectorizer or not clean_text:
            return CategoryPrediction(
                label="OTHER",
                confidence=0.50,
                probabilities={"OTHER": 1.0}
            )

        features = self.vectorizer.transform([clean_text])
        probabilities = self.model.predict_proba(features)[0]

        prob_dict: Dict[str, float] = {
            cls: round(float(prob), 4)
            for cls, prob in zip(self.classes, probabilities)
        }

        top_idx = int(probabilities.argmax())
        top_label = self.classes[top_idx]
        top_confidence = round(float(probabilities[top_idx]), 4)

        return CategoryPrediction(
            label=top_label,
            confidence=top_confidence,
            probabilities=prob_dict,
        )

category_classifier = CategoryClassifier()
