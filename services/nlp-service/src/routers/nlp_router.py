import json
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, status
from ..schemas.request import TicketProcessRequest, BatchProcessRequest
from ..schemas.response import TicketProcessResponse, ModelInfoResponse
from ..services.nlp_orchestrator import nlp_orchestrator
from ..config import ARTIFACTS_DIR, TARGET_CATEGORIES, CONFIDENCE_THRESHOLD, AMBIGUITY_THRESHOLD

router = APIRouter(prefix="/api/v1/nlp", tags=["NLP Processing"])

@router.get("/health", status_code=status.HTTP_200_OK)
def health_check():
    """
    Service healthcheck verification.
    """
    return {
        "status": "healthy",
        "service": "customer-ticket-nlp-microservice",
        "artifacts_loaded": (ARTIFACTS_DIR / "category_classifier.joblib").exists(),
    }

@router.post(
    "/process",
    response_model=TicketProcessResponse,
    status_code=status.HTTP_200_OK,
    summary="Process customer ticket message with full NLP pipeline"
)
def process_ticket(request: TicketProcessRequest):
    """
    Performs end-to-end NLP analysis:
    - Normalizes customer message text
    - Predicts category (PAYMENT, REFUND, DELIVERY, ACCOUNT, TECHNICAL, PRODUCT, OTHER)
    - Detects customer intent
    - Extracts named entities (ORDER_ID, AMOUNT, DATE, PRODUCT, TRANSACTION_REF)
    - Analyzes sentiment polarity and detects urgency
    - Predicts ticket priority (LOW, MEDIUM, HIGH, URGENT)
    - Flags uncertain predictions for human review
    """
    try:
        return nlp_orchestrator.process_ticket(request)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"NLP Processing error: {str(e)}"
        )

@router.post(
    "/batch",
    response_model=List[TicketProcessResponse],
    status_code=status.HTTP_200_OK,
    summary="Batch process multiple customer ticket messages"
)
def batch_process(request: BatchProcessRequest):
    """
    Processes multiple tickets in a single request.
    """
    return [nlp_orchestrator.process_ticket(t) for t in request.tickets]

@router.get(
    "/model-info",
    response_model=ModelInfoResponse,
    status_code=status.HTTP_200_OK,
    summary="Get trained model versions, categories, thresholds and evaluation metrics"
)
def get_model_info():
    """
    Retrieves model metadata and offline evaluation metrics.
    """
    metrics_file = ARTIFACTS_DIR / "evaluation_metrics.json"
    metrics: Dict[str, Any] = {}
    if metrics_file.exists():
        with open(metrics_file, "r", encoding="utf-8") as f:
            metrics = json.load(f)

    return ModelInfoResponse(
        model_version=metrics.get("version", "1.0.0"),
        categories=TARGET_CATEGORIES,
        thresholds={
            "confidence_threshold": CONFIDENCE_THRESHOLD,
            "ambiguity_threshold": AMBIGUITY_THRESHOLD,
        },
        metrics=metrics,
    )
