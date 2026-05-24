import logging
import os
from pathlib import Path
from dotenv import load_dotenv

# Must be first — before any import that touches db.py or creates the Supabase client.
load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=True)

logging.basicConfig(level=logging.INFO)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import schedules, session_logs, transition, trigger, active_session, voice_decision, stt
from services import scheduler

app = FastAPI(title="VocaFlow API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(schedules.router)
app.include_router(session_logs.router)
app.include_router(transition.router)
app.include_router(trigger.router)
app.include_router(active_session.router)
app.include_router(voice_decision.router)
app.include_router(stt.router)


@app.on_event("startup")
async def on_startup():
    key = os.environ.get("SUPABASE_SERVICE_KEY", "NOT SET")
    print(f"[startup] SUPABASE_SERVICE_KEY = {key[:10]}... (len={len(key)})")
    scheduler.start_scheduler()


@app.on_event("shutdown")
async def on_shutdown():
    scheduler.stop_scheduler()


@app.get("/health")
def health_check():
    return {"status": "ok"}
