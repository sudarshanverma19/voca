# VocaFlow — PROJECT_MEMORY.md
# Read this at the start of every new AI session before touching any code.
# Last updated: 2026-06-05

---

## What This App Is

Proactive productivity app. Users create work schedules (manually or by voice). The app contacts them at session start via a WebRTC call (rings the phone) or push notification. User speaks/types their intent (start / extend / skip). Raw STT text is logged to Supabase. Groq LLM runs only for daily/weekly summaries — NEVER during real-time sessions.

**Deployed targets:** Android APK (Capacitor shell wrapping a React PWA).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite, no router library (tab state only) |
| Mobile shell | Capacitor 8 (Android only — iOS not configured) |
| Backend | FastAPI (Python) + APScheduler + Uvicorn |
| Signaling | Node.js + Socket.io |
| Database | Supabase (PostgreSQL) |
| Session state | Redis (Upstash) — TTL-based, 90-min default |
| STT | Groq Whisper Large V3 |
| TTS | Browser `window.speechSynthesis` (MVP) / Edge TTS planned |
| LLM | Groq Llama 3.1 70B — summaries only (NOT YET BUILT) |
| Notifications | Web Push / FCM (NOT YET BUILT) |

**Dev commands:**
```
cd frontend   && npm run dev          # :5173
cd backend    && uvicorn main:app --reload  # :8000
cd signaling  && node server.js       # :3001
```

---

## Repository Structure

```
vocaflow/
├── frontend/
│   ├── capacitor.config.json         # appId: com.vocassistant.app
│   ├── src/
│   │   ├── App.jsx                   # Root — tab router, always mounts ActiveSessionModal
│   │   ├── config.js                 # API_URL + SOCKET_URL (env vars or LAN fallback)
│   │   ├── components/
│   │   │   ├── TodayView/            # Lists today's schedules from backend
│   │   │   ├── CreateSchedule/       # Manual schedule form
│   │   │   ├── VoiceSchedule/        # 4-step voice entry (hold-to-record per step)
│   │   │   ├── IncomingCallScreen/   # Full-screen ringing UI (presentational only)
│   │   │   ├── ActiveSessionModal/   # CORE — always mounted, polls backend, drives WebRTC
│   │   │   └── Settings/             # Contact preference — localStorage ONLY (not synced to DB)
│   │   ├── hooks/
│   │   │   ├── useWebRTC.js          # Dual-socket WebRTC lifecycle
│   │   │   └── useRingtone.js        # Web Audio API ringtone synthesis (no audio file)
│   │   ├── services/
│   │   │   ├── schedulesApi.js       # GET/POST/DELETE /schedules
│   │   │   ├── sessionApi.js         # GET /active-session, POST /transition-decision, POST /voice-decision
│   │   │   └── sttApi.js             # POST /stt
│   │   └── plugins/
│   │       └── AlarmPlugin.js        # JS bridge → native AlarmPlugin.java (no-op on web/iOS)
│   └── android/app/src/main/java/com/vocassistant/app/
│       ├── MainActivity.java         # Extends BridgeActivity, fires vocaflow:incoming_call JS event
│       ├── AlarmPlugin.java          # Capacitor plugin: scheduleAlarm, cancelAlarm, dismissAlarm
│       ├── AlarmReceiver.java        # BroadcastReceiver: ALARM_FIRE + BOOT_COMPLETED
│       ├── AlarmService.java         # ForegroundService: ringtone + vibration + notification
│       └── AlarmStorage.java         # SharedPreferences JSON store for boot rescheduling
├── backend/
│   ├── main.py                       # FastAPI app, CORS, router registration, APScheduler startup
│   ├── db.py                         # Singleton Supabase client (service key)
│   ├── redis_client.py               # Singleton Redis client (REDIS_URL required)
│   ├── utils.py                      # parse_datetime() — Asia/Kolkata aware datetime
│   ├── routers/
│   │   ├── schedules.py              # CRUD + copy-previous + auto-APScheduler registration
│   │   ├── session_logs.py           # Insert log + mood detection + shift next schedule
│   │   ├── transition.py             # POST /transition-decision (completed/extend/skip)
│   │   ├── trigger.py                # POST /trigger-session (manual/admin trigger)
│   │   ├── active_session.py         # GET /active-session/:userId (Redis read)
│   │   ├── voice_decision.py         # POST /voice-decision (STT + intent, no DB write)
│   │   └── stt.py                    # POST /stt (schedule or general context)
│   └── services/
│       ├── scheduler.py              # PRIMARY — APScheduler with "date" trigger (one-shot)
│       ├── scheduler_service.py      # DEAD CODE — duplicate with "cron" trigger, not used by main.py
│       ├── active_session_service.py # store/get/extend/clear Redis sessions
│       ├── trigger_service.py        # Fetch schedule from Supabase → write to Redis → return payload
│       ├── transition_service.py     # Insert session_log + shift_next_schedule + process_voice_decision
│       ├── intent.py                 # STT correction + fuzzy match → { intent, duration, low_confidence }
│       ├── redis_service.py          # Raw Redis primitives (set/get/update/delete with JSON + TTL)
│       └── stt.py                    # Groq Whisper API call
└── signaling/
    └── server.js                     # Socket.io signaling (userSockets Map + sessions Map)
```

