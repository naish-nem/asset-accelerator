import os
import re
import time
import base64
import logging
import tempfile
import threading
import urllib.parse

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
# Use override=True so values in backend/.env win over empty shell vars (e.g. export HF_TOKEN=)
if _BACKEND_ENV_PATH.is_file():
    load_dotenv(_BACKEND_ENV_PATH, override=True)
else:
    load_dotenv()

logger = logging.getLogger(__name__)

HF_3D_SETUP_HINT = (
    "3D conversion uses Hugging Face ZeroGPU; anonymous requests are blocked. "
    "Create a token at https://huggingface.co/settings/tokens and add to backend/.env: "
    "HF_TOKEN=hf_... then restart the API. "
    "Alternatively run: huggingface-cli login (same machine as the backend)."
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


_hunyuan_client = None
_hunyuan_lock = threading.Lock()
_hunyuan_token_used: Optional[str] = None


def _resolve_hf_token() -> Optional[str]:
    """HF token for Gradio Spaces: env vars, then token from `huggingface-cli login`."""
    for key in ("HF_TOKEN", "HUGGINGFACE_HUB_TOKEN", "HUGGING_FACE_HUB_TOKEN"):
        raw = os.environ.get(key)
        if raw and raw.strip():
            return raw.strip()
    try:
        from huggingface_hub import get_token

        cached = get_token()
        if cached and cached.strip():
            return cached.strip()
    except Exception:
        pass
    return None


def get_hunyuan_client():
    global _hunyuan_client, _hunyuan_token_used

    hf_token = _resolve_hf_token()
    if _hunyuan_client is not None and _hunyuan_token_used != hf_token:
        try:
            _hunyuan_client.close()
        except Exception:
            pass
        _hunyuan_client = None

    if _hunyuan_client is None:
        from gradio_client import Client

        if not hf_token:
            logger.warning(
                "No Hugging Face token: 3D conversion will fail until HF_TOKEN is set "
                "or huggingface-cli login is run."
            )
        # download_files=False: gradio_client's built-in GET file=/tmp/... often hits HF 500s.
        _hunyuan_client = Client(
            "tencent/Hunyuan3D-2.1",
            hf_token=hf_token,
            verbose=False,
            httpx_kwargs={"timeout": 600.0},
            download_files=False,
        )
        _hunyuan_token_used = hf_token
    return _hunyuan_client


@app.on_event("startup")
def _log_hf_token_status():
    if _resolve_hf_token():
        logger.info("Hugging Face token is set; 3D conversion can use ZeroGPU.")
    else:
        logger.warning(
            "No Hugging Face token found. Set HF_TOKEN in %s or run huggingface-cli login.",
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
    Hunyuan3D expects a solid photo-style input. RGBA cutouts often read as empty; composite
    onto white so the model sees opaque pixels.
    """
    img = Image.open(BytesIO(png_bytes)).convert("RGBA")
    bg = Image.new("RGB", img.size, (255, 255, 255))
    bg.paste(img, mask=img.split()[3])
    out = BytesIO()
    bg.save(out, format="PNG", optimize=True)
    return out.getvalue()


def _file_data_from_shape_result(result: Tuple[Any, ...]) -> dict:
    if not result:
        raise ValueError("empty result from Hunyuan3D")
    first = result[0]
    if isinstance(first, (list, tuple)) and first:
        first = first[0]
    if isinstance(first, dict):
        inner = first.get("value")
        if isinstance(inner, dict) and isinstance(inner.get("path"), str):
            return inner
        if isinstance(first.get("path"), str):
            return first
    raise ValueError(f"unexpected shape_generation file output: {type(first).__name__}")


def _download_glb_from_space(client: Any, file_data: dict) -> bytes:
    """Fetch GLB bytes using Space auth; retries + percent-encoded file= fallback."""
    path = file_data.get("path")
    root = client.src if str(client.src).endswith("/") else str(client.src) + "/"
    urls: List[str] = []
    for u in (file_data.get("url"),):
        if isinstance(u, str) and u.strip():
            urls.append(u.strip())
    if isinstance(path, str) and path:
        enc = root + "file=" + urllib.parse.quote(path, safe="")
        if enc not in urls:
            urls.append(enc)
        raw = root + "file=" + path
        if raw not in urls:
            urls.append(raw)

    if not urls:
        raise ValueError("no download URL or path in Hunyuan3D file response")

    last_err: Optional[Exception] = None
    for url in urls:
        for attempt in range(3):
            try:
                r = httpx.get(
                    url,
                    headers=client.headers,
                    cookies=client.cookies,
                    follow_redirects=True,
                    timeout=300.0,
                )
                r.raise_for_status()
                body = r.content
                if len(body) < 100:
                    raise ValueError("downloaded file too small to be a valid GLB")
                if body[:4] != b"glTF":
                    raise ValueError(
                        "download is not a binary GLB (missing glTF header); "
                        "Space may have returned an error page"
                    )
                return body
            except Exception as e:
                last_err = e
                logger.warning(
                    "GLB download attempt %s failed for %s: %s",
                    attempt + 1,
                    url[:120],
                    e,
                )
                time.sleep(1.0 * (attempt + 1))
    raise last_err or RuntimeError("GLB download failed")


def _format_3d_upstream_error(exc: BaseException) -> Tuple[int, str]:
    """Map Gradio/HF errors to HTTP status and a clear detail string."""
    msg = str(exc).strip() or repr(exc)
    low = msg.lower()
    if "unlogged" in low or "zerogpu" in low:
        return 401, f"{HF_3D_SETUP_HINT} (upstream: {msg})"
    if "quota" in low and "gpu" in low:
        return 503, (
            f"Hugging Face GPU quota exhausted for this account. Try again later or use "
            f"https://huggingface.co/settings/billing — details: {msg}"
        )
    if "quota" in low:
        return 503, msg
    return 502, f"3D service error: {msg}"


def png_data_url_to_glb_data_url(data_url: str) -> Tuple[str, Optional[Any], int]:
    """Call Tencent Hunyuan3D-2.1 /shape_generation; returns (glb data URL, mesh_stats, glb_len)."""
    raw_png = _decode_data_url_png(data_url)
    try:
        flat_png = _png_rgba_flattened_on_white(raw_png)
    except Exception as e:
        logger.warning("PNG flatten failed, using raw bytes: %s", e)
        flat_png = raw_png
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=".png")
        try:
            os.write(fd, flat_png)
        finally:
            os.close(fd)
        from gradio_client import handle_file

        client = get_hunyuan_client()
        with _hunyuan_lock:
            result = client.predict(
                handle_file(tmp_path),
                None,
                None,
                None,
                None,
                30,
                5.0,
                1234,
                256,
                False,
                8000,
                True,
                api_name="/shape_generation",
            )
        file_data = _file_data_from_shape_result(result)
        glb_bytes = _download_glb_from_space(client, file_data)
        glb_b64 = base64.b64encode(glb_bytes).decode("ascii")
        mesh_stats = result[2] if len(result) > 2 else None
        return f"data:model/gltf-binary;base64,{glb_b64}", mesh_stats, len(glb_bytes)
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

@app.get("/")
def read_root():
    return {
        "status": "ok",
        "message": "Voxelizer API running",
        "huggingface_token_configured": _resolve_hf_token() is not None,
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
    if not _resolve_hf_token():
        raise HTTPException(status_code=401, detail=HF_3D_SETUP_HINT)
    out_items = []
    try:
        for i, item in enumerate(req.items):
            try:
                glb_url, mesh_stats, glb_len = png_data_url_to_glb_data_url(
                    item.extracted_base64
                )
                out_items.append(
                    {
                        "glb_base64": glb_url,
                        "mesh_stats": mesh_stats,
                        "glb_byte_length": glb_len,
                    }
                )
            except HTTPException:
                raise
            except Exception as e:
                logger.exception("convert-3d failed for item %s", i)
                status, detail = _format_3d_upstream_error(e)
                raise HTTPException(
                    status_code=status,
                    detail=f"3D conversion failed for asset {i + 1}: {detail}",
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
