"""
Smoke test for veo-3.1-fast-generate-001 access.

Reads config from a .env file in the project root. The google-genai SDK
auto-selects between the Gemini Developer API and Vertex AI based on env vars:

  Gemini Developer API:
    GOOGLE_GENAI_USE_VERTEXAI=false
    GOOGLE_API_KEY=...

  Vertex AI:
    GOOGLE_GENAI_USE_VERTEXAI=true
    GOOGLE_CLOUD_PROJECT=...
    GOOGLE_CLOUD_LOCATION=us-central1
    # plus ADC: `gcloud auth application-default login`

Optional overrides:
    VIDEO_MODEL_ID=veo-3.1-fast-generate-001   # default

Install:
  pip install google-genai python-dotenv

Run:
  python test_veo_access.py
"""

import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH, override=False)

VIDEO_MODEL_ID = os.getenv("VIDEO_MODEL_ID", "veo-3.1-fast-generate-001")
# PROMPT = "A close-up of a sunflower swaying gently in a soft breeze."
PROMPT = (
    "A friendly woman sitting at a desk, looking at the camera, saying: "
    '"Hi there! Today I am going to explain the Pythagorean theorem." '
    "Warm lighting, soft office ambience."
)
POLL_SECONDS = 15
TIMEOUT_SECONDS = 10 * 60


def _truthy(v: str | None) -> bool:
    return (v or "").strip().lower() in {"1", "true", "yes", "y"}


def main() -> int:
    if not ENV_PATH.exists():
        print(f"ERROR: no .env at {ENV_PATH}", file=sys.stderr)
        return 2

    use_vertex = _truthy(os.getenv("GOOGLE_GENAI_USE_VERTEXAI"))
    mode = "Vertex AI" if use_vertex else "Gemini Developer API"

    print(f"Env file: {ENV_PATH}")
    print(f"Mode:     {mode}")
    print(f"Model:    {VIDEO_MODEL_ID}")

    if use_vertex:
        project = os.getenv("GOOGLE_CLOUD_PROJECT")
        location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
        print(f"Project:  {project}")
        print(f"Location: {location}")
        if not project:
            print("ERROR: GOOGLE_CLOUD_PROJECT required for Vertex mode.",
                  file=sys.stderr)
            return 2
    else:
        if not os.getenv("GOOGLE_API_KEY"):
            print("ERROR: GOOGLE_API_KEY required for Gemini API mode.",
                  file=sys.stderr)
            return 2

    client = genai.Client()

    config_kwargs: dict = {
        "aspect_ratio": "16:9",
        "number_of_videos": 1,
        "duration_seconds": 8,
        "person_generation": "allow_adult" if use_vertex else "allow_all",
    }
    if use_vertex:
        config_kwargs["resolution"] = "720p"
        config_kwargs["generate_audio"] = True

    print(f"\nSubmitting Veo job...\n  prompt={PROMPT!r}")
    try:
        operation = client.models.generate_videos(
            model=VIDEO_MODEL_ID,
            prompt=PROMPT,
            config=types.GenerateVideosConfig(**config_kwargs),
        )
    except Exception as e:
        print(f"\nFAIL at submission: {type(e).__name__}: {e}", file=sys.stderr)
        return 1

    print(f"Operation: {getattr(operation, 'name', '<unknown>')}")
    print("Polling (this can take 1-5 minutes)...")

    started = time.monotonic()
    while not operation.done:
        if time.monotonic() - started > TIMEOUT_SECONDS:
            print("FAIL: timeout waiting for operation.", file=sys.stderr)
            return 1
        time.sleep(POLL_SECONDS)
        operation = client.operations.get(operation)
        print(f"  ...elapsed {int(time.monotonic() - started)}s")

    if getattr(operation, "error", None):
        print(f"\nFAIL: operation error: {operation.error}", file=sys.stderr)
        return 1

    if not operation.response:
        print("\nFAIL: operation done but no response.", file=sys.stderr)
        return 1

    videos = operation.result.generated_videos
    print(f"\nOK: received {len(videos)} video(s).")

    video = videos[0].video
    out = "veo_smoke_test.mp4"

    data = getattr(video, "video_bytes", None)
    if data is None:
        # Gemini Developer API: returned as a File ref; download it.
        print(f"Downloading video from {getattr(video, 'uri', '<no uri>')}...")
        client.files.download(file=video)
        data = getattr(video, "video_bytes", None)

    if data is None:
        print("FAIL: video has no bytes after download.", file=sys.stderr)
        return 1

    with open(out, "wb") as f:
        f.write(data)
    size_kb = os.path.getsize(out) / 1024
    print(f"Wrote {out} ({size_kb:.1f} KB).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
