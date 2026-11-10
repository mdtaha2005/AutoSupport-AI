import logging
import hashlib
import numpy as np
from typing import List
from ..config import EMBEDDING_MODEL_NAME, EMBEDDING_DIMENSION

logger = logging.getLogger(__name__)

class TextEmbedder:
    """
    Dense text embedding service using Sentence Transformers (all-MiniLM-L6-v2).
    Generates 384-dimensional L2-normalized dense embeddings for semantic search
    and hybrid retrieval via pgvector.
    """

    def __init__(self, model_name: str = EMBEDDING_MODEL_NAME, dimension: int = EMBEDDING_DIMENSION):
        self.model_name = model_name
        self.dimension = dimension
        self._model = None
        self._load_attempted = False

    def _get_model(self):
        if not self._load_attempted:
            self._load_attempted = True
            try:
                from sentence_transformers import SentenceTransformer
                logger.info(f"Loading SentenceTransformer model: {self.model_name}")
                self._model = SentenceTransformer(self.model_name)
                logger.info("SentenceTransformer model successfully initialized")
            except Exception as e:
                logger.warning(
                    f"SentenceTransformer model could not be loaded ({e}). "
                    f"Falling back to deterministic pseudo-semantic dense embeddings."
                )
                self._model = None
        return self._model

    def encode(self, text: str) -> List[float]:
        """
        Encode a single text into a 384-dimensional unit vector.
        """
        clean_text = text.strip() if text else ""
        if not clean_text:
            return [0.0] * self.dimension

        model = self._get_model()
        if model is not None:
            try:
                vec = model.encode(clean_text, normalize_embeddings=True)
                return [float(x) for x in vec]
            except Exception as e:
                logger.error(f"Inference error with SentenceTransformer: {e}")

        return self._deterministic_fallback_embed(clean_text)

    def encode_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Encode multiple texts in a batch.
        """
        if not texts:
            return []

        model = self._get_model()
        if model is not None:
            try:
                vecs = model.encode(texts, normalize_embeddings=True)
                return [[float(x) for x in v] for v in vecs]
            except Exception as e:
                logger.error(f"Batch inference error with SentenceTransformer: {e}")

        return [self.encode(t) for t in texts]

    def _deterministic_fallback_embed(self, text: str) -> List[float]:
        """
        Generates a deterministic 384-dim L2-normalized vector based on token hashes
        when external neural weights are unreachable or offline.
        Ensures consistent semantic vector representation during tests and offline runs.
        """
        vector = np.zeros(self.dimension, dtype=np.float32)
        words = text.lower().split()
        if not words:
            return vector.tolist()

        for word in words:
            # Deterministic hash to seed pseudo-random direction
            seed = int(hashlib.md5(word.encode("utf-8")).hexdigest()[:8], 16)
            rng = np.random.RandomState(seed)
            word_vec = rng.randn(self.dimension).astype(np.float32)
            vector += word_vec

        norm = np.linalg.norm(vector)
        if norm > 1e-6:
            vector = vector / norm

        return [float(x) for x in vector]

# Global singleton embedder instance
text_embedder = TextEmbedder()
