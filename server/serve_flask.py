# server/serve_flask.py
import os
import base64
from datetime import datetime, timezone
import numpy as np
import cv2
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from python import analyze, PipeConfig

import firebase_admin
from firebase_admin import credentials, firestore

app = Flask(__name__)
@app.get("/routes")
def routes():
    return {"routes": sorted([r.rule for r in app.url_map.iter_rules()])}, 200

print("SERVE FILE:", __file__)
CORS(app)
DEEPSEEK_BASE = "https://api.deepseek.com"
DEEPSEEK_KEY = os.getenv("DEEPSEEK_API_KEY", "")
# ---------- Firebase init ----------
# ใช้ env GOOGLE_APPLICATION_CREDENTIALS ถ้ามี, ไม่ก็ไฟล์ firebase-key.json ในโฟลเดอร์นี้
_cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or os.path.join(os.path.dirname(__file__), "firebase-key.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(_cred_path)
    firebase_admin.initialize_app(cred)
db = firestore.client()

app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB


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

@app.get("/health")
def health():
    return "ok", 200

@app.post("/analyze")
def analyze_endpoint():
    # Debug logs
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
    user_id = data.get("user_id") or "anonymous"
    do_save = bool(data.get("save", True))

    try:
        r = requests.post(
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
            timeout=60,
        )
    except requests.RequestException as e:
        return jsonify({"error": f"request_failed: {str(e)}"}), 502

    if not r.ok:
        # ส่งข้อความ error กลับไปให้เห็นชัด ๆ
        try:
            return jsonify(r.json()), r.status_code
        except Exception:
            return jsonify({"error": r.text}), r.status_code

    resp = r.json()

    # เซฟผล (เฉพาะสรุปหลัก ๆ) ลง Firestore
    saved_id = None
    if do_save:
        try:
            # เก็บทั้ง prompt และ answer แบบสั้น ๆ
            completion = (resp.get("choices") or [{}])[0].get("message", {})
            doc = {
                "user_id": user_id,
                "provider": "deepseek",
                "model": model,
                "prompt_last": messages[-1] if messages else None,
                "answer": completion,
                "raw": resp,                   # ถ้ากังวลขนาด เก็บเฉพาะ answer ก็พอ
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
            ref = db.collection("ai_chats").add(doc)
            saved_id = ref[1].id
        except Exception as e:
            # ไม่ให้ 500 เพราะ inference สำเร็จแล้ว แค่บันทึกล้มเหลว
            resp["_save_error"] = str(e)

    return jsonify({"data": resp, "saved_id": saved_id}), 200

# ---------- ทำนายดวงจากสแกนที่บันทึกไว้ ----------
@app.post("/fortune/predict")
def fortune_predict():
    
    if not DEEPSEEK_KEY:
        return jsonify({"error": "DEEPSEEK_API_KEY is missing"}), 500
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400

    data = request.get_json(silent=True) or {}
    scan_id = data.get("scan_id")
    summary = data.get("summary") 
    user_id = data.get("user_id") or "anonymous"
    model = data.get("model") or "deepseek-chat"
    language = (data.get("language") or "th").lower()
    style = (data.get("style") or "friendly").lower()

    if not summary and scan_id:
        d = db.collection("scans").document(scan_id).get()
        if not d.exists:
            return jsonify({"error": f"scan_id '{scan_id}' not found"}), 404
        summary = d.to_dict().get("summary") or {}

    if not isinstance(summary, dict) or not summary:
        return jsonify({"error": "summary is required (either via scan_id or in body)"}), 400

    sys_th = (
        "คุณคือผู้ช่วยโหราศาสตร์ลายมือ เชี่ยวชาญการอ่านเส้นชีวิต/เส้นสมอง/เส้นหัวใจ "
        "ตอบอย่างระมัดระวัง ไม่อ้างอิงเรื่องรักษาโรคหรือการเงินแบบชี้นำลงทุน "
        "ให้คำแนะนำเชิงบวกและนำไปใช้ได้จริงในชีวิตประจำวัน"
    )
    sys_en = (
        "You are a palmistry assistant. You analyze life/head/heart lines with care, "
        "avoid medical or financial advice, and provide practical, positive guidance."
    )
    system_prompt = sys_th if language == "th" else sys_en

    def line_desc(name):
        d = (summary.get(name) or {})
        return f"{name}: length_px={d.get('length_px')}, branch_style={d.get('branch_style')}"

    user_prompt_th = (
        f"ช่วยทำนายดวงจากลายมือโดยอิงข้อมูลสรุปนี้:\n"
        f"- {line_desc('life')}\n- {line_desc('head')}\n- {line_desc('heart')}\n"
        f"ขนาดภาพ: {summary.get('image_w')}x{summary.get('image_h')}, "
        f"roi={summary.get('roi')}\n"
        f"รูปแบบคำตอบ: bullet สั้นๆ 3-5 ข้อ + ย่อหน้าสรุป และข้อควรระวัง 1-2 ข้อ\n"
        f"โทน: {'เป็นกันเอง' if style=='friendly' else 'เป็นทางการ'}"
    )
    user_prompt_en = (
        f"Please read the palm based on this summary:\n"
        f"- {line_desc('life')}\n- {line_desc('head')}\n- {line_desc('heart')}\n"
        f"image: {summary.get('image_w')}x{summary.get('image_h')}, "
        f"roi={summary.get('roi')}\n"
        f"Return 3-5 concise bullets + a brief paragraph and 1-2 caveats.\n"
        f"Tone: {'friendly' if style=='friendly' else 'formal'}"
    )
    user_prompt = user_prompt_th if language == "th" else user_prompt_en

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "stream": False
    }

    try:
        r = requests.post(
            f"{DEEPSEEK_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {DEEPSEEK_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
        )
    except requests.RequestException as e:
        return jsonify({"error": f"request_failed: {str(e)}"}), 502

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
        "answer": answer,
        "raw": resp,  # ถ้าห่วงขนาด เก็บเฉพาะ answer ก็พอ
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    ref = db.collection("fortunes").add(doc)
    return jsonify({"fortune_id": ref[1].id, "answer": answer}), 201

print("DEEPSEEK_API_KEY:", os.getenv("DEEPSEEK_API_KEY"))
if __name__ == "__main__":
    # use_reloader=False กันรีสตาร์ทกลางคำขอ
    app.run(host="0.0.0.0", port=8000, debug=True, use_reloader=False)
