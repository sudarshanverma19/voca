"""
Active session service.

Redis-backed store for sessions triggered by the scheduler.
Frontend polls GET /active-session/{user_id} to pick these up.
Sessions self-expire via TTL — no manual purge needed on process restart.

Public API is unchanged from the in-memory version so callers (trigger router,
scheduler service, active-session router) require no edits.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from services import redis_service

logger = logging.getLogger(__name__)


def store_session(
    user_id: str,
    schedule_id: int,
    task: str,
    ttl: int = redis_service.DEFAULT_TTL,
) -> None:
    data = {
        "session_id": user_id,
        "schedule_id": schedule_id,
        "task": task,
        "message": f"Your next task is {task}",
        "question": "Have you completed your previous task?",
        "options": ["completed", "extend", "skip"],
        "status": "active",
        "start_time": datetime.now(timezone.utc).isoformat(),
        "extension_time": None,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }
    redis_service.set_session(user_id, data, ttl)
    logger.info("[session] stored user=%s schedule=%s", user_id, schedule_id)


def get_session(user_id: str) -> Optional[dict]:
    """
    Return the active session payload for the frontend, or None.
    Sessions with a terminal status are invisible to the frontend even
    before their TTL expires — they self-clean without an explicit delete.
    """
    data = redis_service.get_session(user_id)
    if data is None:
        return None
    if data.get("status") in ("completed", "skipped"):
        return None
    return data


def extend_session(user_id: str, extension_minutes: int) -> None:
    """Record that the session was extended. Session remains 'active'."""
    redis_service.update_session(user_id, {
        "status": "active",
        "extension_time": extension_minutes,
    })
    logger.info("[session] extended user=%s by %d min", user_id, extension_minutes)


def clear_session(user_id: str) -> None:
    """Hard-delete a session. Use when an immediate removal is required."""
    redis_service.delete_session(user_id)
