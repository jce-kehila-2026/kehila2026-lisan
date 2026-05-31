import os
import logging

logger = logging.getLogger("lisan.chat")

_REDIS_CLIENT = None
_REDIS_INITIALIZED = False

def get_redis_client():
    global _REDIS_CLIENT, _REDIS_INITIALIZED
    if _REDIS_INITIALIZED:
        return _REDIS_CLIENT

    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        _REDIS_INITIALIZED = True
        logger.info("Redis is not configured. Falling back to local in-memory storage.")
        return None

    try:
        import redis
        client = redis.Redis.from_url(redis_url, socket_timeout=2.0, decode_responses=True)
        # Test connection
        client.ping()
        _REDIS_CLIENT = client
        logger.info(f"Successfully connected to Redis at {redis_url}")
    except ImportError:
        logger.warning("redis package is not installed. Falling back to local in-memory storage.")
    except Exception as exc:
        logger.warning(f"Failed to connect to Redis at {redis_url}: {exc}. Falling back to local in-memory storage.")
    
    _REDIS_INITIALIZED = True
    return _REDIS_CLIENT
