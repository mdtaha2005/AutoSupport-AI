import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

ARTIFACTS_DIR = BASE_DIR / "artifacts"
DATA_DIR = BASE_DIR / "data"

# Classification & Review Thresholds
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.60"))
AMBIGUITY_THRESHOLD = float(os.getenv("AMBIGUITY_THRESHOLD", "0.15"))
HIGH_VALUE_THRESHOLD = float(os.getenv("HIGH_VALUE_THRESHOLD", "250.0"))

# Service Networking
SERVICE_HOST = os.getenv("NLP_SERVICE_HOST", "0.0.0.0")
SERVICE_PORT = int(os.getenv("NLP_SERVICE_PORT", "8000"))

# Supported Target Categories
TARGET_CATEGORIES = [
    "PAYMENT",
    "REFUND",
    "DELIVERY",
    "ACCOUNT",
    "TECHNICAL",
    "PRODUCT",
    "OTHER",
]

# Embedding Configuration (Phase 4)
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "384"))
