from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class ExtractedEntity(BaseModel):
    type: str = Field(..., description="Entity type: ORDER_ID, AMOUNT, DATE, PRODUCT, TRANSACTION_REF")
    value: str = Field(..., description="Normalized entity value")
    text: str = Field(..., description="Raw text match in input")
    start: int = Field(..., description="Character start index")
    end: int = Field(..., description="Character end index")
    confidence: float = Field(default=1.0, description="Extraction confidence")

class SentimentResult(BaseModel):
    label: str = Field(..., description="POSITIVE, NEUTRAL, or NEGATIVE")
    score: float = Field(..., description="Polarity score between -1.0 and 1.0")
    urgency_detected: bool = Field(default=False)
    urgency_keywords: List[str] = Field(default_factory=list)

class CategoryPrediction(BaseModel):
    label: str = Field(..., description="PAYMENT, REFUND, DELIVERY, ACCOUNT, TECHNICAL, PRODUCT, or OTHER")
    confidence: float = Field(..., description="Prediction probability")
    probabilities: Dict[str, float] = Field(default_factory=dict)

class IntentPrediction(BaseModel):
    label: str = Field(..., description="Granular detected intent")
    confidence: float = Field(..., description="Intent confidence")

class PriorityPrediction(BaseModel):
    label: str = Field(..., description="LOW, MEDIUM, HIGH, or URGENT")
    confidence: float = Field(...)
    reason: str = Field(..., description="Explanation of priority determination")

class HumanReviewFlag(BaseModel):
    needs_review: bool = Field(default=False)
    reason: Optional[str] = Field(None, description="Reason human review is suggested")

class TicketProcessResponse(BaseModel):
    ticket_id: Optional[str] = None
    category: CategoryPrediction
    intent: IntentPrediction
    priority: PriorityPrediction
    sentiment: SentimentResult
    entities: List[ExtractedEntity] = Field(default_factory=list)
    human_review: HumanReviewFlag
    normalized_text: str
    processed_at: str

class ModelInfoResponse(BaseModel):
    model_version: str
    categories: List[str]
    thresholds: Dict[str, float]
    metrics: Dict[str, Any]

class EmbedResponse(BaseModel):
    embedding: List[float] = Field(..., description="Dense 384-dimensional vector")
    dimension: int = Field(default=384)
    model: str = Field(default="all-MiniLM-L6-v2")

class BatchEmbedResponse(BaseModel):
    embeddings: List[List[float]] = Field(..., description="List of dense vectors")
    dimension: int = Field(default=384)
    model: str = Field(default="all-MiniLM-L6-v2")
    count: int
