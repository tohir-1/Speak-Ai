"""SpeakAI AI-service: FastAPI. Ishga tushirish: python app.py"""
import functools
import logging
import os
import tempfile
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import uvicorn  # noqa: E402
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile  # noqa: E402
from fastapi.responses import Response  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

import speech_to_text  # noqa: E402
import summarizer  # noqa: E402
import text_to_speech  # noqa: E402
import translator  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("ai-service")

TOKEN = os.getenv("AI_SERVICE_TOKEN", "")
MAX_UPLOAD = int(float(os.getenv("MAX_FILE_MB", "20")) * 1024 * 1024) * 4  # WAV 16kHz hajmi asl fayldan katta bo'ladi


def check_token(x_token: Optional[str] = Header(default=None)):
    if TOKEN and x_token != TOKEN:
        raise HTTPException(status_code=401, detail="Noto'g'ri token")


app = FastAPI(title="SpeakAI AI service", dependencies=[Depends(check_token)])


class TtsIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    lang: str = "uz"
    gender: str = "female"


class TranslateIn(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    src: str = "auto"
    tgt: str


class SummarizeIn(BaseModel):
    text: str = Field(min_length=1, max_length=50000)
    lang: Optional[str] = None


def resource_guard(fn):
    """MemoryError / model yuklanmagan holatlarini 503 ga aylantiradi."""
    @functools.wraps(fn)
    def wrapper(*a, **kw):
        try:
            return fn(*a, **kw)
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except MemoryError:
            raise HTTPException(status_code=503, detail="Serverda xotira yetarli emas. Kichikroq model tanlang (.env).")
        except RuntimeError as e:
            msg = str(e)
            if "out of memory" in msg.lower():
                raise HTTPException(status_code=503, detail="Server xotirasi yetarli emas. Kichikroq model tanlang.")
            log.exception("Runtime xato")
            raise HTTPException(status_code=500, detail="Ichki xato")
        except OSError as e:
            log.exception("Model yuklanmadi")
            raise HTTPException(status_code=503, detail=f"Model yuklanmadi (internet yoki disk muammosi): {str(e)[:150]}")
        except Exception:
            log.exception("Kutilmagan xato")
            raise HTTPException(status_code=500, detail="Ichki xato")
    return wrapper


@app.get("/health")
def health():
    return {"ok": True, "whisper": os.getenv("WHISPER_MODEL", "small"), "tts_langs": sorted(text_to_speech.MMS_MODELS),
            "translate_model": os.getenv("NLLB_MODEL", "facebook/nllb-200-distilled-600M"),
            "llm": bool(os.getenv("OLLAMA_MODEL"))}


@app.post("/stt")
@resource_guard
def stt(file: UploadFile = File(...), language: Optional[str] = Form(default=None)):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        total = 0
        while chunk := file.file.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_UPLOAD:
                raise HTTPException(status_code=400, detail="Fayl juda katta")
            tmp.write(chunk)
        path = tmp.name
    try:
        return speech_to_text.transcribe(path, language)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


@app.post("/tts")
@resource_guard
def tts(body: TtsIn):
    wav, engine = text_to_speech.synthesize(body.text, body.lang, body.gender)
    return Response(content=wav, media_type="audio/wav", headers={"X-Engine": engine})


@app.post("/translate")
@resource_guard
def translate(body: TranslateIn):
    return translator.translate(body.text, body.src, body.tgt)


@app.post("/summarize")
@resource_guard
def summarize(body: SummarizeIn):
    return summarizer.summarize(body.text, body.lang)


if __name__ == "__main__":
    uvicorn.run(app, host=os.getenv("AI_SERVICE_HOST", "127.0.0.1"), port=int(os.getenv("AI_SERVICE_PORT", "8008")), log_level="info")
