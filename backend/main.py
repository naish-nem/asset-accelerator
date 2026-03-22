import json
import math
import os
import re
import base64
import logging
import threading

import httpx
import requests
from io import BytesIO
from pathlib import Path
from typing import Any, List, Optional, Tuple

from dotenv import load_dotenv
from PIL import Image
from rembg import remove
import replicate
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

_BACKEND_ENV_PATH = Path(__file__).resolve().parent / ".env"
# Use override=True so values in backend/.env win over empty shell vars.
if _BACKEND_ENV_PATH.is_file():
    load_dotenv(_BACKEND_ENV_PATH, override=True)
else:
    load_dotenv()

logger = logging.getLogger(__name__)

STABILITY_SF3D_URL = "https://api.stability.ai/v2beta/3d/stable-fast-3d"

STABILITY_3D_SETUP_HINT = (
    "3D conversion uses Stability AI Stable Fast 3D. "
    "Add your API key to backend/.env: STABILITY_API_KEY=sk-... "
    "See https://platform.stability.ai/docs/api-reference#tag/3D/paths/~1v2beta~13d~1stable-fast-3d/post"
)

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


class Convert3DItem(BaseModel):
    extracted_base64: str


class Convert3DRequest(BaseModel):
    items: List[Convert3DItem]


_stability_lock = threading.Lock()


class StableFast3DError(Exception):
    """Raised when Stability returns a non-200 or the body is not a valid GLB."""

    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        super().__init__(message)


def _resolve_stability_api_key() -> Optional[str]:
    for key in ("STABILITY_API_KEY", "STABILITY_AI_API_KEY"):
        raw = os.environ.get(key)
        if raw and raw.strip():
            return raw.strip()
    return None


@app.on_event("startup")
def _log_stability_config():
    if _resolve_stability_api_key():
        logger.info("3D: Stability AI Stable Fast 3D (API key set).")
    else:
        logger.warning(
            "STABILITY_API_KEY not set — /convert-3d will fail until configured. See %s",
            _BACKEND_ENV_PATH,
        )


