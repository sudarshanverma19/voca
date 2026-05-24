from typing import Union
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.trigger_service import trigger_session
from services.active_session_service import store_session

router = APIRouter(prefix="/trigger-session", tags=["trigger"])


class TriggerRequest(BaseModel):
    user_id: str
    schedule_id: int


class TriggerResponse(BaseModel):
    schedule_id: Union[int, str]
    task: str
    start_time: str
    message: str
    question: str
    options: list[str]


@router.post("", response_model=TriggerResponse)
async def post_trigger_session(body: TriggerRequest):
    try:
        payload = trigger_session(
            user_id=body.user_id,
            schedule_id=body.schedule_id,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    store_session(
        user_id=body.user_id,
        schedule_id=payload["schedule_id"],
        task=payload["task"],
    )

    return payload
