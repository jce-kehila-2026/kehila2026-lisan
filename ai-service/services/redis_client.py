import os
import logging

logger = logging.getLogger("lisan.chat")

_REDIS_CLIENT = None
_REDIS_INITIALIZED = False

def get_redis_client():
    import sys
    if "pytest" in sys.modules or os.getenv("PYTEST_CURRENT_TEST") is not None:
        return None

    global _REDIS_CLIENT, _REDIS_INITIALIZED
    if _REDIS_INITIALIZED:
        return _REDIS_CLIENT

    redis_url = os.getenv("REDIS_URL", "").strip()
    env_mode = os.getenv("ENV_MODE", "development").strip().lower()
    is_production = env_mode == "production"

    if not redis_url:
        _REDIS_INITIALIZED = True
        if is_production:
            msg = "FATAL: Redis is required in production (REDIS_URL not set). Conversation history will be lost on restart."
            logger.error(msg)
            raise RuntimeError(msg)
        logger.info("Redis is not configured. Using local in-memory storage (dev mode only).")
        return None

    try:
        import redis
        pool = redis.ConnectionPool.from_url(
            redis_url,
            socket_timeout=2.0,
            decode_responses=True,
            max_connections=20,
        )
        client = redis.Redis(connection_pool=pool)
        client.ping()
        _REDIS_CLIENT = client
        logger.info(f"Successfully connected to Redis at {redis_url} with connection pooling")
    except ImportError:
        msg = "redis package not installed. Install with: pip install redis"
        logger.error(msg)
        if is_production:
            raise RuntimeError(msg)
    except Exception as exc:
        msg = f"Failed to connect to Redis at {redis_url}: {exc}"
        logger.error(msg)
        if is_production:
            raise RuntimeError(msg)

    _REDIS_INITIALIZED = True
    return _REDIS_CLIENT
