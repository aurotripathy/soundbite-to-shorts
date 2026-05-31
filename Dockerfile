# Backend image for Cloud Run: the FastAPI service in api/.
# The Next.js frontend is NOT built here -- it deploys separately on Vercel.
#
# Build context is the repo root so the `api` package keeps its import path
# (api.main:app). Everything except api/ is excluded via .dockerignore.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install deps first so layer caching survives source-only changes.
COPY api/requirements.txt ./api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

COPY api ./api

# Cloud Run injects PORT (defaults to 8080). uvicorn must bind 0.0.0.0:$PORT.
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
