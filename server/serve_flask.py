# server/serve_flask.py
import os
import base64
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import cv2
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from flask import Flask, request, jsonify
from flask_cors import CORS

# ---- load .env early ----
try:
    from dotenv import load_dotenv, find_dotenv
    ENV_PATH = find_dotenv() or str(Path(__file__).with_name(".env"))
    load_dotenv(ENV_PATH)
except Exception:
    pass

from python import analyze, PipeConfig

import firebase_admin
from firebase_admin import credentials, firestore, auth as fb_auth

app = Flask(__name__)
CORS(app)

DEEPSEEK_BASE = os.getenv("DEEPSEEK_BASE", "https://api.deepseek.com")
DEEPSEEK_KEY = os.getenv("DEEPSEEK_API_KEY", "")

# upload size
app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_CONTENT_LENGTH_MB", "16")) * 1024 * 1024  # default 16 MB


# ---------- HTTP session with retries for DeepSeek ----------
def _get_timeout():
    # ENV ปรับได้ เช่น DEEPSEEK_CONNECT_TIMEOUT=10, DEEPSEEK_READ_TIMEOUT=75
    c = float(os.getenv("DEEPSEEK_CONNECT_TIMEOUT", "10"))
    r = float(os.getenv("DEEPSEEK_READ_TIMEOUT", "75"))
    return (c, r)

def _make_session():
    s = requests.Session()
    retry = Retry(
        total=4,                # รวมครั้งแรก = 5 ครั้ง
        connect=3,              # retry เมื่อ connect ล้มเหลว
        read=3,                 # retry เมื่อ read timeout
        backoff_factor=0.8,     # 0.8, 1.6, 3.2, ...
        status_forcelist=(502, 503, 504),
        allowed_methods=frozenset(["GET", "POST", "HEAD"])
    )
    adapter = HTTPAdapter(max_retries=retry)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s

_HTTP = _make_session()
# -----------------------------------------------------------


def _init_firestore():
    cred_path_env = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_path_env and os.path.exists(cred_path_env):
        cred_path = cred_path_env
    else:
        cred_path = os.path.join(os.path.dirname(__file__), "firebase-key.json")
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    return firestore.client()


db = _init_firestore()


def _to_bool(v, default=False):
    if v is None:
        return default
    try:
        return bool(int(v))
    except Exception:
        return str(v).lower() in ("true", "t", "yes", "y", "1")


def _to_int(v, default=None):
    if v in (None, "", "null"):
        return default
    return int(v)


def _to_float(v, default=None):
    if v in (None, "", "null"):
        return default
    return float(v)


def _summarize_analyze(out: dict) -> dict:
    lines = (out or {}).get("lines", {}) or {}

    def pick(name):
        d = lines.get(name) or {}
        return {
            "length_px": d.get("length_px"),
            "branch_style": d.get("branch_style"),
        } if d else None

    roi = (out or {}).get("roi_bbox_small") or (out or {}).get("roi") or {}
    img = (out or {}).get("image_size") or {}

    return {
        "image_w": img.get("width"),
        "image_h": img.get("height"),
        "roi": {"x": roi.get("x"), "y": roi.get("y"), "w": roi.get("w"), "h": roi.get("h")},
        "life": pick("life"),
        "head": pick("head"),
        "heart": pick("heart"),
    }


def _ensure_user_doc(user_id: str):
    if not user_id:
        user_id = "anonymous"
    db.collection("users").document(user_id).set(
        {"updatedAt": firestore.SERVER_TIMESTAMP},
        merge=True,
    )
    return user_id


def _get_uid(req) -> str:
    # Prefer Firebase ID token from Authorization: Bearer <token>
    authz = req.headers.get("Authorization") or ""
    if authz.startswith("Bearer "):
        token = authz.split(" ", 1)[1].strip()
        if token:
            try:
                decoded = fb_auth.verify_id_token(token)
                uid = decoded.get("uid")
                if uid:
                    return uid
            except Exception as e:
                print("[auth] verify_id_token failed:", e)
    # Fallback to JSON body user_id for dev/testing
    if req.is_json:
        data = req.get_json(silent=True) or {}
        uid = (data.get("user_id") or "").strip()
        if uid:
            return uid
    return "anonymous"


