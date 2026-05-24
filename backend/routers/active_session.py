from fastapi import APIRouter

from services.active_session_service import get_session

router = APIRouter(prefix="/active-session", tags=["active-session"])


@router.get("/{user_id}")
async def fetch_active_session(user_id: str):
    session = get_session(user_id)
    if session is None:
        return {"active": False}
    return {"active": True, "data": session}
