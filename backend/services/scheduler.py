"""
Scheduler module.

Uses APScheduler BackgroundScheduler with a 'date' trigger so each session
fires exactly once at its scheduled time.

DEBUG FLAGS
-----------
_TEST_DELAY_SECS  Set to a positive integer (e.g. 30) to override every
                  run_time with now + N seconds. Useful for verifying the
                  full pipeline without waiting for a real schedule time.
                  Reset to 0 in production.
"""
import logging
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from apscheduler.jobstores.base import JobLookupError
from apscheduler.schedulers.background import BackgroundScheduler

import services.active_session_service as active_session_service
import services.trigger_service as trigger_service
from db import get_supabase

logger = logging.getLogger(__name__)

TIMEZONE = "Asia/Kolkata"
_tz = ZoneInfo(TIMEZONE)
_scheduler = BackgroundScheduler(timezone=TIMEZONE)

# ── Test-mode override ─────────────────────────────────────────────────────────
# Set to 30 (seconds) to confirm the pipeline works end-to-end without waiting.
# Reset to 0 before deploying.
_TEST_DELAY_SECS: int = 0 # reset to 0 before deploying


# ── Job function (called by APScheduler in a background thread) ────────────────

def _run_trigger(user_id: str, schedule_id: int) -> None:
    print(f"\n{'='*60}")
    print(f"[TRIGGER CALLED] user={user_id}  schedule={schedule_id}")
    print(f"[TRIGGER] time now = {datetime.now(_tz).isoformat()}")
    print(f"{'='*60}")

    try:
        print(f"[TRIGGER] calling trigger_service.trigger_session...")
        payload = trigger_service.trigger_session(user_id, schedule_id)
        print(f"[TRIGGER] payload received: task={payload.get('task')!r}")

        print(f"[TRIGGER] calling active_session_service.store_session...")
        active_session_service.store_session(
            user_id=user_id,
            schedule_id=payload["schedule_id"],
            task=payload["task"],
        )
        print(f"[TRIGGER] store_session() completed — Redis key should now exist")
        logger.info(
            "[scheduler] session live — schedule=%s task=%r",
            schedule_id, payload.get("task"),
        )
    except Exception as e:
        # Re-raise after logging so APScheduler records the traceback too
        logger.error(
            "[scheduler] trigger FAILED — user=%s schedule=%s error=%s",
            user_id, schedule_id, e, exc_info=True,
        )
        print(f"[TRIGGER ERROR] {e}")
        raise


# ── Public API ─────────────────────────────────────────────────────────────────

def schedule_session(user_id: str, schedule_id: int, run_time: datetime) -> None:
    """
    Register a one-shot job that fires _run_trigger at run_time.

    Raises:
        RuntimeError  — scheduler is not running (startup failed)
        TypeError     — run_time has no timezone info
        ValueError    — run_time is in the past
    """
    now = datetime.now(_tz)

    # ── Test-mode override ────────────────────────────────────────────────────
    if _TEST_DELAY_SECS > 0:
        run_time = now + timedelta(seconds=_TEST_DELAY_SECS)
        print(f"[TEST MODE] run_time overridden → now + {_TEST_DELAY_SECS}s = {run_time.isoformat()}")

    # ── Validation ────────────────────────────────────────────────────────────
    print(f"\n[schedule_session] schedule={schedule_id}  user={user_id}")
    print(f"  run_time : {run_time.isoformat()}")
    print(f"  now      : {now.isoformat()}")
    print(f"  tzinfo   : {run_time.tzinfo}")
    print(f"  scheduler running: {_scheduler.running}")

    if run_time.tzinfo is None:
        raise TypeError(
            f"run_time must be timezone-aware (got naive datetime: {run_time}). "
            "Use parse_datetime() from utils.py."
        )

    if run_time <= now:
        raise ValueError(
            f"run_time {run_time.isoformat()} is in the past "
            f"(now is {now.isoformat()})"
        )

    if not _scheduler.running:
        raise RuntimeError(
            "APScheduler is not running — ensure start_scheduler() was called "
            "during app startup and did not raise."
        )

    # ── Register job ──────────────────────────────────────────────────────────
    _scheduler.add_job(
        func=_run_trigger,
        trigger="date",
        run_date=run_time,
        args=[user_id, schedule_id],
        id=f"session_{schedule_id}",
        replace_existing=True,
        misfire_grace_time=60,   # fire up to 60 s late (default is 1 s)
    )

    # ── Confirm job was registered ────────────────────────────────────────────
    jobs = _scheduler.get_jobs()
    print(f"  [scheduler] job added — pending jobs ({len(jobs)}):")
    for j in jobs:
        print(f"    • {j.id}  next_run={j.next_run_time}")
    logger.info(
        "[scheduler] scheduled — schedule=%s run_at=%s",
        schedule_id, run_time.isoformat(),
    )


def remove_session_job(schedule_id: int) -> None:
    """Cancel a pending session job. No-ops if the job has already fired."""
    try:
        _scheduler.remove_job(f"session_{schedule_id}")
        logger.info("[scheduler] removed job for schedule=%s", schedule_id)
        print(f"[scheduler] removed job session_{schedule_id}")
    except JobLookupError:
        logger.debug("[scheduler] no pending job for schedule=%s", schedule_id)


def start_scheduler() -> None:
    """Start the background thread then load today's upcoming sessions."""
    print(f"\n[scheduler] starting — timezone={TIMEZONE}")
    _scheduler.start()
    _load_todays_sessions()
    print(f"[scheduler] started — running={_scheduler.running}")
    logger.info("[scheduler] started (timezone=%s)", TIMEZONE)


def stop_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[scheduler] stopped")


# ── Startup loader ─────────────────────────────────────────────────────────────

def _load_todays_sessions() -> None:
    today = date.today()
    now = datetime.now(_tz)
    db = get_supabase()
    print(f"[scheduler] loading schedules for {today}")

    try:
        result = (
            db.table("schedules")
            .select("id, user_id, start_time")
            .eq("date", today.isoformat())
            .execute()
        )
    except Exception as e:
        logger.error("[scheduler] failed to load today's schedules: %s", e)
        return

    rows = result.data or []
    print(f"[scheduler] found {len(rows)} schedule row(s) for today")
    registered = 0

    for row in rows:
        schedule_id = row.get("id")
        user_id = row.get("user_id")
        start_time_str = row.get("start_time")

        if not (schedule_id and user_id and start_time_str):
            logger.warning("[scheduler] skipping incomplete row: %s", row)
            continue

        try:
            hour, minute = int(start_time_str[:2]), int(start_time_str[3:5])
            run_time = datetime.combine(today, time(hour, minute), tzinfo=_tz)
        except (ValueError, TypeError):
            logger.warning(
                "[scheduler] invalid start_time %r for schedule=%s — skipping",
                start_time_str, schedule_id,
            )
            continue

        if run_time <= now:
            print(f"  [scheduler] skipping past schedule={schedule_id} ({start_time_str})")
            continue

        try:
            schedule_session(user_id, schedule_id, run_time)
            registered += 1
        except Exception as e:
            logger.error("[scheduler] could not register schedule=%s: %s", schedule_id, e)

    print(f"[scheduler] registered {registered} future job(s)")
    logger.info("[scheduler] registered %d future job(s) for %s", registered, today)
