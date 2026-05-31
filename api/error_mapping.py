"""Translate raw google-genai / FastAPI exceptions into structured, human-
readable errors with optional actionable hints.

Every helper here returns a dict with the same shape:

    {
      "code":      str,           # short machine-readable category
      "message":   str,           # one-line human message
      "hint":      Optional[str], # one-line suggested action (or None)
      "technical": Optional[str], # raw exception repr, for "show details"
    }
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional


def _raw(exc: BaseException) -> str:
    return f"{type(exc).__name__}: {exc}"


def _with_context(message: str, context: str) -> str:
    """Append ' while {context}' before the message's trailing period.

    Examples:
        _with_context("Quota or rate limit exceeded.", "generating the video")
        -> "Quota or rate limit exceeded while generating the video."
    """
    if not context:
        return message
    if message.endswith("."):
        return f"{message[:-1]} while {context}."
    return f"{message} while {context}."


def user_error(
    message: str,
    *,
    code: str = "USER_ERROR",
    hint: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a structured error for input-validation problems (4xx)."""
    return {
        "code": code,
        "message": message,
        "hint": hint,
        "technical": None,
    }


def humanize(exc: BaseException, *, context: str = "") -> Dict[str, Any]:
    """Map an upstream/runtime exception into a structured error.

    ``context`` is a verb phrase describing what we were doing when the error
    fired (e.g. ``"expanding the prompt"``). It is used in the generic
    fallback message when no specific pattern matches.
    """
    raw = _raw(exc)
    lower = raw.lower()

    # --- Model availability --------------------------------------------------
    m = re.search(r"models/([\w./-]+) is not found", raw)
    if m or ("not_found" in lower and "models/" in lower):
        model = m.group(1) if m else "the configured model"
        return {
            "code": "MODEL_NOT_FOUND",
            "message": _with_context(
                f"The model `{model}` isn't available on this API key.",
                context,
            ),
            "hint": (
                "Run `python list_video_models.py` or `list_image_models.py` "
                "to see what's available, then set TEXT_MODEL_ID / "
                "IMAGE_MODEL_ID / VIDEO_MODEL_ID in .env and restart the API."
            ),
            "technical": raw,
        }

    # --- Auth ----------------------------------------------------------------
    if (
        "permission_denied" in lower
        or " 403 " in raw
        or "unauthenticated" in lower
        or " 401 " in raw
    ):
        return {
            "code": "AUTH",
            "message": _with_context(
                "Authentication or permission failed.", context
            ),
            "hint": (
                "Open Settings (top-right) and paste a valid Gemini "
                "Developer API key from https://aistudio.google.com/app/apikey. "
                "Confirm the key has Veo / Gemini access enabled. For Vertex "
                "mode, run `gcloud auth application-default login` and confirm "
                "GOOGLE_CLOUD_PROJECT."
            ),
            "technical": raw,
        }

    # --- Quota / rate limits -------------------------------------------------
    if "resource_exhausted" in lower or " 429 " in raw:
        return {
            "code": "QUOTA",
            "message": _with_context(
                "Quota or rate limit exceeded.", context
            ),
            "hint": (
                "Wait ~1 minute (per-minute limits reset quickly) and retry. "
                "If it still 429s, you've hit the per-day cap — raise limits "
                "at https://aistudio.google.com, or temporarily switch to a "
                "different model (each has its own quota pool) by editing "
                "TEXT_MODEL_ID / IMAGE_MODEL_ID / VIDEO_MODEL_ID in .env."
            ),
            "technical": raw,
        }

    # --- Image format issues ------------------------------------------------
    if "unsupported" in lower and ("image" in lower or "mime" in lower):
        return {
            "code": "IMAGE_FORMAT",
            "message": _with_context(
                "The image format isn't accepted by the upstream model.",
                context,
            ),
            "hint": "Use PNG, JPEG, or WebP. Avoid HEIC, AVIF, SVG, GIF, BMP.",
            "technical": raw,
        }

    # --- person_generation valid-values mismatch ----------------------------
    if "persongeneration" in lower or "person_generation" in lower:
        return {
            "code": "PERSON_GEN",
            "message": _with_context(
                "The `person_generation` value isn't supported by this model.",
                context,
            ),
            "hint": (
                "Set PERSON_GENERATION in .env and restart the API. "
                "Gemini Developer API: `allow_all` for Veo 3.1, `dont_allow` "
                "for Veo 3.0. Vertex AI also accepts `allow_adult`."
            ),
            "technical": raw,
        }

    # --- Safety / content policy --------------------------------------------
    if (
        "veo cannot interpret" in lower
        or "blocked" in lower
        or ("invalid_argument" in lower and ("policy" in lower or "safety" in lower))
    ):
        return {
            "code": "POLICY",
            "message": _with_context(
                "The prompt or image was rejected by the model's safety / "
                "content policy.",
                context,
            ),
            "hint": (
                "Try rephrasing the prompt, removing identifying details "
                "(real names, public figures, brands, sensitive scenes)."
            ),
            "technical": raw,
        }

    # --- Upstream service unavailable ---------------------------------------
    if (
        " 500 " in raw
        or " 503 " in raw
        or "unavailable" in lower
        or "internal" in lower and "error" in lower
    ):
        return {
            "code": "UPSTREAM",
            "message": _with_context(
                "The upstream model service is temporarily unavailable.",
                context,
            ),
            "hint": "Wait a moment and retry.",
            "technical": raw,
        }

    # --- Timeout ------------------------------------------------------------
    if isinstance(exc, TimeoutError) or "timed out" in lower or "timeout" in lower:
        timeout_msg = (
            f"Timed out while {context}."
            if context
            else "The operation timed out before the model finished."
        )
        return {
            "code": "TIMEOUT",
            "message": timeout_msg,
            "hint": (
                "Veo jobs occasionally take more than 5 minutes under load. "
                "Retry, or raise VEO_TIMEOUT_SECONDS in the environment."
            ),
            "technical": raw,
        }

    # --- Generic invalid argument (catch-all 400 from upstream) -------------
    if "invalid_argument" in lower or " 400 " in raw:
        return {
            "code": "INVALID_ARGUMENT",
            "message": _with_context(
                "The model rejected the request as invalid.", context
            ),
            "hint": "Check inputs and try again. See technical details below.",
            "technical": raw,
        }

    # --- Fallback -----------------------------------------------------------
    return {
        "code": "UNKNOWN",
        "message": _with_context("Something went wrong.", context),
        "hint": "See technical details below.",
        "technical": raw,
    }