def _fetch_user_profile(user_id: str) -> dict:
    """
    ดึงข้อมูล users/{user_id} (เช่น displayName, dob, gender, locale ฯลฯ)
    ถ้าเอกสารไม่มี ให้คืน {} (ไม่ error)
    """
    try:
        d = db.collection("users").document(user_id).get()
        return d.to_dict() or {}
    except Exception as e:
        print("[user_profile] fetch failed:", e)
        return {}


def _normalize_birth_date(raw) -> str | None:
    """
    Normalize common birth date formats to ISO ``YYYY-MM-DD`` strings.
    Accepts strings, datetime/date instances, or Firestore timestamps.
    """
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw.date().isoformat()
    if hasattr(raw, "to_datetime"):
        try:
            return raw.to_datetime().date().isoformat()
        except Exception:
            pass
    if isinstance(raw, str):
        value = raw.strip()
        if not value:
            return None
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
            try:
                return datetime.strptime(value, fmt).date().isoformat()
            except ValueError:
                continue
        if len(value) >= 4:
            return value
    return None


def _calculate_age(iso_date: str | None) -> int | None:
    if not iso_date:
        return None
    try:
        dob = datetime.fromisoformat(iso_date)
    except ValueError:
        return None
    today = datetime.now(timezone.utc).date()
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return age if age >= 0 else None


def _build_safe_profile(user_profile: dict) -> dict:
    """
    Map the Firestore user document to a compact, prompt-friendly dict.
    """
    safe: dict[str, object] = {}

    name = (
        user_profile.get("displayName")
        or user_profile.get("name")
        or user_profile.get("fullName")
    )
    if name:
        safe["name"] = name

    dob = (
        user_profile.get("dob")
        or user_profile.get("birthDate")
        or user_profile.get("birthdate")
    )
    dob_iso = _normalize_birth_date(dob)
    if dob_iso:
        safe["birthDate"] = dob_iso
        age = _calculate_age(dob_iso)
        if age is not None:
            safe["age"] = age

    for field, alias in (
        ("gender", "gender"),
        ("locale", "locale"),
        ("timezone", "timezone"),
        ("birthplace", "birthplace"),
        ("interests", "interests"),
        ("occupation", "occupation"),
    ):
        value = user_profile.get(field)
        if value not in (None, "", {}):
            safe[alias] = value

    return safe


@app.get("/routes")
def routes():
    return {"routes": sorted([r.rule for r in app.url_map.iter_rules()])}, 200


@app.get("/health")
def health():
    return "ok", 200


@app.get("/env")
def env_info():
    return jsonify({
        "has_deepseek_key": bool(DEEPSEEK_KEY),
        "deepseek_base": DEEPSEEK_BASE,
        "has_google_app_creds": bool(os.getenv("GOOGLE_APPLICATION_CREDENTIALS")),
    }), 200


@app.get("/debug/deepseek")
def debug_deepseek():
    """เช็คว่าออกเน็ตไปยัง DeepSeek ได้ไหม"""
    t0 = time.time()
    try:
        # 401/403 ถือว่า “ถึงปลายทาง” (แค่สิทธิ์/route) => reachable True
        resp = _HTTP.get(
            f"{DEEPSEEK_BASE}/v1/models",
            headers={"Authorization": f"Bearer {DEEPSEEK_KEY}"},
            timeout=_get_timeout(),
        )
        ms = int((time.time() - t0) * 1000)
        ok = resp.status_code in (200, 401, 403)
        return jsonify({"reachable": ok, "status": resp.status_code, "latency_ms": ms}), 200
    except requests.exceptions.ReadTimeout:
        return jsonify({"reachable": False, "error": "read_timeout"}), 504
    except requests.RequestException as e:
        return jsonify({"reachable": False, "error": str(e)}), 502


@app.get("/firestore/ping")
def firestore_ping():
    try:
        doc = {"ping": True, "ts": firestore.SERVER_TIMESTAMP}
        ref = db.collection("ping_test").add(doc)
        return jsonify({"ok": True, "id": ref[1].id}), 200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/analyze")
