"""
List models reachable by your Gemini Developer API key, highlighting any
that can produce images (Gemini multimodal image output, or Imagen).

Run:
  python list_image_models.py
"""

import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH, override=False)

API_KEY = os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    print("ERROR: GOOGLE_API_KEY not set in .env", file=sys.stderr)
    sys.exit(2)

URL = "https://generativelanguage.googleapis.com/v1beta/models"
resp = requests.get(URL, params={"key": API_KEY, "pageSize": 1000}, timeout=30)
resp.raise_for_status()
models = resp.json().get("models", [])

print(f"Total models visible: {len(models)}\n")

candidates = []
for m in models:
    name = m.get("name", "")
    methods = m.get("supportedGenerationMethods", [])
    lname = name.lower()
    looks_image = (
        "imagen" in lname
        or "image" in lname
        or "predict" in methods  # Imagen-style models use 'predict'
    )
    if looks_image:
        candidates.append((name, methods))

print("=== Image-capable candidates ===")
if not candidates:
    print("  (none)")
for name, methods in candidates:
    print(f"  {name}\n    methods: {methods}")
