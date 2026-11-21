# 🎙️ SpeakAI — Telegram bot

Ovoz → Matn · Matn → Ovoz · Voice Changer · Tarjima · AI Xulosa · Referral · Web admin panel.
**Faqat bepul open-source texnologiyalar. Hech qanday pullik API yo‘q.**

---

## 1. Arxitektura

```
 Telegram ◄──► [ Node.js: Telegraf bot ] ──HTTP──► [ Python: FastAPI ai-service ]
                    │   │                              ├─ faster-whisper  (Ovoz → Matn)
                    │   │                              ├─ MMS-TTS / Piper (Matn → Ovoz)
                    │   │                              ├─ NLLB-200        (Tarjima)
                    │   │                              └─ Ollama / extractive (Xulosa)
                    │   └── FFmpeg (spawn, shell'siz): konvertatsiya + 12 ta Voice Changer effekti
                    └────── SQLite (better-sqlite3)  ◄── Express admin panel (JWT, dark UI)
```

* **Node jarayoni** (`npm start`) bot **va** admin panelni birga ishga tushiradi (broadcast bot orqali ketadi).
* **Python jarayoni** (`ai-service`) og‘ir AI modellarni alohida saqlaydi — bot yiqilmasdan modelni yangilash/qayta ishga tushirish mumkin.
* Audio fayllar `audio/temp/` da vaqtincha turadi, ish tugagach o‘chadi; qolib ketganlari har 5 daqiqada tozalanadi (`TEMP_TTL_MINUTES`).
* Transkripsiya matni faqat sessiya xotirasida turadi, bazaga yozilmaydi. Bazada faqat hisoblagichlar saqlanadi.

## 2. Apparat talablari (lokal modellar)

| Komponent | Model | Disk | RAM | Izoh |
|---|---|---|---|---|
| Whisper `tiny/base` | faster-whisper | 75–150 MB | ~1 GB | Tez, lekin o‘zbekcha aniqligi past |
| Whisper `small` *(default)* | faster-whisper | ~460 MB | ~2 GB | Yaxshi muvozanat |
| Whisper `medium` | faster-whisper | ~1.5 GB | ~5 GB | O‘zbek/rus uchun sezilarli aniqroq, CPU da sekin |
| Whisper `large-v3` | faster-whisper | ~3 GB | ~8 GB / GPU 6 GB+ | Eng aniq; GPU tavsiya etiladi |
| Tarjima | NLLB-200 600M | ~2.5 GB | ~3 GB | `NLLB_MODEL` ni 1.3B ga almashtirsa aniqroq (ko‘proq RAM) |
| TTS | MMS-TTS (har til ~150 MB) | ~1 GB jami | ~1 GB | Til birinchi ishlatilganda yuklanadi |

Minimal tavsiya: **4 yadroli CPU, 8 GB RAM, 10 GB bo‘sh disk**. GPU bo‘lsa `.env` da `WHISPER_DEVICE=cuda`, `WHISPER_COMPUTE=float16`.
Birinchi ishga tushirishda modellar internetdan **bir marta** yuklanadi (keyin offline ishlaydi).

## 3. ⚠️ Cheklovlar (halol ma’lumot)

