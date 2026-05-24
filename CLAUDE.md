# VocaFlow — CLAUDE.md

## What This App Is
Proactive productivity PWA. Two ways to create schedule (manual UI or 
voice via WebRTC + DTMF). Calls or notifies user before each session 
based on their preference. Records voice/text response. Logs raw text 
to Supabase. No LLM during any real-time interaction — only for 
daily/weekly summaries via Groq.

---

## Tech Stack
- Frontend: React + Vite (PWA) — deployed on Vercel
- Backend: FastAPI (Python) — deployed on Oracle Free Tier
- Signaling: Node.js + Socket.io (WebRTC) — Oracle Free Tier
- Database: Supabase (PostgreSQL)
- STT: Groq Whisper Large V3 API (used for ALL voice input)
- TTS: Edge TTS — en-US-JennyNeural (MVP), Kokoro later
- Calls: WebRTC (PWA-based, no PSTN for free tier)
- Scheduler: APScheduler (triggers calls/notifications)
- LLM: Groq Llama 3.1 70B (daily/weekly summaries ONLY)
- Notifications: Web Push API

---

## Core Features

### 1. Schedule Creation
Two modes — both are equal first-class options:

**Manual UI:**
- Form with fields: task name, start time, duration, break after (optional)
- If no schedule set by morning cutoff → auto-copy previous day

**Voice (WebRTC + DTMF):**
- User taps "Create Schedule by Voice" → WebRTC session starts
- DTMF keypad flow:
  - Press 1 → say task name
  - Press 2 → say start time
  - Press 3 → say task duration
  - Press 4 → say break time after task (optional, skip = no gap)
  - Press 5 → add another task
  - Press 0 → finish and confirm
- Each voice input → Groq Whisper → parse into structured data
- Edge TTS reads back full schedule before user confirms
- `created_via` field saved as 'voice' or 'manual'

### 2. Pre-Session Contact (Call or Notification)
At session time, contact mode depends on preference hierarchy:
1. Per-session override (set during schedule creation)
2. User global default (Settings → Notifications)
3. System default: 'call'

**Call mode:**
- WebRTC rings user in PWA
- Edge TTS asks: "Your [task name] session starts now. What's your goal?"
- User speaks → Groq Whisper STT → save raw text to session_logs

**Notification mode:**
- Web Push notification arrives
- User taps → text input field in PWA
- User types intention → save raw text to session_logs

### 3. Task Extension
When session end time arrives and user needs more time:

**In call mode:**
- Call arrives for next session as normal
- User presses 1 → says "extended by X minutes"
- Whisper transcribes → parser extracts extension_minutes
- session_logs: extension_flag=true, extension_minutes=X
- Schedule shifts: next session start += extension_minutes

**In notification mode:**
- Notification arrives for next session
- User taps → sees [Start Session] or [Extend previous task]
- Extension text field → user types "30 minutes"
- Same logging and schedule shift logic

### 4. AI Summaries (Groq — NOT real-time)
- Daily: runs at midnight, pulls all session_logs for that day
- Weekly: runs Sunday night, pulls 7 daily_summaries
- Both use Groq Llama 3.1 70B
- Results saved to daily_summaries and weekly_summaries tables

---

## Database Tables
- `users` — id, contact_default (call/notification)
- `schedules` — task_name, start_time, duration_minutes, break_after_minutes, contact_preference (call/notification/default), date, created_via (manual/voice)
- `session_logs` — raw_text, input_mode (voice/text), extension_flag, extension_minutes, mood_signal, schedule_id
- `daily_summaries` — summary, completion_rate, total_extensions
- `weekly_summaries` — summary, patterns

---

## Critical Rules — Never Break These
1. NEVER call LLM/Groq during any real-time session, call, or notification
2. ALWAYS save raw STT text to session_logs first — processing happens after
3. Groq API called max once per user per day (daily summary) + once per week
4. All API keys via environment variables — never hardcode
5. Every Supabase query must have try/except
6. Every WebRTC event must have error handler
7. Extension flag must always be logged — even if parsing fails, save raw text
8. Contact preference resolution order: per-session → global default → 'call'

---

## Dev Commands
- Frontend: `cd frontend && npm run dev`
- Backend: `cd backend && uvicorn main:app --reload`
- Signaling: `cd signaling && node server.js`
- Tests: `cd backend && pytest`

## File Structure
```
vocaflow/
├── frontend/
│   └── src/
│       ├── components/     # React components (one per file)
│       │   ├── Schedule/   # Manual schedule UI
│       │   ├── VoiceSchedule/  # WebRTC voice schedule flow
│       │   ├── CallScreen/ # Incoming call UI
│       │   ├── Extension/  # Task extension UI
│       │   └── Settings/   # User preferences
│       ├── hooks/
│       │   ├── useWebRTC.ts
│       │   ├── useDTMF.ts
│       │   └── useSchedule.ts
│       └── services/
│           ├── push.ts     # Web Push API
│           └── supabase.ts
├── backend/
│   ├── routers/
│   │   ├── schedules.py
│   │   ├── sessions.py
│   │   ├── extensions.py
│   │   └── summaries.py
│   └── services/
│       ├── stt.py          # Groq Whisper
│       ├── tts.py          # Edge TTS
│       ├── scheduler.py    # APScheduler
│       ├── groq_summary.py # Daily/weekly Groq jobs
│       ├── dtmf.py         # DTMF tone detection
│       └── parser.py       # Voice input → structured data
└── signaling/
    └── server.js           # WebRTC Socket.io signaling

## Available Custom Skills
- /new-component — create React component
- /new-route — create FastAPI route
- /db-migration — generate Supabase migration
- /commit — conventional commit message
- /review — pre-commit security and architecture review
```