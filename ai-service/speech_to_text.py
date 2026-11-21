"""Speech-to-Text: faster-whisper (OpenAI Whisper, CTranslate2)."""
import os
import threading

_model = None
_lock = threading.Lock()


def get_model():
    global _model
    with _lock:
        if _model is None:
            from faster_whisper import WhisperModel

            size = os.getenv("WHISPER_MODEL", "small")
            device = os.getenv("WHISPER_DEVICE", "cpu")
            compute = os.getenv("WHISPER_COMPUTE", "int8")
            _model = WhisperModel(size, device=device, compute_type=compute)
        return _model


def transcribe(path: str, language=None) -> dict:
    """16 kHz mono WAV faylni matnga aylantiradi. language=None bo'lsa avtomatik aniqlanadi."""
    model = get_model()
    segments, info = model.transcribe(
        path,
        language=language or None,
        beam_size=5,
        vad_filter=True,          # sukunatni o'tkazib yuboradi, "gallyutsinatsiya"ni kamaytiradi
        condition_on_previous_text=False,
    )
    text = " ".join(s.text.strip() for s in segments).strip()
    return {
        "text": text,
        "language": info.language,
        "probability": round(float(info.language_probability), 3),
        "duration": round(float(info.duration), 2),
    }
