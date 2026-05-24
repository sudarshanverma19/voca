"""
Redis connection module.

A single client instance is reused for the lifetime of the process.
Set REDIS_URL in .env — defaults to local Redis for development.
"""
import logging
import os

import redis

logger = logging.getLogger(__name__)

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        url = os.environ.get("REDIS_URL", "redis://localhost:6379")
        _client = redis.Redis.from_url(url, decode_responses=True)
        logger.info("[redis] client initialised: %s", url)
    return _client
