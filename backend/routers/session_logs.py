import logging
import re
from datetime import date, datetime, timedelta
from typing import Literal, Optional, Union
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from db import get_supabase
from services.transition_service import shift_next_schedule

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/session-logs", tags=["session-logs"])


# ── Mood detection ─────────────────────────────────────────────────────────────
# Keyword sets checked against individual words in raw_text (no LLM involved).
# Negative is evaluated first so "tired but good" resolves to "negative".

_NEGATIVE_KEYWORDS = {
    "tired", "exhausted", "stressed", "anxious", "overwhelmed",
    "distracted", "frustrated", "stuck", "bad", "worried", "difficult",
}
_POSITIVE_KEYWORDS = {
    "great", "good", "happy", "excited", "motivated", "focused",
    "energized", "confident", "productive", "ready", "clear",
}


def _detect_mood(text: str) -> Optional[str]:
    words = set(re.findall(r"\b\w+\b", text.lower()))
    if words & _NEGATIVE_KEYWORDS:
        return "negative"
    if words & _POSITIVE_KEYWORDS:
        return "positive"
    return None


# ── Pydantic models ────────────────────────────────────────────────────────────

class SessionLogCreate(BaseModel):
    user_id: str
    schedule_id: Optional[Union[int, str]] = None
    session_time: datetime
    raw_text: str
    input_mode: Literal["voice", "text"]
    extension_flag: bool = False
    extension_minutes: Optional[int] = Field(None, ge=1)


class SessionLogResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: Union[int, str]
    user_id: str
    schedule_id: Optional[Union[int, str]]
    session_time: datetime
    raw_text: str
    input_mode: str
    extension_flag: bool
    extension_minutes: Optional[int]
    mood_signal: Optional[str]


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=SessionLogResponse, status_code=201)
async def create_session_log(body: SessionLogCreate):
    db = get_supabase()

    # ── Step 1: Insert session log — always first, never blocked by extension logic ──
    try:
        result = (
            db.table("session_logs")
            .insert({
                "user_id": body.user_id,
                "schedule_id": body.schedule_id,
                "session_time": body.session_time.isoformat(),
                "raw_text": body.raw_text,
                "input_mode": body.input_mode,
                "extension_flag": body.extension_flag,
                "extension_minutes": body.extension_minutes,
                "mood_signal": _detect_mood(body.raw_text),
            })
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not result.data:
        raise HTTPException(status_code=500, detail="Insert returned no data")

    log = result.data[0]

    # ── Step 2: Shift ONLY the next schedule when extension conditions are met ──
    # Preconditions: flag set, minutes valid, schedule_id provided.
    should_shift = (
        body.extension_flag
        and body.schedule_id is not None
        and isinstance(body.extension_minutes, int)
        and body.extension_minutes > 0
    )

    if should_shift:
        shift_next_schedule(db, body.schedule_id, body.extension_minutes)

    return log


@router.get("/{user_id}", response_model=list[SessionLogResponse])
async def get_logs_for_user(user_id: str):
    db = get_supabase()
    try:
        result = (
            db.table("session_logs")
            .select("*")
            .eq("user_id", user_id)
            .order("session_time", desc=True)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return result.data


@router.get("/{user_id}/{log_date}", response_model=list[SessionLogResponse])
async def get_logs_for_date(user_id: str, log_date: date):
    db = get_supabase()
    # Use [start, next_day) range so the comparison works against timestamptz.
    start = log_date.isoformat()
    end = (log_date + timedelta(days=1)).isoformat()

    try:
        result = (
            db.table("session_logs")
            .select("*")
            .eq("user_id", user_id)
            .gte("session_time", start)
            .lt("session_time", end)
            .order("session_time")
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return result.data
