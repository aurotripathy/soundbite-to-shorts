"""FastAPI service that fronts L_3.ipynb's pipeline:

  POST /api/structured-prompt   -> Gemini expands 8 keywords into a cinematic prompt
  POST /api/videos              -> Submit Veo job (prompt + optional reference image)
  GET  /api/videos/{id}         -> Job status
  GET  /api/videos/{id}/file    -> MP4 bytes (when status == "done")
  GET  /api/health              -> Sanity check

Auth and mode are driven by .env at the project root (loaded below).

The google-genai SDK picks Gemini Developer API vs Vertex AI from env vars:
  GOOGLE_GENAI_USE_VERTEXAI=false + GOOGLE_API_KEY=...
  GOOGLE_GENAI_USE_VERTEXAI=true  + GOOGLE_CLOUD_PROJECT=... + ADC
"""

from __future__ import annotations

import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=False)

from fastapi import (  # noqa: E402
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    UploadFile,
)
from fastapi.responses import Response  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from google import genai  # noqa: E402
from google.genai import types  # noqa: E402

from api.error_mapping import humanize, user_error  # noqa: E402


TEXT_MODEL_ID = os.getenv("TEXT_MODEL_ID", "gemini-2.5-flash")
IMAGE_MODEL_ID = os.getenv("IMAGE_MODEL_ID", "gemini-3.1-flash-image-preview")
VIDEO_MODEL_ID = os.getenv("VIDEO_MODEL_ID", "veo-3.1-fast-generate-preview")
USE_VERTEX = (os.getenv("GOOGLE_GENAI_USE_VERTEXAI") or "").strip().lower() in {
    "1",
    "true",
    "yes",
    "y",
}
POLL_SECONDS = int(os.getenv("VEO_POLL_SECONDS", "15"))
JOB_TIMEOUT_SECONDS = int(os.getenv("VEO_TIMEOUT_SECONDS", str(10 * 60)))
# person_generation values supported per model/region differ. Defaults below
# match what works on the Gemini Developer API for the corresponding tiers.
# Override with PERSON_GENERATION=allow_all|allow_adult|dont_allow in .env.
PERSON_GENERATION = os.getenv(
    "PERSON_GENERATION",
    "allow_adult" if USE_VERTEX else "allow_all",
)

app = FastAPI(title="gen-video API")

# Server-side default key from env. May be missing (deployed BYO-key mode):
# users will then have to supply X-Goog-Api-Key on every request.
DEFAULT_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
HAS_DEFAULT_KEY = bool(DEFAULT_API_KEY) or USE_VERTEX

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="veo")


def _get_client(user_api_key: Optional[str]) -> genai.Client:
    """Build a google-genai client for this request.

    Vertex mode ignores the header (auth is via ADC). Otherwise, prefer the
    user's BYO key from the X-Goog-Api-Key header, falling back to the env
    default. Raises 401 with a friendly hint when no key is available.
    """
    if USE_VERTEX:
        return genai.Client()

    key = (user_api_key or "").strip() or DEFAULT_API_KEY
    if not key:
        raise HTTPException(
            401,
            detail=user_error(
                "No API key. Open Settings (top-right) and paste your "
                "Gemini Developer API key.",
                code="AUTH",
                hint=(
                    "Get one at https://aistudio.google.com/app/apikey. "
                    "It's stored only in your browser."
                ),
            ),
        )
    return genai.Client(api_key=key)

# In-memory job table. Single-process only; fine for local dev.
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


# ----- request / response models ------------------------------------------------


class Keywords(BaseModel):
    subject: str = ""
    action: str = ""
    scene: str = ""
    style: str = ""
    camera_angle: str = ""
    camera_movement: str = ""
    sound_effects: str = ""
    dialogue: str = ""


class ApiError(BaseModel):
    code: str
    message: str
    hint: Optional[str] = None
    technical: Optional[str] = None


class StructuredPromptResponse(BaseModel):
    prompt: str


class JobStatusResponse(BaseModel):
    status: str
    error: Optional[ApiError] = None
    elapsed_seconds: int


class JobSubmitResponse(BaseModel):
    job_id: str


# ----- routes ------------------------------------------------------------------


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "vertex": USE_VERTEX,
        "text_model": TEXT_MODEL_ID,
        "image_model": IMAGE_MODEL_ID,
        "video_model": VIDEO_MODEL_ID,
        "person_generation": PERSON_GENERATION,
        # True when the server can fall back to its own credentials so the
        # UI can decide whether to nudge the user to set their own key.
        # Never leak the key value itself.
        "has_default_key": HAS_DEFAULT_KEY,
    }


