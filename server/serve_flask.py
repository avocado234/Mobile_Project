# server/serve_flask.py
import os
import base64
from datetime import datetime, timezone

import numpy as np
import cv2

from flask import Flask, request, jsonify
from flask_cors import CORS

# ====== Pipeline (ต้องมีไฟล์ server/python.py ให้ import ได้) ======
from python import analyze, PipeConfig

# ====== Firebase Admin / Firestore ======
import firebase_admin
from firebase_admin import credentials, firestore

app = Flask(__name__)
CORS(app)

# ---------- Firebase init ----------
# ใช้ env GOOGLE_APPLICATION_CREDENTIALS ถ้ามี, ไม่ก็ไฟล์ firebase-key.json ในโฟลเดอร์นี้
_cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or os.path.join(os.path.dirname(__file__), "firebase-key.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(_cred_path)
    firebase_admin.initialize_app(cred)
db = firestore.client()

# ---------- อัปโหลดสูงสุด ----------
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB


# ---------- Utils ----------
def _summarize_analyze(out: dict) -> dict:
    """ย่อผลสำหรับบันทึกลง Firestore (เล็ก/อ่านง่าย)"""
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


# ---------- Health ----------
@app.get("/health")
def health():
    return "ok", 200


# ---------- วิเคราะห์ภาพ ----------
@app.post("/analyze")
def analyze_endpoint():
    # Debug logs
    print(">> Content-Type:", request.content_type)
    print(">> files keys:", list(request.files.keys()))
    print(">> form keys:", list(request.form.keys()))

    img = None

    # A) multipart/form-data (Expo/Postman)
    if "file" in request.files:
        fs = request.files["file"]
        raw = fs.read()
        print(">> received file:", fs.filename, fs.mimetype, "bytes:", len(raw))
        arr = np.frombuffer(raw, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            print("!! cv2.imdecode returned None for multipart file")

    # B) raw JSON { "image_b64": "<base64>" }
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

    # อ่านพารามิเตอร์ (optional)
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

    # รัน pipeline
    out = analyze(img, outdir="debug_out", Cfg=cfg)

    # ถ้าพลาด ให้ตอบ 422 (ไม่ให้ 500)
    if isinstance(out, dict) and out.get("error"):
        return jsonify(out), 422

    return jsonify(out), 200


# ---------- บันทึกผลสแกนลง Firestore ----------
@app.post("/scan/save")
def scan_save():
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400

    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id") or "anonymous"
    analyze_result = data.get("analyze_result")
    meta = data.get("meta") or {}

    if not isinstance(analyze_result, dict):
        return jsonify({"error": "analyze_result (object) is required"}), 400

    doc = {
        "user_id": user_id,
        "summary": _summarize_analyze(analyze_result),
        "meta": meta,
        "createdAt": firestore.SERVER_TIMESTAMP,
    }

    # ถ้าอยากเก็บภาพโครงร่าง skeleton เป็น base64 ด้วย
    if "roi_skeleton_png_b64" in analyze_result:
        doc["skeleton_b64"] = analyze_result["roi_skeleton_png_b64"]

    ref = db.collection("scans").add(doc)  # (write_time, doc_ref)
    return jsonify({"id": ref[1].id}), 201


# ---------- ดึงรายการสแกน ----------
@app.get("/scan/list")
def scan_list():
    limit = int(request.args.get("limit", 20))
    user_id = request.args.get("user_id")

    q = db.collection("scans").order_by("createdAt", direction=firestore.Query.DESCENDING).limit(limit)
    if user_id:
        q = q.where("user_id", "==", user_id)

    items = []
    for d in q.stream():
        obj = d.to_dict()
        obj["id"] = d.id
        items.append(obj)
    return jsonify(items), 200


if __name__ == "__main__":
    # use_reloader=False กันรีสตาร์ทกลางคำขอ
    app.run(host="0.0.0.0", port=8000, debug=True, use_reloader=False)
