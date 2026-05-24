import os
import logging
from groq import Groq

logger = logging.getLogger(__name__)

_WHISPER_PROMPT = (
    "User will mostly say short commands like: extend, completed, skip, "
    "extend by 10 minutes, i have completed. "
    "Focus on correctly recognizing these words even if audio is short."
)


def transcribe_audio(audio_bytes: bytes, filename: str = "recording.webm", prompt: str = "") -> str:
    client = Groq(api_key=os.environ["GROQ_API_KEY"])
    transcription = client.audio.transcriptions.create(
        file=(filename, audio_bytes),
        model="whisper-large-v3",
        prompt=prompt or _WHISPER_PROMPT,
    )
    return transcription.text.strip().lower()
