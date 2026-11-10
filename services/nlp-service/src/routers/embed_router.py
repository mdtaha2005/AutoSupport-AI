import logging
from fastapi import APIRouter, HTTPException, status
from ..schemas.request import EmbedRequest, BatchEmbedRequest
from ..schemas.response import EmbedResponse, BatchEmbedResponse
from ..services.embedder import text_embedder
from ..config import EMBEDDING_MODEL_NAME, EMBEDDING_DIMENSION

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/nlp", tags=["Embedding & Semantic Search"])

@router.post("/embed", response_model=EmbedResponse, status_code=status.HTTP_200_OK)
async def generate_embedding(req: EmbedRequest):
    """
    Generate a 384-dimensional dense vector embedding for semantic search.
    """
    try:
        embedding = text_embedder.encode(req.text)
        return EmbedResponse(
            embedding=embedding,
            dimension=len(embedding),
            model=EMBEDDING_MODEL_NAME,
        )
    except Exception as e:
        logger.error(f"Error generating text embedding: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate embedding: {str(e)}"
        )

@router.post("/embed-batch", response_model=BatchEmbedResponse, status_code=status.HTTP_200_OK)
async def generate_batch_embeddings(req: BatchEmbedRequest):
    """
    Generate 384-dimensional dense vector embeddings for a batch of texts.
    """
    try:
        embeddings = text_embedder.encode_batch(req.texts)
        return BatchEmbedResponse(
            embeddings=embeddings,
            dimension=EMBEDDING_DIMENSION,
            model=EMBEDDING_MODEL_NAME,
            count=len(embeddings),
        )
    except Exception as e:
        logger.error(f"Error generating batch embeddings: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate batch embeddings: {str(e)}"
        )
