from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from llm import (
    chat_with_context,
    get_llm_runtime_info,
    stream_advice,
    stream_chat_with_context,
)
from model import IMAGE_SIZE, MODEL_NAME, load_model, predict

app = FastAPI(title="PlantGuard AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    disease: str
    plant: str
    question: str
    history: list[ChatMessage] = []


class AdviceRequest(BaseModel):
    disease: str
    plant: str
    confidence: float
    is_healthy: bool


@app.on_event("startup")
def startup() -> None:
    try:
        load_model()
    except Exception as e:
        print(f"Warning: Failed to load model on startup: {e}")
        raise


@app.get("/")
def root() -> dict:
    llm_info = get_llm_runtime_info()
    return {
        "status": "PlantGuard AI is running",
        "classifier": MODEL_NAME,
        "input_size": IMAGE_SIZE,
        "classes": 38,
        "llm_provider": llm_info["provider"],
        "llm_model": llm_info["model"],
    }


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)) -> dict:
    if file.content_type not in ["image/jpeg", "image/png", "image/webp"]:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WEBP images allowed")

    try:
        image_bytes = await file.read()
        result = predict(image_bytes)
        return {
            **result,
            "advice": "",
            "advice_unavailable": False,
            "advice_error": None,
            "advice_streaming": True,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/advice/stream")
async def advice_stream(request: AdviceRequest) -> StreamingResponse:
    def token_generator():
        try:
            for chunk in stream_advice(
                request.disease,
                request.plant,
                request.confidence,
                request.is_healthy,
            ):
                yield chunk
        except Exception as e:
            yield (
                "\n\n## Advice Unavailable\n"
                f"- Streaming advice failed: {str(e)}\n"
                "- Check Ollama provider settings and try again."
            )

    return StreamingResponse(token_generator(), media_type="text/plain; charset=utf-8")


@app.post("/chat")
async def chat(request: ChatRequest) -> dict:
    """Context-aware chatbot for follow-up questions about detected disease."""
    try:
        history = [m.dict() for m in request.history]
        response = chat_with_context(request.disease, request.plant, request.question, history)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    def token_generator():
        try:
            history = [m.dict() for m in request.history]
            for chunk in stream_chat_with_context(request.disease, request.plant, request.question, history):
                yield chunk
        except Exception as e:
            yield f"\n\nChat failed: {str(e)}"

    return StreamingResponse(token_generator(), media_type="text/plain; charset=utf-8")
