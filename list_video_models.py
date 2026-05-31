"""
List models reachable by your Gemini Developer API key, highlighting any
that support video generation (predictLongRunning).

Run:
  python list_video_models.py
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
params = {"key": API_KEY, "pageSize": 1000}

resp = requests.get(URL, params=params, timeout=30)
resp.raise_for_status()
data = resp.json()

models = data.get("models", [])
print(f"Total models visible: {len(models)}\n")

veo_models = []
plr_models = []
for m in models:
    name = m.get("name", "")
    methods = m.get("supportedGenerationMethods", [])
    if "veo" in name.lower():
        veo_models.append((name, methods))
    if "predictLongRunning" in methods:
        plr_models.append((name, methods))

print("=== Models with 'veo' in the name ===")
if not veo_models:
    print("  (none)")
for name, methods in veo_models:
    print(f"  {name}\n    methods: {methods}")

print("\n=== Models supporting predictLongRunning (video-capable) ===")
if not plr_models:
    print("  (none)")
for name, methods in plr_models:
    print(f"  {name}\n    methods: {methods}")
