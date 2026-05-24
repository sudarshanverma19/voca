"""
Manual test script for redis_service.py

Run from the backend/ directory:
    python test_redis_service.py
"""
import sys
import time
from pathlib import Path
from dotenv import load_dotenv

# Load .env before any import that reads os.environ
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

from redis_client import get_redis
from services.redis_service import delete_session, get_session, set_session, update_session

# ── Helpers ────────────────────────────────────────────────────────────────────

def _ok(msg: str) -> None:
    print(f"  \033[32m✓\033[0m {msg}")

def _fail(msg: str) -> None:
    print(f"  \033[31m✗\033[0m {msg}")

def _step(n: int, title: str) -> None:
    print(f"\n[{n}] {title}")
    print("  " + "-" * 44)

# ── Test data ──────────────────────────────────────────────────────────────────

SESSION_ID = "test_user_999"

SAMPLE_DATA = {
    "session_id": SESSION_ID,
    "schedule_id": 42,
    "task": "Deep Learning Study",
    "status": "active",
    "start_time": "2026-05-23T10:00:00+00:00",
    "extension_time": None,
    "last_updated": "2026-05-23T10:00:00+00:00",
}

# ── Tests ──────────────────────────────────────────────────────────────────────

def test_create():
    _step(1, "Create session with TTL=60s")
    try:
        set_session(SESSION_ID, SAMPLE_DATA.copy(), ttl=60)
        _ok("set_session() completed without error")
    except Exception as e:
        _fail(f"set_session() raised: {e}")
        sys.exit(1)


def test_fetch():
    _step(2, "Fetch and print session")
    data = get_session(SESSION_ID)
    if data is None:
        _fail("get_session() returned None — key missing or Redis down")
        sys.exit(1)
    _ok("get_session() returned data:")
    for key, val in data.items():
        print(f"      {key}: {val}")


def test_ttl():
    _step(3, "Check remaining TTL via Redis client")
    ttl = get_redis().ttl(f"session:{SESSION_ID}")
    if ttl > 0:
        _ok(f"TTL = {ttl}s  (expected ≈ 60s)")
    elif ttl == -1:
        _fail("Key exists but has no expiry set (SETEX not used?)")
    else:
        _fail(f"Unexpected TTL value: {ttl}")


def test_update():
    _step(4, "Update session — simulate a 15-minute extension")
    original = get_session(SESSION_ID)
    original_ts = original["last_updated"] if original else None

    update_session(SESSION_ID, {"status": "active", "extension_time": 15})

    updated = get_session(SESSION_ID)
    if updated is None:
        _fail("get_session() returned None after update")
        return

    if updated.get("extension_time") == 15:
        _ok("extension_time updated to 15")
    else:
        _fail(f"extension_time not updated — got: {updated.get('extension_time')!r}")

    if updated.get("last_updated") != original_ts:
        _ok(f"last_updated refreshed → {updated['last_updated']}")
    else:
        _fail("last_updated was NOT refreshed")

    # Confirm other fields survived the merge
    if updated.get("task") == SAMPLE_DATA["task"]:
        _ok("Other fields preserved after update")
    else:
        _fail(f"Field 'task' was lost — got: {updated.get('task')!r}")


def test_delete():
    _step(5, "Delete session and confirm removal")
    delete_session(SESSION_ID)
    gone = get_session(SESSION_ID)
    if gone is None:
        _ok("Session deleted — get_session() correctly returns None")
    else:
        _fail(f"Session still present after delete: {gone}")


def test_expiry():
    _step(6, "Expiry test — TTL=5s, wait 6s")
    set_session(SESSION_ID, SAMPLE_DATA.copy(), ttl=5)
    _ok("Session created with TTL=5s")

    for remaining in range(5, 0, -1):
        print(f"    Waiting… {remaining}s", end="\r", flush=True)
        time.sleep(1)
    time.sleep(1)  # +1s buffer
    print(" " * 20, end="\r")  # clear the countdown line

    expired = get_session(SESSION_ID)
    if expired is None:
        _ok("Session expired as expected — get_session() returns None")
    else:
        _fail(f"Session still present after TTL elapsed: {expired}")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("\n" + "=" * 48)
    print("  Redis Session Service — Manual Test Script")
    print("=" * 48)

    # Guarantee a clean state before starting
    delete_session(SESSION_ID)

    test_create()
    test_fetch()
    test_ttl()
    test_update()
    test_delete()
    test_expiry()

    print("\n" + "=" * 48)
    print("  Done.")
    print("=" * 48 + "\n")


if __name__ == "__main__":
    main()
