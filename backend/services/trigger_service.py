"""
Session trigger service.

Self-contained: owns all DB operations for its domain.
No FastAPI imports — designed so this module can be extracted
into its own microservice later with minimal changes.
"""
import logging

from db import get_supabase
from services import redis_service

logger = logging.getLogger(__name__)


def trigger_session(user_id: str, schedule_id: int) -> dict:
    """
    Fetch a schedule and return the session trigger payload.

    Raises:
        LookupError  — schedule not found (→ 404)
        PermissionError — schedule belongs to a different user (→ 403)
        RuntimeError — unexpected DB failure (→ 500)
    """
    db = get_supabase()

    try:
        result = (
            db.table("schedules")
            .select("id, user_id, task_name, start_time")
            .eq("id", schedule_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        raise RuntimeError(f"Database error fetching schedule: {e}")

    if not result.data:
        raise LookupError(f"Schedule {schedule_id} not found")

    schedule = result.data[0]

    if schedule["user_id"] != user_id:
        raise PermissionError(
            f"Schedule {schedule_id} does not belong to user {user_id}"
        )

    task_name = schedule["task_name"]

    redis_service.set_session(str(schedule_id), {
        "user_id": user_id,
        "task_name": task_name,
        "start_time": schedule["start_time"],
        "status": "triggered",
    })

    return {
        "schedule_id": schedule["id"],
        "task": task_name,
        "start_time": schedule["start_time"],
        "message": f"Your next task is {task_name}",
        "question": "Have you completed your previous task?",
        "options": ["completed", "extend", "skip"],
    }
