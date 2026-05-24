"""
Redis connection module.

A single client instance is reused for the lifetime of the process.
REDIS_URL must be set in the environment — no localhost fallback.
"""
import logging
import os

import redis

logger = logging.getLogger(__name__)

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        url = os.getenv("REDIS_URL")
        if not url:
            raise Exception("REDIS_URL not set")
        _client = redis.from_url(url, decode_responses=True)
        # Startup smoke test — remove once Upstash connection is confirmed stable
        _client.set("test_key", "hello")
        print(_client.get("test_key"))
        print("Connected to Redis")
        logger.info("[redis] client initialised: %s", url)
    return _client