---

## Database Schema (Supabase / PostgreSQL)

```sql
-- users
id               UUID  PK
contact_default  TEXT  ('call' | 'notification')

-- schedules
id                   SERIAL PK (integer — Pydantic models use Union[int, str])
user_id              UUID FK → users.id
task_name            TEXT
date                 DATE
start_time           TEXT  -- "HH:MM" format
duration_minutes     INT
break_after_minutes  INT   nullable
contact_preference   TEXT  ('call' | 'notification' | 'default')
created_via          TEXT  ('manual' | 'voice')

-- session_logs
id                UUID PK
user_id           UUID FK → users.id
schedule_id       INT  FK → schedules.id  (nullable)
session_time      TIMESTAMPTZ
raw_text          TEXT  -- NEVER modified after insert
input_mode        TEXT  ('voice' | 'text')
extension_flag    BOOL
extension_minutes INT  nullable
mood_signal       TEXT  nullable ('positive' | 'negative' | null)

-- daily_summaries    [DECLARED IN SPEC — NOT YET BUILT]
-- weekly_summaries   [DECLARED IN SPEC — NOT YET BUILT]
```

**Supabase client:** Uses `SUPABASE_SERVICE_KEY` (service role — bypasses all RLS).
**No RLS policies exist** — auth is not implemented.

---

## Redis Session Schema

Two keys are written per triggered session:

**Key 1:** `session:{userId}` — what the frontend polls
```json
{
  "session_id": "<userId>",
  "schedule_id": 42,
  "task": "Deep Work",
  "message": "Your next task is Deep Work",
  "question": "Have you completed your previous task?",
  "options": ["completed", "extend", "skip"],
  "status": "active",
  "start_time": "2026-06-05T10:00:00Z",
  "extension_time": null,
  "last_updated": "2026-06-05T10:00:00Z"
}
```

**Key 2:** `session:{scheduleId}` — trigger metadata (written by trigger_service)
```json
{
  "user_id": "<userId>",
  "task_name": "Deep Work",
  "start_time": "10:00",
  "status": "triggered"
}
```

**TTL:** 90 minutes (`DEFAULT_TTL = 5400`).
**Terminal statuses** (`completed`, `skipped`) are hidden by `get_session()` before TTL expires.

---

## Supabase Integration Details

