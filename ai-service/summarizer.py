"""AI xulosa: Ollama (lokal LLM) mavjud bo'lsa shuni ishlatadi, aks holda extractive usul."""
import json
import math
import os
import re
from collections import Counter

STOP = set("""va bilan uchun bu shu u ham yoki lekin ammo agar kabi bir juda endi men sen biz siz ular nima qanday
the and for are was were with that this from have has had not but you your they their will would can could about into
и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет
о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам сказал ведь там потом
себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под
bir ve bu da de için ile ama çok gibi daha olarak""".split())

TASK_MARKERS = re.compile(
    r"\b(kerak|lozim|shart|zarur|bajar|tayyorla|yubor|qil(ish|ing|amiz)|unutma|deadline|muddat|"
    r"must|should|need to|needs to|have to|todo|action item|please|"
    r"нужно|надо|необходимо|должен|должны|сделать|подготов|отправ|"
    r"gerek|yapılmalı|lazım)\b", re.I)


def _sentences(text):
    parts = re.split(r"(?<=[.!?…])\s+|\n+", text.strip())
    return [p.strip() for p in parts if len(p.strip()) > 15]


def _words(s):
    return [w for w in re.findall(r"\w+", s.lower()) if len(w) > 3 and w not in STOP and not w.isdigit()]


def _extractive(text):
    sents = _sentences(text) or [text.strip()]
    freq = Counter(w for s in sents for w in _words(s))
    scored = []
    for i, s in enumerate(sents):
        ws = _words(s)
        score = sum(freq[w] for w in ws) / math.sqrt(len(ws) + 1)
        if i == 0:
            score *= 1.25
        scored.append((score, i, s))
    n = max(2, min(5, len(sents) // 4 + 1))
    top = sorted(sorted(scored, reverse=True)[:n], key=lambda x: x[1])
    key_points = [s for _, _, s in top]
    keywords = [w for w, _ in freq.most_common(4)]
    topic = (sents[0][:200] + ("…" if len(sents[0]) > 200 else "")) if sents else ""
    if keywords:
        topic = f"{', '.join(keywords[:3]).capitalize()} — {topic}"
    facts = [s for s in sents if re.search(r"\d", s) and s not in key_points][:4]
    tasks = [s for s in sents if TASK_MARKERS.search(s)][:5]
    conclusion = sents[-1] if len(sents) > 1 else key_points[0]
    return {"topic": topic, "key_points": key_points, "facts": facts, "conclusion": conclusion,
            "tasks": tasks, "engine": "extractive"}


def _llm(text, lang):
    url = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "").strip()
    if not model:
        return None
    import requests

    prompt = (
        "Quyidagi matnni tahlil qil va FAQAT JSON qaytar. Javob matn tilida bo'lsin (o'zbek matni bo'lsa o'zbekcha).\n"
        'Format: {"topic": "bitta jumla", "key_points": ["..."], "facts": ["raqam/sana/ism kabi muhim ma\'lumotlar"], '
        '"conclusion": "yakuniy xulosa", "tasks": ["bajarilishi kerak bo\'lgan vazifalar, bo\'lmasa bo\'sh ro\'yxat"]}\n'
        "Hech narsa o'ylab topma, faqat matndagi ma'lumotdan foydalan.\n\nMATN:\n" + text
    )
    try:
        r = requests.post(f"{url}/api/generate", json={"model": model, "prompt": prompt, "stream": False, "format": "json"}, timeout=300)
        r.raise_for_status()
        data = json.loads(r.json().get("response", "{}"))
        if not isinstance(data, dict) or not data.get("topic"):
            return None
        lst = lambda v: [str(x) for x in v][:8] if isinstance(v, list) else []  # noqa: E731
        return {"topic": str(data.get("topic", "")), "key_points": lst(data.get("key_points")), "facts": lst(data.get("facts")),
                "conclusion": str(data.get("conclusion", "")), "tasks": lst(data.get("tasks")), "engine": "llm"}
    except Exception:  # noqa: BLE001
        return None


def summarize(text: str, lang=None) -> dict:
    text = text.strip()
    if not text:
        raise ValueError("Matn bo'sh")
    return _llm(text, lang) or _extractive(text)
