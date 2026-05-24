from fastapi import APIRouter, File, HTTPException, UploadFile

from services.transition_service import process_voice_decision

router = APIRouter(tags=["voice"])


@router.post("/voice-decision")
async def post_voice_decision(audio: UploadFile = File(...)):
    try:
        audio_bytes = await audio.read()
        return process_voice_decision(audio_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