- Client initialised lazily in `db.py` (singleton `_client`)
- All queries in try/except — failures raise `HTTPException`
- `schedules` rows use integer PK (`SERIAL`) — all Pydantic response models declare `id: Union[int, str]`
- `users` table auto-upserted on every `POST /schedules` call (no auth yet)
- Foreign key inserts: parent row always ensured before child row

**Environment vars required:**
```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```

---

## Signaling Server Details (`signaling/server.js`)

**Port:** `process.env.PORT || 3000` (frontend config.js defaults to `:3001`)

**In-memory state (lost on restart):**
- `userSockets: Map<userId → socketId>` — only latest socket per user
- `sessions: Map<sessionId → { callerId, calleeId, room }>` — active rooms

**Socket events:**

| Client → Server | Server → Client | Description |
|---|---|---|
| `register { user_id }` | `registered { user_id }` | Register userId; evicts stale socket |
| `call:start { session_id, callee_user_id }` | `call:incoming { session_id }` to callee | Initiates call, creates room |
| — | `call:callee_offline { session_id }` | Callee not registered |
| `call:join { session_id }` | `call:callee_joined { session_id }` to caller | Callee joins room |
| `webrtc:offer { session_id, sdp }` | relayed to room | SDP offer relay |
| `webrtc:answer { session_id, sdp }` | relayed to room | SDP answer relay |
| `webrtc:ice-candidate { session_id, candidate }` | relayed to room | ICE relay |
| `call:end { session_id }` | `call:ended { session_id }` | Terminates session |

---

## WebRTC Implementation

### Dual-Socket Pattern (Critical Design Decision)
Socket.io's `socket.to(room)` **excludes the sender**. One socket cannot be both caller and callee. Solution: two connections per call:
- **`userSocket`** — permanent, registered with userId → **callee role**
- **`systemSocket`** — ephemeral per call → **caller role**

### ICE Config
```js
{ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
```
⚠️ **No TURN server** — calls fail behind symmetric NAT.

### Call State Machine
```
idle → ringing → connecting → connected → idle (via cleanup)
```

### Ringtone
- Synthesised via Web Audio API (480 Hz + 620 Hz dual tone)
- No audio file required — generated on the fly
- Singleton `AudioContext` shared across all hook instances
- `navigator.vibrate()` for Android haptics
- AudioContext unlocked on first user touch/click (Android WebView requirement)

---

## Scheduling System

### Flow: Schedule Created → APScheduler Job

```
POST /schedules
  → Supabase INSERT schedules
  → If date == today:
      parse_datetime(date, start_time)  # Asia/Kolkata timezone
      APScheduler.add_job(
        func=_run_trigger,
        trigger="date",          # fires ONCE at run_date
        run_date=aware_datetime,
        id="session_{schedule_id}",
        replace_existing=True,
        misfire_grace_time=60    # fires up to 60s late
      )
  → scheduleNativeAlarm(result) → Android AlarmManager
```

### On Server Startup (`_load_todays_sessions`)
Loads ALL of today's schedules from Supabase and registers APScheduler jobs for future ones. Past times are skipped. Future dates are NOT handled (they'll be loaded next day on startup).

### When Job Fires (`_run_trigger`)
```python
trigger_service.trigger_session(user_id, schedule_id)
  → Supabase SELECT schedules WHERE id=schedule_id
  → redis_service.set_session(scheduleId, metadata)
  → return payload

active_session_service.store_session(userId, scheduleId, task)
  → redis_service.set_session(userId, full_session_data, ttl=90min)
```

### Test Mode
`_TEST_DELAY_SECS = 0` in `scheduler.py`. Set to `30` to fire any new task in 30 seconds for testing. **Must be 0 in production.**

### Dead Code Warning
`services/scheduler_service.py` exists with identical logic but uses `cron` trigger (repeating) instead of `date` (one-shot). It is **NOT imported by main.py**. Only `services/scheduler.py` is active.

---

## Android-Specific Behavior

