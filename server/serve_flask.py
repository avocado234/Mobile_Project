# server/serve_flask.py
import os
import base64
from datetime import datetime, timezone

import numpy as np
import cv2
from flask import Flask, request, jsonify
from flask_cors import CORS

# pipeline ภาพของคุณ (อยู่ใน server/python.py)
from python import analyze, PipeConfig

# ---------- Firebase Admin ----------
import firebase_admin
from firebase_admin import credentials, firestore

app = Flask(__name__)
CORS(app)

# ตั้งขนาด upload สูงสุด (ปรับได้)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB

# --------- Init Firestore (ครั้งเดียว) ----------
def _init_firestore():
    """
    ใช้ไฟล์ service account ชื่อ 'firebase-key.json' ในโฟลเดอร์เดียวกับ serve_flask.py
    ถ้าอยากใช้ env ก็ set GOOGLE_APPLICATION_CREDENTIALS ชี้ไปที่ไฟล์ได้
    """
    if not firebase_admin._apps:
        # ให้ path ตรงกับไฟล์ในโฟลเดอร์ server/
        default_path = os.path.join(os.path.dirname(__file__), "firebase-key.json")
        cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", default_path)
        if not os.path.isabs(cred_path):
            cred_path = os.path.join(os.getcwd(), cred_path)
        if not os.path.exists(cred_path):
            raise FileNotFoundError(
                f"Service account JSON not found: {cred_path}\n"
                "ดาวน์โหลดจาก Firebase Console → Project settings → Service accounts"
            )
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    return firestore.client()

db = _init_firestore()

# ---------- Helpers ----------
def summarize_analyze(out: dict) -> dict:
    """เลือกเฉพาะฟิลด์สรุป เพื่อเก็บลง Firestore ให้สั้นและมีประโยชน์"""
    lines = out.get("lines", {}) or {}

    def pack(name):
        d = lines.get(name) or {}
        return {
            "length_px": d.get("length_px"),
            "branch_style": d.get("branch_style"),
        }

    return {
        "image_w": out.get("image_size", {}).get("width"),
        "image_h": out.get("image_size", {}).get("height"),
        "roi": out.get("roi_bbox_small"),
        "life": pack("life"),
        "head": pack("head"),
        "heart": pack("heart"),
    }

def _read_image_from_request():
    """รองรับทั้ง multipart/form-data (file) และ JSON {image_b64}"""
    print(">> Content-Type:", request.content_type)
    print(">> files keys:", list(request.files.keys()))
    print(">> form keys:", list(request.form.keys()))

    # A) multipart/form-data
    if "file" in request.files:
        fs = request.files["file"]
        raw = fs.read()
        print(">> received file:", fs.filename, fs.mimetype, "bytes:", len(raw))
        arr = np.frombuffer(raw, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img

    # B) JSON base64
    if request.is_json:
        data = request.get_json(silent=True) or {}
        b64 = data.get("image_b64")
        if not b64:
            return None
        arr = np.frombuffer(base64.b64decode(b64), np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img

    return None

def _bint(key, default=0):
    v = request.form.get(key, default)
    try:
        return bool(int(v))
    except Exception:
        return bool(v)

def _fint(key, default=None):
    v = request.form.get(key, default)
    if v in (None, "", "null"):
        return default
    return int(v)

def _ffloat(key, default=None):
    v = request.form.get(key, default)
    if v in (None, "", "null"):
        return default
    return float(v)

# ---------- Endpoints ----------
@app.get("/health")
def health():
    return "ok", 200

@app.post("/analyze")
def analyze_endpoint():
    img = _read_image_from_request()
    if img is None:
        return jsonify({"error": "missing/invalid image"}), 400

    cfg = PipeConfig(
        max_side=_fint("max_side") or PipeConfig.max_side,
        strong_enhance=_bint("strong_enhance", 0),
        clahe_clip=_ffloat("clahe_clip") or PipeConfig.clahe_clip,
        detail_binary=_bint("detail_binary", 0),
        block_size=_fint("block_size") or PipeConfig.block_size,
        C=_fint("C") or PipeConfig.C,
        close_itr=_fint("close_itr") or PipeConfig.close_itr,
        open_itr=_fint("open_itr") or PipeConfig.open_itr,
        use_frangi=_bint("use_frangi", 0),
        frangi_thresh=_ffloat("frangi_thresh") or PipeConfig.frangi_thresh,
        rect_skeleton_kernel=_bint("rect_skeleton_kernel", 0),
        min_component_pixels=_fint("min_component_pixels") or PipeConfig.min_component_pixels,
        prune_spur_iter=_fint("prune_spur_iter") or PipeConfig.prune_spur_iter,
        show_hand=_bint("show_hand", 1),
        hand_refine=request.form.get("hand_refine", PipeConfig.hand_refine),
        hand_alpha=_ffloat("hand_alpha") or PipeConfig.hand_alpha,
    )

    out = analyze(img, outdir="debug_out", Cfg=cfg)
    if isinstance(out, dict) and out.get("error"):
        return jsonify(out), 422
    return jsonify(out), 200

@app.post("/scan/save")
def scan_save():
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400

    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id") or "anonymous"
    analyze_result = data.get("analyze_result")
    

    if not isinstance(analyze_result, dict):
        return jsonify({"error": "analyze_result (object) is required"}), 400

    doc = {
        "user_id": user_id,
        "summary": summarize_analyze(analyze_result),
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    ref = db.collection("scans").add(doc)
    return jsonify({"id": ref[1].id}), 201

@app.get("/scan/list")
def scan_list():
    limit = int(request.args.get("limit", 20))
    user_id = request.args.get("user_id")

    q = db.collection("scans")
    if user_id:
        q = q.where("user_id", "==", user_id)
    q = q.order_by("createdAt", direction=firestore.Query.DESCENDING).limit(limit)

    items = []
    for d in q.stream():
        obj = d.to_dict()
        obj["id"] = d.id
        items.append(obj)
    return jsonify(items), 200

# ---------- Run ----------
if __name__ == "__main__":
    # แนะนำ debug=True ตอนพัฒนา, ปิด auto-reload กันรีสตาร์ทกลางคำขอ
    app.run(host="0.0.0.0", port=8000, debug=True, use_reloader=False)
