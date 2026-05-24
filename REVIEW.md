# VocaFlow — REVIEW.md
# Claude reads this during /review and before every commit

## 🔴 Critical — Must Fix Before Any Commit

### Security
- No API keys, tokens, or secrets hardcoded anywhere in code
- All sensitive values via os.getenv() (Python) or import.meta.env (React)
- No .env file changes staged for commit
- No user data logged to console in any environment

### Architecture — The Non-Negotiables
- Groq LLM is NEVER called during an active WebRTC session
- Groq LLM is NEVER called during notification handling
- Groq is ONLY called in groq_summary.py daily/weekly jobs
- STT (Whisper) result is ALWAYS saved as raw_text first before any processing
- extension_flag is ALWAYS set when an extension is detected — even if parsing fails

### Data Integrity
- Every Supabase query has a try/except block
- Failed DB writes must log the error and return a clear error response
- session_logs raw_text is NEVER modified after initial save
- Schedule shifts from task extension must be atomic — update all affected sessions or none

---

## 🟡 Warning — Should Fix Before Commit

### WebRTC
- Every WebRTC peer connection event has an error handler
  (oniceconnectionstatechange, onconnectionstatechange, onerror)
- WebRTC sessions that fail must fall back gracefully
  (if call fails → send push notification instead)
- DTMF detection failures must not crash the schedule creation flow
  (fallback: ask user to repeat voice input without keypress)

### API Routes
- All FastAPI routes are async
- All routes have Pydantic request/response models
- No route returns raw Supabase objects — always map to response model
- Contact preference resolution order is always:
  per-session setting → user global default → 'call'

### Frontend
- No console.log statements left in code
- Loading states handled for all async operations
  (schedule creation, call connection, STT processing)
- Error states handled and shown to user — never silent failures
- All WebRTC UI handles: connecting, connected, failed, disconnected states

### Voice Schedule Flow
- Each DTMF step has a timeout — if user doesn't respond in 30s, re-prompt
- Parser failures for voice input must save raw_text regardless
- Schedule read-back before confirmation must include ALL tasks
- Confirmation step (press 1 to confirm) must always be present

---

## 🟢 Good Practices — Note When Present

- Raw text saved before any processing attempted
- Graceful fallback from call to notification on WebRTC failure
- Extension minutes correctly shift all subsequent sessions in schedule
- Environment variables used consistently
- Async/await used throughout (no .then() chains)
- Error responses use consistent format: {error: string, code: int}
- Tests written for new routes

Rules : 
1. Pydantic response models — all id fields must be 
   Union[int, str] not just str since Supabase serial 
   PKs are integers

2. Foreign key inserts — always ensure parent row exists 
   before inserting child row during dev/testing

3. requirements.txt — never have both dotenv and 
   python-dotenv listed, only python-dotenv is valid

---

## File-Specific Rules

### /backend/services/groq_summary.py
- Must only be called by scheduled jobs (never by route handlers)
- Must batch all user logs before making single Groq API call
- Must handle Groq API rate limit errors gracefully

### /backend/services/dtmf.py
- Must handle cases where keypress is not detected
- Must have a maximum retry count per step (3 retries before skip)

### /backend/services/parser.py
- Must always return raw_text even if structured parsing fails
- Time parsing must handle formats: "10 AM", "10:00", "ten o clock"
- Duration parsing must handle: "90 minutes", "1 hour", "one and a half hours"

### /frontend/src/hooks/useWebRTC.ts
- Must clean up peer connections on component unmount
- Must handle browser permission denial for microphone gracefully

### /frontend/src/components/VoiceSchedule/
- Must show current step clearly to user at all times
- Must allow user to go back to previous step
- Must show a text fallback if WebRTC fails to connect