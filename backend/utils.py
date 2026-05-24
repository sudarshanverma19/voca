"""
Shared utilities.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

TIMEZONE = "Asia/Kolkata"
_tz = ZoneInfo(TIMEZONE)


def parse_datetime(date_str: str, time_str: str) -> datetime:
    """
    Combine a date string and a time string into a timezone-aware datetime.

    Args:
        date_str: "YYYY-MM-DD"
        time_str: "HH:MM"

    Returns:
        datetime with Asia/Kolkata timezone.

    Raises:
        ValueError: if the combined datetime is in the past.
    """
    naive = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
    aware = naive.replace(tzinfo=_tz)
    now = datetime.now(_tz)
    print(f"[parse_datetime] input='{date_str} {time_str}'")
    print(f"[parse_datetime] parsed={aware.isoformat()}")
    print(f"[parse_datetime] now   ={now.isoformat()}")
    print(f"[parse_datetime] in_future={'YES' if aware > now else 'NO — will raise'}")
    if aware <= now:
        raise ValueError(f"Scheduled time {aware.isoformat()} is in the past")
    return aware
