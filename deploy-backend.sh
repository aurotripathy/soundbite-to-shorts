#!/usr/bin/env bash
#
# Deploy the FastAPI backend (api/) to Google Cloud Run using Cloud Build.
# No local Docker required -- the image is built in the cloud from the
# root Dockerfile.
#
# Prereqs (one-time):
#   1. Install gcloud:  https://cloud.google.com/sdk/docs/install
#   2. gcloud auth login
#   3. gcloud config set project YOUR_PROJECT_ID
#   4. gcloud services enable run.googleapis.com cloudbuild.googleapis.com
#
# Usage:
#   PROJECT_ID=my-proj REGION=us-central1 GOOGLE_API_KEY=... ./deploy-backend.sh
#
# After it prints the service URL, set API_PROXY_TARGET to that URL in your
# Vercel project env so the Next.js /api/* rewrites hit Cloud Run.

set -euo pipefail

SERVICE="${SERVICE:-soundbite-api}"
REGION="${REGION:-us-central1}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "ERROR: set PROJECT_ID env var or run 'gcloud config set project ...'." >&2
  exit 1
fi

# App config passed to the container as env vars. Override any of these
# inline, e.g. VIDEO_MODEL_ID=veo-3.1-fast-generate-preview ./deploy-backend.sh
GOOGLE_GENAI_USE_VERTEXAI="${GOOGLE_GENAI_USE_VERTEXAI:-0}"
VIDEO_MODEL_ID="${VIDEO_MODEL_ID:-veo-3.1-lite-generate-preview}"
PERSON_GENERATION="${PERSON_GENERATION:-allow_all}"

ENV_VARS="GOOGLE_GENAI_USE_VERTEXAI=${GOOGLE_GENAI_USE_VERTEXAI}"
ENV_VARS+=",VIDEO_MODEL_ID=${VIDEO_MODEL_ID}"
ENV_VARS+=",PERSON_GENERATION=${PERSON_GENERATION}"

# Optional server-side default key. If omitted, the app runs in BYO-key mode
# (users paste their own Gemini key in the UI; sent via X-Goog-Api-Key).
# For real deployments prefer Secret Manager over a plaintext env var.
if [[ -n "${GOOGLE_API_KEY:-}" ]]; then
  ENV_VARS+=",GOOGLE_API_KEY=${GOOGLE_API_KEY}"
fi

echo "Deploying ${SERVICE} to project=${PROJECT_ID} region=${REGION} ..."

# Flag rationale:
#   --no-cpu-throttling  keep CPU allocated so the background Veo polling
#                        thread keeps running between HTTP requests.
#   --min/--max-instances=1  single warm instance so the in-memory job table
#                        (_jobs) stays consistent across status/file polls.
#                        Raise these only after externalizing job state.
#   --timeout=300        submit/status/file calls are quick; videos are a few MB.
gcloud run deploy "${SERVICE}" \
  --source . \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --no-cpu-throttling \
  --min-instances 1 \
  --max-instances 1 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --port 8080 \
  --set-env-vars "${ENV_VARS}"

URL="$(gcloud run services describe "${SERVICE}" \
  --project "${PROJECT_ID}" --region "${REGION}" \
  --format 'value(status.url)')"

echo
echo "Deployed: ${URL}"
echo "Health:   ${URL}/api/health"
echo
echo "Next: in Vercel, set  API_PROXY_TARGET=${URL}  and redeploy the frontend."
