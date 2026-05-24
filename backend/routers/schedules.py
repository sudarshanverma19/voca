import logging
from datetime import date, timedelta
from typing import Literal, Optional, Union
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from db import get_supabase
from services.scheduler import schedule_session
from utils import parse_datetime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/schedules", tags=["schedules"])


# ── Pydantic models ────────────────────────────────────────────────────────────

class ScheduleCreate(BaseModel):
    user_id: str
    task_name: str
    start_time: str = Field(..., pattern=r"^([01]\d|2[0-3]):([0-5]\d)$", description="HH:MM")
    duration_minutes: int = Field(..., gt=0)
    break_after_minutes: Optional[int] = Field(None, ge=0)
    contact_preference: Literal["call", "notification", "default"] = "default"
    date: date
    created_via: Literal["manual", "voice"] = "manual"


class ScheduleUpdate(BaseModel):
    task_name: Optional[str] = None
    start_time: Optional[str] = Field(None, pattern=r"^([01]\d|2[0-3]):([0-5]\d)$")
    duration_minutes: Optional[int] = Field(None, gt=0)
    break_after_minutes: Optional[int] = Field(None, ge=0)
    contact_preference: Optional[Literal["call", "notification", "default"]] = None
    date: Optional[date] = None


class CopyPreviousRequest(BaseModel):
    user_id: str
    target_date: date = Field(default_factory=date.today)


class ScheduleResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: Union[int, str]  # serial int in current schema; str if migrated to UUID later
    user_id: str
    task_name: str
    start_time: str
    duration_minutes: int
    break_after_minutes: Optional[int]
    contact_preference: str
    date: date
    created_via: str
    scheduled: bool = False  # True only if APScheduler job was successfully registered


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=ScheduleResponse, status_code=201)
async def create_schedule(body: ScheduleCreate):
    db = get_supabase()

    # Ensure the user row exists (upsert is a no-op if already present).
    # This prevents the FK constraint violation when auth is not yet wired up.
    try:
        db.table("users").upsert(
            {"id": body.user_id},
            on_conflict="id",
        ).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"User upsert error: {e}")

    try:
        result = (
            db.table("schedules")
            .insert({
                "user_id": body.user_id,
                "task_name": body.task_name,
                "start_time": body.start_time,
                "duration_minutes": body.duration_minutes,
                "break_after_minutes": body.break_after_minutes,
                "contact_preference": body.contact_preference,
                "date": body.date.isoformat(),
                "created_via": body.created_via,
            })
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not result.data:
        raise HTTPException(status_code=500, detail="Insert returned no data")

    created = result.data[0]
    job_registered = False

    # Auto-schedule if the session is today and hasn't started yet.
    # Future dates are picked up by the startup loader when the server runs on that day.
    if body.date == date.today():
        print(f"\n[create_schedule] attempting to schedule — date={body.date}  time={body.start_time}")
        try:
            run_time = parse_datetime(body.date.isoformat(), body.start_time)
            print(f"[create_schedule] run_time={run_time.isoformat()}  schedule_id={created['id']}")
            schedule_session(body.user_id, created["id"], run_time)
            print(f"[create_schedule] schedule_session() returned — job registered")
            job_registered = True
        except ValueError as e:
            logger.warning("[schedules] auto-schedule skipped (past time): %s", e)
            print(f"[create_schedule] SKIPPED — start_time is in the past: {e}")
        except (TypeError, RuntimeError) as e:
            logger.warning("[schedules] auto-schedule skipped: %s", e)
            print(f"[create_schedule] SKIPPED scheduling — reason: {e}")
    else:
        print(f"[create_schedule] date={body.date} is not today — skipping auto-schedule (startup loader handles it)")

    return {**created, "scheduled": job_registered}


@router.get("/{schedule_date}", response_model=list[ScheduleResponse])
async def get_schedules_for_date(
    schedule_date: date,
    user_id: str = Query(..., description="User ID to filter by"),
):
    db = get_supabase()
    try:
        result = (
            db.table("schedules")
            .select("*")
            .eq("user_id", user_id)
            .eq("date", schedule_date.isoformat())
            .order("start_time")
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return result.data


@router.put("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(schedule_id: str, body: ScheduleUpdate):
    db = get_supabase()
    changes = body.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "date" in changes:
        changes["date"] = changes["date"].isoformat()

    try:
        result = (
            db.table("schedules")
            .update(changes)
            .eq("id", schedule_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not result.data:
        raise HTTPException(status_code=404, detail="Schedule not found")

    return result.data[0]


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(schedule_id: str):
    db = get_supabase()
    try:
        result = (
            db.table("schedules")
            .delete()
            .eq("id", schedule_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not result.data:
        raise HTTPException(status_code=404, detail="Schedule not found")


@router.post("/copy-previous", response_model=list[ScheduleResponse], status_code=201)
async def copy_previous_schedule(body: CopyPreviousRequest):
    target = body.target_date
    yesterday = target - timedelta(days=1)

    db = get_supabase()

    # Check if target date already has entries
    try:
        existing = (
            db.table("schedules")
            .select("id")
            .eq("user_id", body.user_id)
            .eq("date", target.isoformat())
            .limit(1)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if existing.data:
        raise HTTPException(
            status_code=409,
            detail=f"Schedule already exists for {target}. Delete it first or use PUT to modify.",
        )

    # Fetch yesterday's schedule
    try:
        prev = (
            db.table("schedules")
            .select("*")
            .eq("user_id", body.user_id)
            .eq("date", yesterday.isoformat())
            .order("start_time")
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not prev.data:
        raise HTTPException(
            status_code=404,
            detail=f"No schedule found for {yesterday} to copy from.",
        )

    # Build new rows — strip id/created_at, set new date
    new_rows = [
        {
            "user_id": row["user_id"],
            "task_name": row["task_name"],
            "start_time": row["start_time"],
            "duration_minutes": row["duration_minutes"],
            "break_after_minutes": row.get("break_after_minutes"),
            "contact_preference": row["contact_preference"],
            "date": target.isoformat(),
            "created_via": row["created_via"],
        }
        for row in prev.data
    ]

    try:
        result = db.table("schedules").insert(new_rows).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not result.data:
        raise HTTPException(status_code=500, detail="Insert returned no data")

    return result.data