### Alarm Pipeline
```
AlarmPlugin.js.scheduleNativeAlarm(schedule)
  → AlarmPlugin.java.scheduleAlarm({ taskName, scheduleId, triggerAtMs })
    → AlarmManager.setExactAndAllowWhileIdle(RTC_WAKEUP, triggerAtMs, pendingIntent)
    → AlarmStorage.save(scheduleId, taskName, triggerAtMs)   # SharedPreferences JSON

  At triggerAtMs:
    AlarmReceiver.onReceive("com.vocassistant.app.ALARM_FIRE")
      → ContextCompat.startForegroundService(AlarmService)
        → AlarmService.startForeground(notification)
          - CATEGORY_ALARM, PRIORITY_MAX, VISIBILITY_PUBLIC
          - setFullScreenIntent(openAppIntent, true) → lock screen takeover
          - "Dismiss" action → ACTION_DISMISS
        → RingtoneManager.TYPE_ALARM.play() (looping, max volume)
        → Vibrator.vibrate(pattern, repeat=0)
        → Thread.sleep(60_000) → auto-dismiss

  User taps notification:
    MainActivity.onNewIntent() → checkIntentForAlarm()
    → bridge.triggerWindowJSEvent("vocaflow:incoming_call", { scheduleId })
    → ActiveSessionModal event listener → force-poll → WebRTC call starts
```

### Boot Rescheduling
`AlarmReceiver` handles `BOOT_COMPLETED` / `LOCKED_BOOT_COMPLETED`:
- Loads all entries from `AlarmStorage`
- Re-registers future alarms with `AlarmManager`
- Removes past alarms from storage

### Permissions (all in AndroidManifest.xml)
`INTERNET`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `WAKE_LOCK`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `USE_FULL_SCREEN_INTENT`, `POST_NOTIFICATIONS`, `VIBRATE`

### First-Launch Permission Dialogs
`App.jsx useEffect` calls `requestAlarmPermissions()` once on mount:
1. Opens battery optimisation exemption dialog (Doze bypass)
2. Opens exact-alarm permission dialog (Android 12+ only)

---

## Key API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/schedules/{date}?user_id=X` | Today's schedule list |
| POST | `/schedules` | Create + auto-schedule |
| DELETE | `/schedules/{id}` | Delete (does NOT cancel APScheduler job — bug) |
| POST | `/schedules/copy-previous` | Copy yesterday's schedule to today |
| GET | `/active-session/{userId}` | Frontend polls this every 5 s |
| POST | `/trigger-session` | Manual trigger (admin/testing) |
| POST | `/transition-decision` | User decision: completed/extend/skip |
| POST | `/voice-decision` | STT + intent detection (returns intent, no DB write) |
| POST | `/stt` | Groq Whisper transcription |
| GET | `/session-logs/{userId}` | All logs for user |
| GET | `/session-logs/{userId}/{date}` | Logs for specific date |
| GET | `/health` | Health check |

---

## Contact Preference Resolution

1. Per-session override (set during schedule creation: `contact_preference` field)
2. User global default (Settings — stored in **localStorage** only, NOT in Supabase)
3. System default: `'call'`

**⚠️ Known bug:** User global default from `localStorage` is never read by the backend. The frontend hardcodes `contact_preference: 'default'` in VoiceSchedule and lets the user pick in CreateSchedule — but the backend's resolution logic relies on a `users.contact_default` field that is never written.

---

## Voice Flow (VoiceSchedule)

4-step wizard — each step:
1. Hold mic button → MediaRecorder captures audio
2. Release → POST /stt with context="schedule"
3. Client-side parse: `parseSpokenTime()` or `parseSpokenDuration()` (regex, no LLM)
4. Pre-fills field; user can also type manually

Steps: **Task Name → Start Time → Duration → Break After** → Review → POST /schedules

Auto-stops recording after 6 seconds if user holds too long.

---

## Session Decision Flow (ActiveSessionModal)