@app.post("/api/structured-prompt", response_model=StructuredPromptResponse)
def structured_prompt(
    kw: Keywords,
    x_goog_api_key: Optional[str] = Header(default=None),
) -> StructuredPromptResponse:
    keyword_values = [
        kw.subject,
        kw.action,
        kw.scene,
        kw.style,
        kw.camera_angle,
        kw.camera_movement,
        kw.sound_effects,
        kw.dialogue,
    ]
    keyword_values = [v.strip() for v in keyword_values if v and v.strip()]
    if not keyword_values:
        raise HTTPException(400, detail=user_error("Provide at least one keyword."))

    gemini_prompt = (
        "Your task is to expand the following keywords into a single, "
        "high-fidelity, descriptive prompt for video generation. Every single "
        "keyword MUST be included. Synthesize them into a single, cohesive, "
        "and cinematic instruction. Do not add any new core concepts. Output "
        "ONLY the final prompt string, without any introduction or "
        "explanation. Mandatory Keywords: " + ", ".join(keyword_values)
    )

    client = _get_client(x_goog_api_key)
    try:
        resp = client.models.generate_content(
            model=TEXT_MODEL_ID, contents=gemini_prompt
        )
    except Exception as e:
        raise HTTPException(
            502, detail=humanize(e, context="expanding the prompt")
        ) from e

    text = (resp.text or "").strip()
    if not text:
        raise HTTPException(
            502,
            detail=user_error(
                "The text model returned no text.",
                code="EMPTY_RESPONSE",
                hint="Try again or rephrase the keywords.",
            ),
        )
    return StructuredPromptResponse(prompt=text)


@app.post("/api/grounding-frame")
async def grounding_frame(
    instruction: str = Form(...),
    style_frames: list[UploadFile] = File(default=[]),
    x_goog_api_key: Optional[str] = Header(default=None),
) -> Response:
    """Generate the first ("grounding") frame for a Veo video.

    Required:
      instruction   - text-to-image prompt describing the desired first frame.

    Optional:
      style_frames  - one or more reference images. When multiple are supplied,
                      the instruction should describe how to mix / combine
                      them (e.g. "subject from frame 1, lighting from frame 2,
                      background from frame 3").
    """
    instruction = (instruction or "").strip()
    if not instruction:
        raise HTTPException(400, detail=user_error("Empty instruction."))

    contents: list = []
    for idx, sf in enumerate(style_frames or []):
        if sf is None:
            continue
        data = await sf.read()
        if not data:
            raise HTTPException(
                400, detail=user_error(f"Style frame {idx + 1} was empty.")
            )
        contents.append(
            types.Part.from_bytes(
                data=data,
                mime_type=sf.content_type or "image/png",
            )
        )
    contents.append(instruction)

    client = _get_client(x_goog_api_key)
    try:
        response = client.models.generate_content(
            model=IMAGE_MODEL_ID,
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio="16:9"),
            ),
        )
    except Exception as e:
        raise HTTPException(
            502, detail=humanize(e, context="generating the first frame")
        ) from e

    # Check prompt-level block (rare but possible: prompt itself filtered).
    prompt_feedback = getattr(response, "prompt_feedback", None)
    block_reason = getattr(prompt_feedback, "block_reason", None)
    if block_reason:
        raise HTTPException(
            502,
            detail=user_error(
                f"The instruction was blocked by safety filters "
                f"(reason: {block_reason}).",
                code="BLOCKED",
                hint=(
                    "Rephrase the instruction, remove names of real people / "
                    "brands, and avoid sensitive content."
                ),
            ),
        )

    if not response.candidates:
        raise HTTPException(
            502,
            detail=user_error(
                "The image model returned no candidates.",
                code="EMPTY_RESPONSE",
                hint="Try a different instruction or remove some reference frames.",
            ),
        )

    candidate = response.candidates[0]
    finish_reason = getattr(candidate, "finish_reason", None)
    content = getattr(candidate, "content", None)
    parts = getattr(content, "parts", None) if content else None

    if not parts:
        # Candidate exists but has no parts — typically a safety / recitation
        # / other refusal. finish_reason names the cause.
        reason = str(finish_reason) if finish_reason else "no parts returned"
        raise HTTPException(
            502,
            detail=user_error(
                f"The image model refused to return an image ({reason}).",
                code="REFUSED",
                hint=(
                    "Most often this is a safety filter. Rephrase the "
                    "instruction (avoid real names, public figures, brands, "
                    "or sensitive content). If you supplied reference "
                    "frames, try removing the most identifiable one."
                ),
            ),
        )

    for part in parts:
        inline = getattr(part, "inline_data", None)
        if inline and inline.data:
            return Response(
                content=inline.data,
                media_type=inline.mime_type or "image/png",
            )

    raise HTTPException(
        502,
        detail=user_error(
            "The image model returned no image data.",
            code="EMPTY_RESPONSE",
            hint=(
                "The model produced a response but with no image. Try a "
                "different instruction or a different IMAGE_MODEL_ID."
            ),
        ),
    )


