"""
Scheduler service.

Loads today's schedules from Supabase on startup and registers one
APScheduler cron job per session. Each job calls trigger_service
directly — no internal HTTP calls.
"""
import logging
from datetime import date

from apscheduler.schedulers.background import BackgroundScheduler

from db import get_supabase
import services.trigger_service as trigger_service
import services.active_session_service as active_session_service

logger = logging.getLogger(__name__)

TIMEZONE = "Asia/Kolkata"

_scheduler = BackgroundScheduler(timezone=TIMEZONE)


# ── Job wrapper ────────────────────────────────────────────────────────────────

def _run_trigger(user_id: str, schedule_id: int) -> None:
    """
    APScheduler calls this at the scheduled time.
    Wraps trigger_service so a failed session never kills the scheduler thread.
    """
    logger.info("Triggering session: %s %s", user_id, schedule_id)
    try:
        result = trigger_service.trigger_session(user_id, schedule_id)
        active_session_service.store_session(
            user_id=user_id,
            schedule_id=result["schedule_id"],
            task=result["task"],
        )
        logger.info(
            "Session triggered — schedule_id=%s task=%s",
            schedule_id,
            result.get("task"),
        )
    except Exception as e:
        logger.error(
            "trigger_session failed — user=%s schedule=%s error=%s",
            user_id,
            schedule_id,
            e,
        )


# ── Job loader ─────────────────────────────────────────────────────────────────

def _load_todays_schedules() -> None:
    """
    Fetch every schedule for today and register a cron job for each one.
    Invalid or already-registered rows are skipped safely.
    """
    today = date.today().isoformat()
    db = get_supabase()

    try:
        result = (
            db.table("schedules")
            .select("id, user_id, start_time")
            .eq("date", today)
            .execute()
        )
    except Exception as e:
        logger.error("Failed to fetch schedules: %s", e)
        return

    rows = result.data or []
    if not rows:
        logger.info("No schedules found for %s — no jobs registered", today)
        return

    for row in rows:
        schedule_id = row.get("id")
        user_id = row.get("user_id")
        start_time = row.get("start_time")  # stored as "HH:MM"

        if not (schedule_id and user_id and start_time):
            logger.warning("Skipping incomplete schedule row: %s", row)
            continue

        try:
            hour, minute = int(start_time[:2]), int(start_time[3:5])
        except (ValueError, TypeError):
            logger.warning(
                "Invalid start_time '%s' for schedule %s — skipping",
                start_time,
                schedule_id,
            )
            continue

        job_id = f"{user_id}_{schedule_id}"
        logger.info("Scheduling job: %s %s %s", user_id, schedule_id, start_time)

        _scheduler.add_job(
            func=_run_trigger,
            trigger="cron",
            hour=hour,
            minute=minute,
            args=[user_id, schedule_id],
            id=job_id,
            # Prevents duplicate registration on uvicorn hot-reload
            replace_existing=True,
        )

    logger.info("Registered %d job(s) for %s", len(rows), today)


# ── Public API ─────────────────────────────────────────────────────────────────

def start_scheduler() -> None:
    """Load today's jobs and start the background scheduler. Call once on startup."""
    _load_todays_schedules()
    _scheduler.start()
    logger.info("APScheduler started (timezone=%s)", TIMEZONE)


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler. Call on app shutdown."""
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")