```
Poll GET /active-session/userId every 5 s
  → { active: true } → startCall(schedule_id)
    → systemSocket emits call:start
    → Signaling → userSocket receives call:incoming
    → callState = 'ringing'
    → useRingtone.startRinging()
    → IncomingCallScreen renders

User taps Accept:
  → acceptCall(sessionId) → call:join
  → callState = 'connecting' → 'connected'
  → showSessionPopup = true
  → Wait 2 s (TTS announcement) → MediaRecorder starts
  → Record 5 s of voice → POST /voice-decision
    → returns { intent, duration, needs_repeat, needs_duration }
  → intent = 'completed' | 'extend' | 'skip' | null
  → POST /transition-decision
  → hangUp() → cleanup

Auto-reject after 30 s if no user action.
```

---

## Intent Detection (`services/intent.py`)

STT correction pipeline:
1. Explicit correction map: `{ "extend": ["xtend", "exten", ...], ... }`
2. Fuzzy match via `difflib.SequenceMatcher` (threshold 0.75)
3. Duration extraction: regex for "X hours", "X minutes", combinations
4. Single-word confidence gate: if word not in `["extend", "completed", "skip"]` after correction → `low_confidence=True`

Recognized intents: `extend`, `completed`, `skip`, or `None`.

---

## Mood Detection (`routers/session_logs.py`)

Keyword-based, no LLM:
- **Negative** (checked first): tired, exhausted, stressed, anxious, overwhelmed, distracted, frustrated, stuck, bad, worried, difficult
- **Positive:** great, good, happy, excited, motivated, focused, energized, confident, productive, ready, clear
- **Rule:** if any negative keyword present → `"negative"` (even if positive keywords also present)

---

## Known Bugs / Issues

1. **`DELETE /schedules/{id}` does not cancel the APScheduler job.** The backend job keeps running and will trigger a session for a deleted schedule. Fix: call `remove_session_job(schedule_id)` in the delete route.

2. **Extension shift is not cascading.** `shift_next_schedule` shifts only the *immediately next* session. Spec requires all subsequent sessions to shift. Only one row is updated.

3. **Settings contact preference is localStorage-only.** Never persisted to `users.contact_default` in Supabase. Switching devices loses preference. Backend never reads it.

4. **`AlarmPlugin.java.dismissAlarm()` uses `startService()`.** On API 26+, this may throw `ForegroundServiceStartNotAllowedException` when called from a background context. Should use `startForegroundService()` or bind approach.

5. **No WebRTC fallback when callee is offline.** `call:callee_offline` received → `cleanup()` called → nothing else happens. Spec requires push notification fallback.

6. **Signaling server state lost on restart.** All `userSockets` and `sessions` Maps are in-memory. Any server restart drops all registered users — ongoing calls fail silently, new calls require reconnect.

7. **`_TEST_DELAY_SECS = 0` left in production code path.** Risk of accidental non-zero value in deploy.

8. **Backend startup only loads today's schedules.** Future-dated schedules created today are not APScheduler-registered (AlarmPlugin handles this on Android, but backend trigger won't fire for them on a server with no app open).

9. **Duplicate scheduler files.** `scheduler_service.py` is dead code (cron trigger). `scheduler.py` is active (date trigger). Can cause confusion.

10. **No error boundary in React.** An unhandled throw in `ActiveSessionModal` (always mounted) will crash the entire app with a blank screen.

---

## Completed Features

