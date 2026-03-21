import os
import base64
import logging
import requests
from io import BytesIO
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from PIL import Image
from rembg import remove
import replicate
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().parent / ".env")

logger = logging.getLogger(__name__)

TTC_COMPRESS_URL = "https://api.thetokencompany.com/v1/compress"
SYSTEM_PROMPT = (
    "Game asset sprite sheet. Strictly orthographic isometric 3D render angle. "
    "Clean white background. High contrast, sharp focus, clean edges. "
    "Distinct objects clearly separated with physical distance. "
    "Avoid overlapping silhouettes."
)

app = FastAPI(title="Voxelizer MVP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    prompt: str
    style_preset: str = "Isometric Game Asset"

class ExtractRequest(BaseModel):
    image_url: str
    bbox: dict

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Voxelizer API running"}


def compress_prompt_for_image_model(user_prompt: str, api_key: Optional[str]) -> str:
    """Compress user prompt via bear-1.2; system instructions stay verbatim (ttc_safe)."""
    fallback = f"{user_prompt}. {SYSTEM_PROMPT}"
    if not api_key or not api_key.strip():
        return fallback
    payload = {
        "model": "bear-1.2",
        "input": f"{user_prompt}\n<ttc_safe>{SYSTEM_PROMPT}</ttc_safe>",
        "compression_settings": {"aggressiveness": 0.1},
    }
    try:
        r = requests.post(
            TTC_COMPRESS_URL,
            headers={
                "Authorization": f"Bearer {api_key.strip()}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
        )
        r.raise_for_status()
        data = r.json()
        out = data.get("output")
        if isinstance(out, str) and out.strip():
            return out.strip()
    except Exception as e:
        logger.warning("Token compression failed, using uncompressed prompt: %s", e)
    return fallback


@app.post("/generate")
def generate_image(req: GenerateRequest):
    api_token = os.environ.get("REPLICATE_API_TOKEN")
    ttc_key = os.environ.get("THETOKENCOMPANY_API_KEY")
    full_prompt = compress_prompt_for_image_model(req.prompt, ttc_key)

    if not api_token:
        return {
            "status": "mock",
            "image_url": "https://replicate.delivery/yhqm/f1N3UvRMBiU9DapE5Neq35Qyv2s97iF03e3v7H7O3uOewn0TA/out-0.webp",
            "message": "Mock image"
        }
    
    try:
        output = replicate.run(
            "black-forest-labs/flux-schnell",
            input={
                "prompt": full_prompt,
                "go_fast": True,
                "megapixels": "1",
                "num_outputs": 1,
                "output_format": "png",
                "output_quality": 80,
            },
        )
        image_url = str(output[0]) if isinstance(output, list) else str(output)
        return {"status": "success", "image_url": image_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/extract")
def extract_asset(req: ExtractRequest):
    try:
        response = requests.get(req.image_url)
        response.raise_for_status()
        img = Image.open(BytesIO(response.content)).convert("RGBA")
        
        x, y, w, h = int(req.bbox.get('x', 0)), int(req.bbox.get('y', 0)), int(req.bbox.get('w', img.width)), int(req.bbox.get('h', img.height))
        cropped_img = img.crop((x, y, x + w, y + h))
        
        transparent_img = remove(cropped_img)
        
        buffered = BytesIO()
        transparent_img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        return {
            "status": "success",
            "extracted_base64": f"data:image/png;base64,{img_str}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
