from typing import Optional, List
from pydantic import BaseModel, Field

class TicketProcessRequest(BaseModel):
    ticket_id: Optional[str] = Field(None, description="Optional Ticket UUID")
    title: str = Field(..., min_length=2, max_length=300, description="Ticket title")
    description: str = Field(..., min_length=3, description="Ticket customer message")

class BatchProcessRequest(BaseModel):
    tickets: List[TicketProcessRequest]

class EmbedRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to encode into dense vector")

class BatchEmbedRequest(BaseModel):
    texts: List[str] = Field(..., min_length=1, description="List of texts to encode")
