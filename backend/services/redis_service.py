"""
Redis service layer — low-level session primitives.

Errors are logged AND printed so they are visible in the console even when
log level is set above ERROR. Once the pipeline is confirmed working, the
print() calls can be removed.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from redis_client import get_redis

logger = logging.getLogger(__name__)

DEFAULT_TTL = 5_400  # 90 minutes


def set_session(session_id: str, data: dict, ttl: int = DEFAULT_TTL) -> None:
    key = f"session:{session_id}"
    print("Setting session:", session_id)
    try:
        get_redis().setex(key, ttl, json.dumps(data))
        print(f"[redis] set_session  OK — key written successfully")
    except Exception as e:
        print(f"[redis] set_session  FAILED — {e}")
        logger.error("[redis] set_session failed (id=%s): %s", session_id, e, exc_info=True)


def get_session(session_id: str) -> Optional[dict]:
    key = f"session:{session_id}"
    try:
        raw = get_redis().get(key)
        if raw is None:
            print(f"[redis] get_session  key={key!r}  → NOT FOUND (expired or never set)")
            return None
        print(f"[redis] get_session  key={key!r}  → found ({len(raw)} bytes)")
        return json.loads(raw)
    except Exception as e:
        print(f"[redis] get_session  FAILED — {e}")
        logger.error("[redis] get_session failed (id=%s): %s", session_id, e, exc_info=True)
        return None


def update_session(session_id: str, updates: dict) -> None:
    key = f"session:{session_id}"
    print(f"[redis] update_session  key={key!r}  updates={updates}")
    try:
        r = get_redis()
        raw = r.get(key)
        if raw is None:
            print(f"[redis] update_session  key not found — nothing to update")
            logger.warning("[redis] update_session: key %s not found (expired?)", key)
            return
        remaining_ttl = r.ttl(key)
        data = json.loads(raw)
        data.update(updates)
        data["last_updated"] = datetime.now(timezone.utc).isoformat()
        effective_ttl = remaining_ttl if remaining_ttl > 0 else DEFAULT_TTL
        r.setex(key, effective_ttl, json.dumps(data))
        print(f"[redis] update_session  OK — remaining_ttl={effective_ttl}s")
    except Exception as e:
        print(f"[redis] update_session  FAILED — {e}")
        logger.error("[redis] update_session failed (id=%s): %s", session_id, e, exc_info=True)


def delete_session(session_id: str) -> None:
    key = f"session:{session_id}"
    print(f"[redis] delete_session  key={key!r}")
    try:
        get_redis().delete(key)
        print(f"[redis] delete_session  OK")
    except Exception as e:
        print(f"[redis] delete_session  FAILED — {e}")
        logger.error("[redis] delete_session failed (id=%s): %s", session_id, e, exc_info=True)