@app.post("/api/videos", response_model=JobSubmitResponse)
async def submit_video(
    prompt: str = Form(...),
    image: Optional[UploadFile] = File(None),
    x_goog_api_key: Optional[str] = Header(default=None),
) -> JobSubmitResponse:
    prompt = (prompt or "").strip()
    if not prompt:
        raise HTTPException(400, detail=user_error("Empty prompt."))

    # Fail fast at submit time if there's no usable key, so the user gets
    # a clean 401 instead of a job that errors a few seconds later.
    _get_client(x_goog_api_key)

    image_bytes: Optional[bytes] = None
    image_mime: Optional[str] = None
    if image is not None:
        image_bytes = await image.read()
        image_mime = image.content_type or "image/png"
        if not image_bytes:
            raise HTTPException(
                400, detail=user_error("Uploaded image was empty.")
            )

    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _jobs[job_id] = {
            "status": "queued",
            "error": None,
            "started_at": time.time(),
            "finished_at": None,
            "video_bytes": None,
        }

    # Capture the user's key into a local string for the worker thread —
    # request context (and therefore the Header dependency) is gone by
    # the time the thread runs.
    worker_key = (x_goog_api_key or "").strip() or DEFAULT_API_KEY
    _executor.submit(
        _run_video_job, job_id, prompt, image_bytes, image_mime, worker_key
    )
    return JobSubmitResponse(job_id=job_id)


@app.get("/api/videos/{job_id}", response_model=JobStatusResponse)
def get_status(job_id: str) -> JobStatusResponse:
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, detail=user_error("Job not found."))
    finished = job["finished_at"] or time.time()
    err = job.get("error")
    return JobStatusResponse(
        status=job["status"],
        error=ApiError(**err) if err else None,
        elapsed_seconds=int(finished - job["started_at"]),
    )


@app.get("/api/videos/{job_id}/file")
def get_file(job_id: str) -> Response:
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, detail=user_error("Job not found."))
    if job["status"] != "done" or not job["video_bytes"]:
        raise HTTPException(
            409,
            detail=user_error(
                f"Job not ready (status={job['status']}).",
                code="JOB_NOT_READY",
            ),
        )
    return Response(content=job["video_bytes"], media_type="video/mp4")


# ----- worker ------------------------------------------------------------------


def _update_job(job_id: str, **fields) -> None:
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id].update(fields)


def _run_video_job(
    job_id: str,
    prompt: str,
    image_bytes: Optional[bytes],
    image_mime: Optional[str],
    api_key: Optional[str],
) -> None:
    _update_job(job_id, status="running")
    started = time.monotonic()
    try:
        # Build the client inside the worker so each job uses its own key.
        # Bypass _get_client() because that helper depends on FastAPI request
        # context (it raises HTTPException) — we already validated at submit.
        client = (
            genai.Client() if USE_VERTEX else genai.Client(api_key=api_key)
        )

        config_kwargs: dict = {
            "aspect_ratio": "16:9",
            "number_of_videos": 1,
            "duration_seconds": 8,
            "person_generation": PERSON_GENERATION,
        }
        if USE_VERTEX:
            # Vertex-only knobs (rejected by Gemini Developer API).
            config_kwargs["resolution"] = "720p"
            config_kwargs["generate_audio"] = True

        call_kwargs: dict = dict(
            model=VIDEO_MODEL_ID,
            prompt=prompt,
            config=types.GenerateVideosConfig(**config_kwargs),
        )
        if image_bytes:
            call_kwargs["image"] = types.Image(
                image_bytes=image_bytes,
                mime_type=image_mime or "image/png",
            )

        operation = client.models.generate_videos(**call_kwargs)

        while not operation.done:
            if time.monotonic() - started > JOB_TIMEOUT_SECONDS:
                raise TimeoutError(
                    f"Veo operation timed out after {JOB_TIMEOUT_SECONDS}s."
                )
            time.sleep(POLL_SECONDS)
            operation = client.operations.get(operation)

        if getattr(operation, "error", None):
            raise RuntimeError(str(operation.error))
        if not operation.response:
            raise RuntimeError("Operation done but no response.")

        video = operation.result.generated_videos[0].video
        data = getattr(video, "video_bytes", None)
        if data is None:
            # Gemini Developer API returns a File ref; fetch the bytes.
            client.files.download(file=video)
            data = getattr(video, "video_bytes", None)
        if not data:
            raise RuntimeError("Video had no bytes after download.")

        _update_job(
            job_id,
            status="done",
            video_bytes=data,
            finished_at=time.time(),
        )
    except Exception as e:
        _update_job(
            job_id,
            status="error",
            error=humanize(e, context="generating the video"),
            finished_at=time.time(),
        )
