from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.params import Form

from services.stt import transcribe_audio

router = APIRouter(tags=["stt"])

_PROMPTS = {
    "schedule": (
        "The user is creating a work schedule. They will say task names like "
        "'deep work', 'meeting', 'exercise', 'study'. Or time values like "
        "'9 AM', '10:30', '2 o clock', 'half past three'. Or durations like "
        "'45 minutes', '1 hour', '1 hour 30 minutes', '90 minutes'. "
        "Or 'skip' or 'no break'. Transcribe accurately, preserving numbers."
    ),
    "general": "",
}


@router.post("/stt")
async def transcribe(
    audio: UploadFile = File(...),
    context: str = Form("general"),
):
    try:
        audio_bytes = await audio.read()
        prompt = _PROMPTS.get(context, "")
        text = transcribe_audio(audio_bytes, filename=audio.filename or "recording.webm", prompt=prompt)
        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
