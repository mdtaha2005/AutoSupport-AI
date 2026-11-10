from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers.nlp_router import router as nlp_router
from .routers.embed_router import router as embed_router
from .config import SERVICE_HOST, SERVICE_PORT
from .services.classifier import category_classifier
from .services.intent_detector import intent_detector

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure artifacts are loaded
    print("[INFO] Initializing NLP models and warming up pipelines...")
    category_classifier._load_artifacts()
    intent_detector._load_artifacts()
    print("[INFO] NLP pipelines ready for inference.")
    yield
    print("[INFO] Shutting down NLP microservice...")

app = FastAPI(
    title="Customer Ticket NLP Microservice",
    version="1.0.0",
    description="Intelligent Customer Ticket Classification, Intent Detection, NER, Sentiment Analysis & Priority Prediction.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(nlp_router)
app.include_router(embed_router)

@app.get("/")
def root():
    return {
        "service": "customer-ticket-nlp-microservice",
        "status": "online",
        "docs": "/docs",
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host=SERVICE_HOST, port=SERVICE_PORT, reload=False)
