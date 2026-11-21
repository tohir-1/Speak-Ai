"""Tarjima: Meta NLLB-200 (bepul, lokal). O'zbek (lotin) tilini qo'llaydi."""
import os
import re
import threading

NLLB = {
    "uz": "uzn_Latn", "ru": "rus_Cyrl", "en": "eng_Latn", "tr": "tur_Latn", "de": "deu_Latn", "fr": "fra_Latn",
    "es": "spa_Latn", "it": "ita_Latn", "ar": "arb_Arab", "zh": "zho_Hans", "ko": "kor_Hang", "ja": "jpn_Jpan",
    "kk": "kaz_Cyrl", "tg": "tgk_Cyrl",
}

_tok = None
_model = None
_lock = threading.Lock()

_UZ_CYR = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "j", "з": "z", "и": "i", "й": "y",
    "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f",
    "х": "x", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "’", "ь": "", "ы": "i", "э": "e", "ю": "yu", "я": "ya",
    "ў": "o‘", "қ": "q", "ғ": "g‘", "ҳ": "h",
}


def _uz_cyr_to_lat(text: str) -> str:
    out = []
    for ch in text:
        low = ch.lower()
        if low in _UZ_CYR:
            rep = _UZ_CYR[low]
            out.append(rep.capitalize() if ch != low else rep)
        else:
            out.append(ch)
    return "".join(out)


def _load():
    global _tok, _model
    with _lock:
        if _model is None:
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

            name = os.getenv("NLLB_MODEL", "facebook/nllb-200-distilled-600M")
            _tok = AutoTokenizer.from_pretrained(name)
            _model = AutoModelForSeq2SeqLM.from_pretrained(name)
            _model.eval()
        return _tok, _model


def detect(text: str) -> str:
    """Matn tilini taxminan aniqlaydi (o'zbek uchun maxsus evristika bilan)."""
    cyr = len(re.findall(r"[А-Яа-яЁёЎўҚқҒғҲҳ]", text))
    lat = len(re.findall(r"[A-Za-z]", text))
    if cyr > lat:
        return "uz" if re.search(r"[ЎўҚқҒғҲҳ]", text) else "ru"
    low = text.lower()
    if re.search(r"o[‘’'`ʻ]|g[‘’'`ʻ]|\b(va|bilan|uchun|emas|bor|yo['‘’`ʻ]q|salom|rahmat|men|sen|biz|siz|nima|qanday)\b", low):
        return "uz"
    try:
        from langdetect import DetectorFactory, detect as ld

        DetectorFactory.seed = 0
        code = ld(text)
        code = {"zh-cn": "zh", "zh-tw": "zh"}.get(code, code)
        if code in NLLB:
            return code
    except Exception:  # noqa: BLE001
        pass
    return "en"


def _split(text: str, limit: int = 380):
    sentences = re.split(r"(?<=[.!?…])\s+|\n+", text.strip())
    out, cur = [], ""
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if len(cur) + len(s) + 1 <= limit:
            cur = f"{cur} {s}".strip()
        else:
            if cur:
                out.append(cur)
            while len(s) > limit:
                cut = s.rfind(" ", 0, limit)
                cut = cut if cut > 0 else limit
                out.append(s[:cut])
                s = s[cut:].strip()
            cur = s
    if cur:
        out.append(cur)
    return out


def translate(text: str, src: str, tgt: str) -> dict:
    tgt = (tgt or "").lower()
    if tgt not in NLLB:
        raise ValueError(f"Maqsad tili qo'llanmaydi: {tgt}")
    src = (src or "auto").lower()
    if src == "auto" or src not in NLLB:
        src = detect(text)
    if src == "uz" and re.search(r"[А-Яа-яЁёЎўҚқҒғҲҳ]", text):
        text = _uz_cyr_to_lat(text)
    if src == tgt:
        return {"text": text, "src": src, "tgt": tgt}

    import torch

    tok, model = _load()
    tok.src_lang = NLLB[src]
    bos = tok.convert_tokens_to_ids(NLLB[tgt])
    out = []
    for chunk in _split(text):
        inputs = tok(chunk, return_tensors="pt", truncation=True, max_length=400)
        with torch.no_grad():
            ids = model.generate(**inputs, forced_bos_token_id=bos, num_beams=4, max_new_tokens=512)
        out.append(tok.batch_decode(ids, skip_special_tokens=True)[0])
    return {"text": " ".join(out).strip(), "src": src, "tgt": tgt}