* **O‘zbek tili STT**: Whisper o‘zbekchani qo‘llaydi, lekin ingliz/rus tiliga qaraganda xato ko‘proq (ayniqsa shovqin, lahja, uzun gaplarda). Shuning uchun transkripsiyani **✏️ Tahrirlash** imkoni bor. Aniqlik uchun `medium` yoki `large-v3` tanlang.
* **O‘zbek tili TTS**: MMS-TTS o‘zbek (lotin) tilini qo‘llaydi, ovoz sifati "robotroq" va intonatsiyasi cheklangan. Har tilga **bitta** ovoz bor — erkak/ayol tanlash faqat Piper ovoz fayllari qo‘yilganda ishlaydi (4-bo‘lim oxiri). Piper bo‘lmasa bot MMS ovozidan foydalanadi va tanlov hech narsani o‘zgartirmaydi.
* **Tarjima**: NLLB o‘zbek *lotin* yozuvini qo‘llaydi; kirill yozuvidagi o‘zbek matni avtomatik lotinga o‘giriladi. Til aniqlash evristik — noto‘g‘ri aniqlansa, "📥 Manba tili" tugmasi bilan qo‘lda tanlang.
* **AI Xulosa**: Ollama bo‘lmasa *extractive* zaxira usuli ishlaydi (muhim gaplarni tanlaydi, qayta yozmaydi). Sifatli xulosa uchun Ollama o‘rnating (`ollama pull qwen2.5:7b`, `.env` da `OLLAMA_MODEL=qwen2.5:7b`).
* **Voice Changer** faqat tembr/ohangni o‘zgartiradi, boshqa odam ovoziga aylantirmaydi. RVC kabi voice-conversion modeli qo‘shilsa — faqat foydalanishga ruxsat berilgan ovoz modellaridan foydalaning.
* **Telegram limiti**: oddiy Bot API orqali bot **20 MB** gacha faylni yuklab ola oladi. Kattaroq fayllar uchun lokal [Telegram Bot API server](https://github.com/tdlib/telegram-bot-api) o‘rnatib `TELEGRAM_API_ROOT` ni ko‘rsating.
* Bot uzoq jarayonlarda (STT) bir vaqtda `JOB_CONCURRENCY` ta ishni bajaradi, qolganlari navbatda kutadi; har foydalanuvchi uchun bir vaqtda bitta ish.

## 4. Windows uchun o‘rnatish (PowerShell)

> Barcha buyruqlarni **loyiha papkasida** (`SpeakAI`) PowerShell'da bajaring.

**1) Node.js (LTS 20 yoki 22)**
```powershell
winget install OpenJS.NodeJS.LTS
```
Terminalni yopib qayta oching, tekshiring:
```powershell
node -v
npm -v
```

**2) Python 3.12**
```powershell
winget install Python.Python.3.12
```
Terminalni qayta oching:
```powershell
py -3.12 --version
```

**3) FFmpeg**
```powershell
winget install Gyan.FFmpeg
```
Terminalni qayta oching:
```powershell
ffmpeg -version
ffprobe -version
```

**4) Python virtual environment**
```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
```
Agar "running scripts is disabled" xatosi chiqsa:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**5) Python paketlari (faster-whisper va boshqalar)**
```powershell
python -m pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```
(NVIDIA GPU bo‘lsa, birinchi qatorni o‘tkazib yuborib, `pip install -r requirements.txt` ni o‘zi yetarli.)

**6) Node.js paketlari**
```powershell
npm install
```
Agar `better-sqlite3` o‘rnatilmasa, Visual Studio Build Tools (C++ workload) o‘rnating yoki Node LTS versiyasidan foydalaning.

**7) `.env` faylini sozlash**
```powershell
copy .env.example .env
notepad .env
```
To‘ldiring:
* `BOT_TOKEN` — 8-bosqichdan;
* `ADMIN_TELEGRAM_IDS` — sizning Telegram ID (ID ni @userinfobot dan bilib oling);
* `JWT_SECRET` — quyidagi buyruq natijasini qo‘ying:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
* `ADMIN_PASSWORD` — admin panel paroli (kamida 8 belgi, kuchli parol tanlang);
* `AI_SERVICE_TOKEN` — ixtiyoriy, xuddi shunday tasodifiy kalit.

**8) Telegram BotFather orqali token olish**
1. Telegram'da **@BotFather** ni oching → `/newbot`.
2. Bot nomini kiriting (masalan: `SpeakAI`).
3. Username kiriting (oxiri `bot` bilan tugasin, masalan `speakai_demo_bot`).
4. BotFather bergan tokenni `.env` dagi `BOT_TOKEN=` ga qo‘ying. **Tokenni hech kimga bermang.**

