from typing import Literal, Optional, Union
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.transition_service import handle_transition
from services.active_session_service import extend_session, clear_session
from services import redis_service

router = APIRouter(prefix="/transition-decision", tags=["transition"])

_TERMINAL_STATUS = {"completed": "completed", "skip": "skipped"}


class TransitionRequest(BaseModel):
    user_id: str
    schedule_id: int
    decision: Literal["completed", "extend", "skip"]
    extension_minutes: Optional[int] = Field(None, ge=1)


class TransitionResponse(BaseModel):
    session_log_id: Union[int, str]
    decision: str


@router.post("", response_model=TransitionResponse, status_code=201)
async def post_transition_decision(body: TransitionRequest):
    try:
        log = handle_transition(
            user_id=body.user_id,
            schedule_id=body.schedule_id,
            decision=body.decision,
            extension_minutes=body.extension_minutes,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Update Redis session state based on decision type
    if body.decision == "extend":
        # Session stays active — record extension so state reflects reality
        extend_session(body.user_id, body.extension_minutes or 0)
    else:
        # Mark terminal; get_session() will hide it from the frontend immediately.
        # The key self-expires via its original TTL — no hard delete needed.
        redis_service.update_session(
            body.user_id,
            {"status": _TERMINAL_STATUS[body.decision]},
        )

    return {"session_log_id": log["id"], "decision": body.decision}
