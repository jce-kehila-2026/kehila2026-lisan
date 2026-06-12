# syntax=docker/dockerfile:1.6
# ─── Lisan AI Service ─────────────────────────────────────────────────────────
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Azure Speech SDK + httpx need a few system libs
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libssl-dev \
        libasound2 \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as non-root for security
RUN useradd --create-home --shell /bin/bash lisan \
    && chown -R lisan:lisan /app
USER lisan

EXPOSE 8000

# Liveness probe — confirms the process is up and responsive. Intentionally
# uses /health (not /ready): a HEALTHCHECK that flapped on a transient Redis
# or LLM blip would needlessly restart the container. Orchestrators should
# point their *readiness* gate at /api/ai/ready separately.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/ai/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