def _decode_data_url_png(data_url: str) -> bytes:
    s = data_url.strip()
    m = re.match(
        r"^data:image/png;\s*base64\s*,\s*(.+)$",
        s,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        raise ValueError("expected data:image/png;base64,... URL")
    return base64.b64decode(m.group(1))


def _png_rgba_flattened_on_white(png_bytes: bytes) -> bytes:
    """
    Single-image 3D APIs expect a solid photo-style input. RGBA cutouts often read as empty;
    composite onto white so the model sees opaque pixels.
    """
    img = Image.open(BytesIO(png_bytes)).convert("RGBA")
    bg = Image.new("RGB", img.size, (255, 255, 255))
    bg.paste(img, mask=img.split()[3])
    out = BytesIO()
    bg.save(out, format="PNG", optimize=True)
    return out.getvalue()


def _ensure_png_min_side(png_bytes: bytes, min_side: int = 64) -> bytes:
    """Stable Fast 3D rejects images smaller than 64px per side."""
    img = Image.open(BytesIO(png_bytes)).convert("RGB")
    w, h = img.size
    if w >= min_side and h >= min_side:
        return png_bytes
    scale = max(min_side / w, min_side / h)
    nw = max(min_side, int(math.ceil(w * scale)))
    nh = max(min_side, int(math.ceil(h * scale)))
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    buf = BytesIO()
    resized.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _stability_sf3d_form_extras() -> dict:
    """Optional multipart fields; see Stability API reference."""
    extra: dict = {}
    tr = (os.environ.get("STABILITY_SF3D_TEXTURE_RESOLUTION") or "").strip()
    if tr in ("512", "1024", "2048"):
        extra["texture_resolution"] = tr
    fr = (os.environ.get("STABILITY_SF3D_FOREGROUND_RATIO") or "").strip()
    if fr:
        try:
            v = float(fr)
            if 0.1 <= v <= 1.0:
                extra["foreground_ratio"] = fr
        except ValueError:
            pass
    rm = (os.environ.get("STABILITY_SF3D_REMESH") or "").strip().lower()
    if rm in ("none", "triangle"):
        extra["remesh"] = rm
    return extra


def _glb_bytes_from_stability_response(response: httpx.Response) -> bytes:
    body = response.content
    if len(body) >= 4 and body[:4] == b"glTF":
        return body
    ct = (response.headers.get("content-type") or "").lower()
    if "application/json" in ct or body.lstrip().startswith(b"{"):
        try:
            obj = response.json()
        except json.JSONDecodeError as e:
            raise ValueError(f"Stable Fast 3D returned non-GLB body: {e}") from e
        arts = obj.get("artifacts")
        if isinstance(arts, list) and arts:
            first = arts[0]
            if isinstance(first, dict):
                b64 = first.get("base64")
                if isinstance(b64, str) and b64.strip():
                    raw = base64.b64decode(b64)
                    if len(raw) >= 4 and raw[:4] == b"glTF":
                        return raw
        errs = obj.get("errors")
        if isinstance(errs, list) and errs:
            raise ValueError("; ".join(str(x) for x in errs))
        if isinstance(obj.get("name"), str) and obj.get("name") == "bad_request":
            raise ValueError(str(obj))
        raise ValueError("Stable Fast 3D JSON response had no GLB artifact")
    raise ValueError(
        "Stable Fast 3D response was not a GLB (expected glTF header or JSON with artifacts)"
    )


def _format_stability_http_error(response: httpx.Response) -> Tuple[int, str]:
    detail = response.text.strip() or response.reason_phrase
    try:
        obj = response.json()
        errs = obj.get("errors")
        if isinstance(errs, list) and errs:
            detail = "; ".join(str(x) for x in errs)
    except Exception:
        pass
    code = response.status_code
    if code == 401:
        return 401, f"{STABILITY_3D_SETUP_HINT} (HTTP {code}: {detail})"
    if code == 402:
        return 402, f"Stability AI billing / credits: {detail}"
    if code == 403:
        return 403, f"Stability AI forbidden (check API key permissions): {detail}"
    if code == 429:
        return 429, f"Stability AI rate limited: {detail}"
    if 400 <= code < 500:
        return 400, f"Stable Fast 3D request rejected: {detail}"
    return 502, f"Stable Fast 3D upstream error (HTTP {code}): {detail}"


def png_data_url_to_glb_data_url(
    data_url: str,
) -> Tuple[str, Optional[Any], int, bool]:
    """
    POST image to Stability Stable Fast 3D (v2beta).
    Returns (glb data URL, mesh_stats always None, glb_len, texture_applied True on success).
    """
    api_key = _resolve_stability_api_key()
    if not api_key:
        raise StableFast3DError(401, STABILITY_3D_SETUP_HINT)

    raw_png = _decode_data_url_png(data_url)
    try:
        flat_png = _png_rgba_flattened_on_white(raw_png)
    except Exception as e:
        logger.warning("PNG flatten failed, using raw bytes: %s", e)
        flat_png = raw_png
    flat_png = _ensure_png_min_side(flat_png)

    files = {"image": ("input.png", flat_png, "image/png")}
    form = _stability_sf3d_form_extras()

    with _stability_lock:
        try:
            r = httpx.post(
                STABILITY_SF3D_URL,
                headers={"Authorization": f"Bearer {api_key}", "Accept": "*/*"},
                files=files,
                data=form,
                timeout=httpx.Timeout(300.0, connect=30.0),
            )
        except httpx.HTTPError as e:
            raise StableFast3DError(502, f"Stable Fast 3D request failed: {e}") from e

    if r.status_code != 200:
        sc, msg = _format_stability_http_error(r)
        raise StableFast3DError(sc, msg)

    try:
        glb_bytes = _glb_bytes_from_stability_response(r)
    except ValueError as e:
        raise StableFast3DError(502, str(e)) from e
    if len(glb_bytes) < 100:
        raise StableFast3DError(502, "downloaded GLB too small")
    glb_b64 = base64.b64encode(glb_bytes).decode("ascii")
    logger.info("Stable Fast 3D succeeded (%s bytes).", len(glb_bytes))
    return (
        f"data:model/gltf-binary;base64,{glb_b64}",
        None,
        len(glb_bytes),
        True,
    )


@app.get("/")
def read_root():
    return {
        "status": "ok",
        "message": "Voxelizer API running",
        "stability_api_key_configured": _resolve_stability_api_key() is not None,
        "stable_fast_3d_endpoint": STABILITY_SF3D_URL,
    }


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


@app.post("/convert-3d")
def convert_extracts_to_3d(req: Convert3DRequest):
    if not req.items:
        raise HTTPException(status_code=400, detail="items must not be empty")
    if not _resolve_stability_api_key():
        raise HTTPException(status_code=401, detail=STABILITY_3D_SETUP_HINT)
    out_items = []
    try:
        for i, item in enumerate(req.items):
            try:
                glb_url, mesh_stats, glb_len, texture_applied = png_data_url_to_glb_data_url(
                    item.extracted_base64
                )
                out_items.append(
                    {
                        "glb_base64": glb_url,
                        "mesh_stats": mesh_stats,
                        "glb_byte_length": glb_len,
                        "texture_applied": texture_applied,
                    }
                )
            except HTTPException:
                raise
            except StableFast3DError as e:
                raise HTTPException(
                    status_code=e.status_code,
                    detail=f"3D conversion failed for asset {i + 1}: {e}",
                ) from e
            except Exception as e:
                logger.exception("convert-3d failed for item %s", i)
                raise HTTPException(
                    status_code=502,
                    detail=f"3D conversion failed for asset {i + 1}: {e}",
                ) from e
        return {"status": "success", "items": out_items}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("convert-3d batch failed")
        raise HTTPException(status_code=500, detail=str(e)) from e


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