**9) Botni ishga tushirish** — ikkita alohida terminal kerak.

*Terminal 1 — AI service (birinchi marta modellar yuklanadi, vaqt oladi):*
```powershell
.\.venv\Scripts\Activate.ps1
python ai-service\app.py
```
*Terminal 2 — bot + admin panel:*
```powershell
npm start
```
(Yoki ikki marta bosib: `run-ai.bat` va `run-bot.bat`.)

**10) Admin panel**
Brauzerda oching: **http://127.0.0.1:3000** — login `ADMIN_USERNAME` (default `admin`) va `ADMIN_PASSWORD`.
Faqat admin panelni (botsiz) ishga tushirish: `npm run admin`.

**Effektlarni tekshirish (FFmpeg):**
```powershell
npm run test:effects
```

### Ixtiyoriy: Piper (erkak/ayol ovoz)
[Piper](https://github.com/rhasspy/piper) ni o‘rnating, ovoz modellarini (`.onnx` + `.onnx.json`) bitta papkaga `uz-male.onnx`, `ru-female.onnx`, `en-male.onnx` kabi nomlar bilan qo‘ying va `.env` da `PIPER_MODELS_DIR` hamda `PIPER_BIN` ni ko‘rsating. Fayl bo‘lmagan til/jins uchun MMS ishlatiladi.

## 5. Bot imkoniyatlari

| Tugma | Nima qiladi |
|---|---|
| 🎤 Ovoz → Matn | Voice/MP3/WAV/M4A/OGG/MP4 → transkripsiya, til, davomiylik; ✏️ tahrirlash, 📄 TXT, 🌍 tarjima, 📝 xulosa |
| 🔊 Matn → Ovoz | Til/ovoz tanlash, tezlik va pitch, MP3 yoki WAV |
| 🎭 Voice Changer | 12 effekt (bir nechtasini birlashtirish), pitch/tezlik/balandlik, asl ovoz, MP3 + WAV yuklab olish |
| 🌍 Tarjima | 14 til, manba tilini avto/qo‘lda, natijani ovozga aylantirish |
| 📝 AI Xulosa | Matn yoki audio → mavzu, fikrlar, ma’lumotlar, xulosa, vazifalar |
| 📊 Statistika | Shaxsiy hisoblagichlar |
| 👥 Taklif | `t.me/BOT?start=ref_ID` havola, reyting; o‘zini taklif qilish va takroriy hisoblash bloklangan |
| ⚙️ Sozlamalar | STT tili, TTS til/ovoz/tezlik/pitch/format |

Admin buyruqlari (faqat adminlar): `/admin`, `/broadcast matn`, `/block ID`, `/unblock ID`.

## 6. Xavfsizlik

* Token va parollar faqat `.env` da (`.gitignore` da). `JWT_SECRET` bo‘lmasa dastur ishga tushmaydi.
* Admin: bcrypt parollar, JWT `httpOnly` + `SameSite=Strict` cookie, login uchun rate limit, Helmet + qat’iy CSP, faqat JSON so‘rovlar.
* Bot: fayl turi (ffprobe bilan haqiqiy audio ekani) va hajm/davomiylik limiti, foydalanuvchiga rate limit, bir vaqtda bitta ish, FFmpeg `shell`siz ishga tushiriladi.
* Admin panel default `127.0.0.1` da. Serverda tashqaridan ochmoqchi bo‘lsangiz, HTTPS reverse proxy (Caddy/Nginx) orqasiga qo‘ying va `COOKIE_SECURE=true` qiling.
* Xatolar `logs/app.log` ga yoziladi.

## 7. Loyiha tuzilmasi
```
bot/ (index, bot, handlers/, keyboards/, middleware/, aiClient)   ai-service/ (app, speech_to_text, text_to_speech, translator, summarizer)
audio/ (processor, effects, temp/)   database/ (db.js, schema.sql)   admin/ (server, routes/, public/)
config/settings.js   utils/ (logger, cleanup, broadcast)
```