def analyze_endpoint():
    print(">> Content-Type:", request.content_type)
    print(">> files keys:", list(request.files.keys()))
    print(">> form keys:", list(request.form.keys()))

    img = None

    if "file" in request.files:
        fs = request.files["file"]
        raw = fs.read()
        print(">> received file:", fs.filename, fs.mimetype, "bytes:", len(raw))
        arr = np.frombuffer(raw, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            print("!! cv2.imdecode returned None for multipart file")

    elif request.is_json:
        data = request.get_json(silent=True) or {}
        b64 = data.get("image_b64")
        if not b64:
            return jsonify({"error": "missing image_b64"}), 400
        try:
            arr = np.frombuffer(base64.b64decode(b64), np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is None:
                print("!! cv2.imdecode returned None for base64 JSON")
        except Exception as e:
            print("!! base64 decode error:", e)
            return jsonify({"error": "invalid base64"}), 400

    if img is None:
        return jsonify({"error": "missing/invalid image"}), 400

    cfg = PipeConfig(
        max_side=_to_int(request.form.get("max_side")) or PipeConfig.max_side,
        strong_enhance=_to_bool(request.form.get("strong_enhance"), False),
        clahe_clip=_to_float(request.form.get("clahe_clip")) or PipeConfig.clahe_clip,
        detail_binary=_to_bool(request.form.get("detail_binary"), False),
        block_size=_to_int(request.form.get("block_size")) or PipeConfig.block_size,
        C=_to_int(request.form.get("C")) or PipeConfig.C,
        close_itr=_to_int(request.form.get("close_itr")) or PipeConfig.close_itr,
        open_itr=_to_int(request.form.get("open_itr")) or PipeConfig.open_itr,
        use_frangi=_to_bool(request.form.get("use_frangi"), False),
        frangi_thresh=_to_float(request.form.get("frangi_thresh")) or PipeConfig.frangi_thresh,
        rect_skeleton_kernel=_to_bool(request.form.get("rect_skeleton_kernel"), False),
        min_component_pixels=_to_int(request.form.get("min_component_pixels")) or PipeConfig.min_component_pixels,
        prune_spur_iter=_to_int(request.form.get("prune_spur_iter")) or PipeConfig.prune_spur_iter,
        show_hand=_to_bool(request.form.get("show_hand"), True),
        hand_refine=request.form.get("hand_refine") or PipeConfig.hand_refine,
        hand_alpha=_to_float(request.form.get("hand_alpha")) or PipeConfig.hand_alpha,
    )

    out = analyze(img, outdir="debug_out", Cfg=cfg)

    if isinstance(out, dict) and out.get("error"):
        return jsonify(out), 422

    return jsonify(out), 200


@app.post("/scan/save")
def scan_save():
    try:
        if not request.is_json:
            return jsonify({"error": "Content-Type must be application/json"}), 400

        data = request.get_json(silent=True) or {}
        user_id = _get_uid(request)
        analyze_result = data.get("analyze_result") or {}
        meta = data.get("meta") or {}

        if not isinstance(analyze_result, dict):
            return jsonify({"error": "analyze_result (object) is required"}), 400

        user_id = _ensure_user_doc(user_id)

        big_keys = [
            "roi_skeleton_png_b64", "roi_binary_png_b64", "roi_gray_png_b64",
            "full_image_b64", "image_b64", "mask_b64",
        ]
        slim_result = {k: v for k, v in analyze_result.items() if k not in big_keys}

        doc = {
            "user_id": user_id,
            "summary": _summarize_analyze(slim_result),
            "meta": meta,
            "createdAt": firestore.SERVER_TIMESTAMP,
        }

        ref = (
            db.collection("users")
              .document(user_id)
              .collection("scans")
              .add(doc)
        )
        return jsonify({"id": ref[1].id}), 201

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": f"save_failed: {e.__class__.__name__}: {str(e)}"}), 500


@app.get("/scan/list")
def scan_list():
    try:
        limit = int(request.args.get("limit", 20))
        # allow override via query for dev, else use token
        q_uid = (request.args.get("user_id") or "").strip()
        user_id = q_uid or _get_uid(request)

        user_id = _ensure_user_doc(user_id)

        q = (
            db.collection("users")
              .document(user_id)
              .collection("scans")
              .order_by("createdAt", direction=firestore.Query.DESCENDING)
              .limit(limit)
        )

        items = []
        for d in q.stream():
            obj = d.to_dict()
            obj["id"] = d.id
            items.append(obj)
        return jsonify(items), 200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": f"list_failed: {e.__class__.__name__}: {str(e)}"}), 500


@app.post("/ai/chat")
def ai_chat():
    if not DEEPSEEK_KEY:
        return jsonify({"error": "DEEPSEEK_API_KEY is missing"}), 500
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400

    data = request.get_json(silent=True) or {}
    model = data.get("model") or "deepseek-chat"
    messages = data.get("messages") or []
    stream = bool(data.get("stream", False))
    user_id = _get_uid(request)
    do_save = bool(data.get("save", True))

    user_id = _ensure_user_doc(user_id)

    try:
        r = _HTTP.post(
            f"{DEEPSEEK_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {DEEPSEEK_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "stream": stream
            },
            timeout=_get_timeout(),
        )
    except requests.exceptions.ReadTimeout:
        return jsonify({"error": "deepseek_timeout", "detail": "DeepSeek read timed out"}), 504
    except requests.RequestException as e:
        return jsonify({"error": "request_failed", "detail": str(e)}), 502

    if not r.ok:
        try:
            return jsonify(r.json()), r.status_code
        except Exception:
            return jsonify({"error": r.text}), r.status_code

    resp = r.json()

    saved_id = None
    if do_save:
        try:
            completion = (resp.get("choices") or [{}])[0].get("message", {})
            doc = {
                "user_id": user_id,
                "provider": "deepseek",
                "model": model,
                "prompt_last": messages[-1] if messages else None,
                "answer": completion,
                "raw": resp,
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
            ref = (
                db.collection("users")
                  .document(user_id)
                  .collection("ai_chats")
                  .add(doc)
            )
            saved_id = ref[1].id
        except Exception as e:
            resp["_save_error"] = str(e)

    return jsonify({"data": resp, "saved_id": saved_id}), 200


@app.post("/fortune/predict")
def fortune_predict():
    """
    ใช้สรุปเส้นลายมือ + โปรไฟล์ผู้ใช้ (ถ้ามี) เพื่อทำนาย 4 หัวข้อ:
    - ความรัก (Love)
    - การงาน (Career)
    - การเงิน (Finance)
    - สุขภาพ (Health)
    ครอบคลุมช่วงเวลา period: week|month (default=month)
    """
    if not DEEPSEEK_KEY:
        return jsonify({"error": "DEEPSEEK_API_KEY is missing"}), 500
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400

    data = request.get_json(silent=True) or {}
    scan_id = data.get("scan_id")
    summary = data.get("summary")
    user_id = _get_uid(request)
    model = data.get("model") or "deepseek-chat"
    language = (data.get("language") or "th").lower()
    style = (data.get("style") or "friendly").lower()
    period = (data.get("period") or "today").lower()

    if period not in ("today", "week", "month"):
        period = "today"

    user_id = _ensure_user_doc(user_id)

    # fetch user profile for context
    user_profile = _fetch_user_profile(user_id)
    safe_profile = _build_safe_profile(user_profile)
    # ตัวอย่างฟิลด์ที่คาดหวัง: displayName, dob (YYYY-MM-DD), gender, locale, timezone, interests ฯลฯ

    if not summary and scan_id:
        d = (
            db.collection("users")
              .document(user_id)
              .collection("scans")
              .document(scan_id)
              .get()
        )
        if not d.exists:
            return jsonify({"error": f"scan_id '{scan_id}' not found for user '{user_id}'"}), 404
        summary = d.to_dict().get("summary") or {}

    if not isinstance(summary, dict) or not summary:
        return jsonify({"error": "summary is required (either via scan_id or in body)"}), 400

    # ---------- Build prompts ----------
    sys_th = (
        "คุณคือผู้ช่วยโหราศาสตร์ลายมือ เชี่ยวชาญการอ่านเส้นชีวิต/เส้นสมอง/เส้นหัวใจ "
        "ตอบอย่างระมัดระวัง ไม่อ้างอิงเรื่องรักษาโรคหรือการเงินแบบชี้นำลงทุน "
        "ให้คำแนะนำเชิงบวก นำไปใช้ได้จริง และเคารพความเป็นส่วนตัวของผู้ใช้"
    )
    sys_en = (
        "You are a palmistry assistant who reads life/head/heart lines carefully, "
        "avoids medical or investment directives, and gives practical, positive, privacy-respecting guidance."
    )
    system_prompt = sys_th if language == "th" else sys_en

    def line_desc(name):
        d = (summary.get(name) or {})
        return f"{name}: length_px={d.get('length_px')}, branch_style={d.get('branch_style')}"

    # Embed user profile (safe fields only) and set time-frame copy

    if period == "today":
        period_text_th = "ภายในวันนี้"
        period_text_en = "today"
    elif period == "week":
        period_text_th = "ภายใน 7 วันข้างหน้า"
        period_text_en = "within the next 7 days"
    else:
        period_text_th = "ภายในเดือนนี้"
        period_text_en = "within this month"

    if language == "th":
        user_prompt = (
            "ช่วยทำนายจากลายมือ โดยยึดข้อมูลภาพรวมและโปรไฟล์ดังนี้\n"
            f"- {line_desc('life')}\n- {line_desc('head')}\n- {line_desc('heart')}\n"
            f"ขนาดภาพ: {summary.get('image_w')}x{summary.get('image_h')}, roi={summary.get('roi')}\n"
            f"ข้อมูลผู้ใช้ (ถ้ามี): {safe_profile}\n\n"
            f"กรอบเวลา: {period_text_th}\n"
            "รูปแบบคำตอบเป็นหัวข้อย่อย 4 หมวด และสั้นกระชับใช้งานได้จริง:\n"
            "1) ความรัก\n2) การงาน\n3) การเงิน\n4) สุขภาพ\n\n"
            "เพิ่ม: คำแนะนำปฏิบัติ 3-5 ข้อ และข้อควรระวัง 1-2 ข้อ\n"
            f"โทน: {'เป็นกันเอง' if style=='friendly' else 'เป็นทางการ'}\n"
            "ห้ามกล่าวอ้างการรักษาโรคหรือรับประกันผลลัพธ์ ทางการแพทย์/การเงิน และให้กำลังใจอย่างเหมาะสม"
        )
    else:
        user_prompt = (
            "Please read the palm using the following summary and user profile context:\n"
            f"- {line_desc('life')}\n- {line_desc('head')}\n- {line_desc('heart')}\n"
            f"image: {summary.get('image_w')}x{summary.get('image_h')}, roi={summary.get('roi')}\n"
            f"user profile (if any): {safe_profile}\n\n"
            f"Time frame: {period_text_en}\n"
            "Return concise, actionable sections:\n"
            "1) Love\n2) Career\n3) Finance\n4) Health\n\n"
            "Also include: 3-5 practical tips and 1-2 caveats.\n"
            f"Tone: {'friendly' if style=='friendly' else 'formal'}\n"
            "Avoid medical or investment guarantees. Be supportive and realistic."
        )

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "stream": False
    }

    try:
        r = _HTTP.post(
            f"{DEEPSEEK_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {DEEPSEEK_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=_get_timeout(),
        )
    except requests.exceptions.ReadTimeout:
        return jsonify({"error": "deepseek_timeout", "detail": "DeepSeek read timed out"}), 504
    except requests.RequestException as e:
        return jsonify({"error": "request_failed", "detail": str(e)}), 502

    if not r.ok:
        try:
            return jsonify(r.json()), r.status_code
        except Exception:
            return jsonify({"error": r.text}), r.status_code

    resp = r.json()
    answer = (resp.get("choices") or [{}])[0].get("message", {}).get("content", "")

    doc = {
        "user_id": user_id,
        "scan_id": scan_id,
        "summary": summary,
        "model": model,
        "language": language,
        "style": style,
        "period": period,
        "period_text": {"th": period_text_th, "en": period_text_en},
        "user_profile_used": safe_profile,
        "answer": answer,
        "raw": resp,
        "createdAt": firestore.SERVER_TIMESTAMP,
    }

    ref = (
        db.collection("users")
          .document(user_id)
          .collection("fortunes")
          .add(doc)
    )

    return jsonify({"fortune_id": ref[1].id, "answer": answer}), 201


print("SERVE FILE:", __file__)
print("DEEPSEEK_API_KEY set?:", bool(DEEPSEEK_KEY))

if __name__ == "__main__":
    print("URL MAP:", app.url_map)
    app.run(host="0.0.0.0", port=8000, debug=True, use_reloader=False)
