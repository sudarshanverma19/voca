"""
Transition decision service.

Self-contained: owns all DB operations for its domain.
No FastAPI imports — designed so this module can be extracted
into its own microservice later with minimal changes.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from db import get_supabase

logger = logging.getLogger(__name__)


def handle_transition(
    user_id: str,
    schedule_id: int,
    decision: str,
    extension_minutes: Optional[int],
) -> dict:
    """
    Process a post-session transition decision.

    Logging always succeeds first. Schedule shift (for 'extend') is
    best-effort: a failure there is logged but never propagates.

    Returns the inserted session_log row.
    Raises RuntimeError if logging itself fails.
    """
    db = get_supabase()

    is_extension = (
        decision == "extend"
        and isinstance(extension_minutes, int)
        and extension_minutes > 0
    )

    # ── Step 1: Log the decision — always first ──────────────────────────────
    try:
        result = (
            db.table("session_logs")
            .insert({
                "user_id": user_id,
                "schedule_id": schedule_id,
                "session_time": datetime.now(timezone.utc).isoformat(),
                "raw_text": decision,
                "input_mode": "text",
                "extension_flag": is_extension,
                "extension_minutes": extension_minutes if is_extension else None,
                "mood_signal": None,
            })
            .execute()
        )
    except Exception as e:
        raise RuntimeError(f"session_log insert failed: {e}")

    if not result.data:
        raise RuntimeError("session_log insert returned no data")

    log = result.data[0]

    # ── Step 2: Shift next schedule (only for 'extend') ──────────────────────
    if is_extension:
        shift_next_schedule(db, schedule_id, extension_minutes)

    return log


def shift_next_schedule(db, schedule_id: int, extension_minutes: int) -> None:
    """
    Shift the immediately-next schedule's start_time by extension_minutes.

    Rules:
    - Targets ONLY one row (the next schedule for same user + date).
    - Failures are logged and swallowed — callers must not be affected.
    - No cascade: does not touch any schedule beyond the immediate next.
    """
    try:
        cur_res = (
            db.table("schedules")
            .select("id, user_id, date, start_time")
            .eq("id", schedule_id)
            .limit(1)
            .execute()
        )
        if not cur_res.data:
            logger.warning("shift_next_schedule: schedule_id %s not found", schedule_id)
            return

        cur = cur_res.data[0]

        next_res = (
            db.table("schedules")
            .select("id, start_time")
            .eq("user_id", cur["user_id"])
            .eq("date", cur["date"])
            .gt("start_time", cur["start_time"])
            .order("start_time", desc=False)
            .limit(1)
            .execute()
        )

        if not next_res.data:
            return  # No next schedule — nothing to shift

        nxt = next_res.data[0]
        parts = nxt["start_time"].split(":")
        h, m = int(parts[0]), int(parts[1])
        total = (h * 60 + m + extension_minutes) % (24 * 60)
        new_start = f"{total // 60:02d}:{total % 60:02d}"

        db.table("schedules").update(
            {"start_time": new_start}
        ).eq("id", nxt["id"]).execute()

    except Exception as e:
        logger.error("shift_next_schedule failed: %s", e)


def process_voice_decision(audio_bytes: bytes) -> dict:
    """
    STT + intent extraction only. No DB writes — the caller owns the transition.

    Returns one of two shapes:
      needs_repeat=True  → audio was too unclear to act on
      needs_repeat=False → {"text", "intent", "duration", "needs_duration"}
    """
    from services.stt import transcribe_audio
    from services.intent import extract_intent

    text = transcribe_audio(audio_bytes)
    parsed = extract_intent(text)
    intent = parsed["intent"]
    duration = parsed["duration"]
    low_confidence = parsed["low_confidence"]

    logger.info(
        "[voice] transcript: %r  →  intent: %s, duration: %s, low_confidence: %s",
        text, intent, duration, low_confidence,
    )

    if low_confidence:
        return {
            "text": text,
            "intent": None,
            "duration": None,
            "needs_duration": False,
            "needs_repeat": True,
            "message": "I didn't catch that clearly, please repeat",
        }

    return {
        "text": text,
        "intent": intent,
        "duration": duration,
        "needs_duration": (intent == "extend" and duration is None),
        "needs_repeat": False,
        "message": None,
    }