- [x] Manual schedule creation (CRUD)
- [x] Voice schedule creation (4-step, STT via Groq Whisper)
- [x] WebRTC call flow (dual-socket, STUN, audio stream)
- [x] Ringtone synthesis (Web Audio API)
- [x] Incoming call screen (accept / reject)
- [x] Session decision modal (completed / extend / skip)
- [x] Voice decision during session (STT + intent detection)
- [x] Extend with follow-up voice if duration not spoken
- [x] Auto-reject after 30 seconds
- [x] Session logging to Supabase (with mood signal)
- [x] Next-session start time shift on extension
- [x] APScheduler job registration (date trigger, one-shot)
- [x] Backend startup schedule loader
- [x] Redis session state (TTL-based, terminal status hiding)
- [x] Android native alarm (AlarmManager exact alarm)
- [x] Android foreground alarm service (ringtone + vibration + notification)
- [x] Boot rescheduling (AlarmReceiver + AlarmStorage)
- [x] Lock screen full-screen intent
- [x] Battery optimisation exemption + exact alarm permission dialogs
- [x] Copy-previous schedule endpoint
- [x] Health endpoint

---

## Pending / Unbuilt Features

- [ ] **Authentication** — no login, no sessions, hardcoded UUID
- [ ] **TURN server** — calls fail on symmetric NAT
- [ ] **Push notification fallback** — when WebRTC fails or user offline
- [ ] **FCM integration** — background push on Android
- [ ] **Groq daily summaries** — `groq_summary.py` not created, no scheduler job
- [ ] **Groq weekly summaries** — same
- [ ] **`daily_summaries` table** — not created
- [ ] **`weekly_summaries` table** — not created
- [ ] **DTMF voice scheduling** — spec describes keypad flow; not implemented anywhere
- [ ] **Edge TTS** — currently using `window.speechSynthesis` (browser TTS, low quality)
- [ ] **Contact preference backend sync** — Settings only writes to localStorage
- [ ] **HTTPS / TLS** — all traffic is HTTP; `androidScheme: "http"` must become `"https"`
- [ ] **POST_NOTIFICATIONS runtime request** — declared in manifest but not requested at runtime on Android 13+
- [ ] **React error boundary** — no crash protection
- [ ] **Delete APScheduler job on schedule delete** — backend job keeps firing
- [ ] **Cascading extension shift** — only shifts immediate next session
- [ ] **Unit tests** — no test files in frontend; `test_redis_service.py` exists in backend
- [ ] **Production icon / store assets** — using default placeholder
- [ ] **Auto copy-previous on morning cutoff** — described in spec, not implemented

---

## Environment Variables

### Backend (`.env`)
```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
REDIS_URL=
GROQ_API_KEY=
CLIENT_URL=                 # Frontend origin for CORS (e.g. https://vocaflow.app)
```

### Frontend (`.env` in frontend/)
```
VITE_API_URL=               # e.g. https://api.vocaflow.app
VITE_SOCKET_URL=            # e.g. https://signaling.vocaflow.app
```

### Signaling (`process.env`)
```
PORT=3001
CLIENT_URL=                 # Frontend origin for CORS
```

---

## Critical Rules (Never Break)

1. **NEVER call Groq LLM during a real-time session, call, or notification**
2. **ALWAYS save raw STT text to session_logs before any processing**
3. **extension_flag must always be logged — even if parsing fails**
4. **Every Supabase query must have try/except**
5. **Every WebRTC event must have an error handler**
6. **Contact preference resolution order: per-session → global default → 'call'**
7. **All API keys via environment variables — never hardcode**
8. **Pydantic `id` fields must be `Union[int, str]`** (Supabase serial PKs are integers)
9. **Do not call `dotenv` — only `python-dotenv` is valid in requirements.txt**
10. **Schedule shifts from extension must log first, shift second** (logging never blocked by shift failure)

---

## Capacitor Config

```json
{
  "appId": "com.vocassistant.app",
  "appName": "vocassistant",
  "webDir": "dist",
  "server": { "androidScheme": "http" }
}
```

⚠️ `androidScheme` must be changed to `"https"` before production.

---

## Timezone

All backend datetime handling uses **`Asia/Kolkata` (IST, UTC+5:30)**.
`utils.parse_datetime()` is the single source of truth for creating timezone-aware datetimes.
APScheduler is also configured with `timezone="Asia/Kolkata"`.
