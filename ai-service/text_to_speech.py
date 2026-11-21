"""Text-to-Speech.

1) Piper (ixtiyoriy) — PIPER_MODELS_DIR da `{til}-{male|female}.onnx` bo'lsa, erkak/ayol ovoz tanlanadi.
2) Aks holda Meta MMS-TTS (VITS, bepul, o'zbek tilini ham qo'llaydi). MMS da har tilga bitta ovoz mavjud.
"""
import io
import os
import re
import shutil
import subprocess
import tempfile
import threading
import wave

import numpy as np

MMS_MODELS = {
    "uz": "facebook/mms-tts-uzb-script_latin",
    "ru": "facebook/mms-tts-rus",
    "en": "facebook/mms-tts-eng",
    "tr": "facebook/mms-tts-tur",
    "de": "facebook/mms-tts-deu",
    "fr": "facebook/mms-tts-fra",
    "es": "facebook/mms-tts-spa",
}

_cache = {}
_lock = threading.Lock()


def _load(lang):
    with _lock:
        if lang not in _cache:
            import torch  # noqa: F401
            from transformers import AutoTokenizer, VitsModel

            name = MMS_MODELS[lang]
            tok = AutoTokenizer.from_pretrained(name)
            if getattr(tok, "is_uroman", False):
                raise ValueError(f"'{lang}' tili uchun uroman kerak — bu til hozircha qo'llanmaydi.")
            model = VitsModel.from_pretrained(name)
            model.eval()
            _cache[lang] = (tok, model)
        return _cache[lang]


def _chunks(text: str, limit: int = 220):
    parts = re.split(r"(?<=[.!?…])\s+|\n+", text.strip())
    out, cur = [], ""
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if len(cur) + len(p) + 1 <= limit:
            cur = f"{cur} {p}".strip()
        else:
            if cur:
                out.append(cur)
            while len(p) > limit:  # juda uzun gapni so'zlar bo'yicha bo'lamiz
                cut = p.rfind(" ", 0, limit)
                cut = cut if cut > 0 else limit
                out.append(p[:cut])
                p = p[cut:].strip()
            cur = p
    if cur:
        out.append(cur)
    return out


def _wav_bytes(samples: np.ndarray, sr: int) -> bytes:
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def _piper(text, lang, gender):
    models_dir = os.getenv("PIPER_MODELS_DIR", "").strip()
    if not models_dir:
        return None
    model = os.path.join(models_dir, f"{lang}-{gender}.onnx")
    binary = shutil.which(os.getenv("PIPER_BIN", "piper"))
    if not (binary and os.path.isfile(model)):
        return None
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        out = tmp.name
    try:
        subprocess.run([binary, "--model", model, "--output_file", out], input=text.encode("utf-8"),
                       check=True, timeout=180, capture_output=True)
        with open(out, "rb") as f:
            return f.read()
    except (subprocess.SubprocessError, OSError):
        return None
    finally:
        try:
            os.unlink(out)
        except OSError:
            pass


def synthesize(text: str, lang: str, gender: str = "female"):
    """(wav_bytes, engine_nomi) qaytaradi."""
    lang = (lang or "uz").lower()
    if lang not in MMS_MODELS:
        raise ValueError(f"'{lang}' tili uchun ovoz mavjud emas. Qo'llanadigan tillar: {', '.join(sorted(MMS_MODELS))}")
    text = text.strip()
    if not text:
        raise ValueError("Matn bo'sh")

    data = _piper(text, lang, gender if gender in ("male", "female") else "female")
    if data:
        return data, f"Piper ({gender})"

    import torch

    tok, model = _load(lang)
    sr = model.config.sampling_rate
    gap = np.zeros(int(sr * 0.25), dtype=np.float32)
    pieces = []
    for chunk in _chunks(text):
        inputs = tok(chunk, return_tensors="pt")
        if inputs["input_ids"].shape[1] == 0:
            continue
        with torch.no_grad():
            wave_out = model(**inputs).waveform
        pieces.append(wave_out.squeeze().cpu().numpy().astype(np.float32))
        pieces.append(gap)
    if not pieces:
        raise ValueError("Bu matndan ovoz yaratib bo'lmadi (qo'llanmaydigan belgilar).")
    return _wav_bytes(np.concatenate(pieces), sr), "MMS-TTS"
