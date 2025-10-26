# server/serve_flask.py
import os
import base64
import numpy as np
import cv2
from flask import Flask, request, jsonify
from flask_cors import CORS

# นำเข้าฟังก์ชัน/คอนฟิกจาก server/python.py (ต้องมี analyze, PipeConfig)
from python import analyze, PipeConfig

app = Flask(__name__)
CORS(app)

# ปรับลิมิตขนาดอัปโหลด (ปรับตามต้องการ)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB

@app.get("/health")
def health():
    return "ok", 200

@app.route("/analyze", methods=["POST"])
def analyze_endpoint():
    # ------- Debug logs --------
    print(">> Content-Type:", request.content_type)
    print(">> files keys:", list(request.files.keys()))
    print(">> form keys:", list(request.form.keys()))

    img = None

    # ----- A) รองรับ multipart/form-data (Postman/Expo) -----
    if "file" in request.files:
        fs = request.files["file"]
        raw = fs.read()
        print(">> received file:", fs.filename, fs.mimetype, "bytes:", len(raw))
        arr = np.frombuffer(raw, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            print("!! cv2.imdecode returned None for multipart file")

    # ----- B) รองรับ raw JSON: { "image_b64": "<base64>" } -----
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

    # ---------- อ่านพารามิเตอร์ (optional) จาก form ----------
    def bint(k, default=0):  # 0/1 -> bool
        v = request.form.get(k, default)
        try:
            return bool(int(v))
        except Exception:
            return bool(v)

    def fint(k, default=None):
        v = request.form.get(k, default)
        if v in (None, "", "null"):
            return default
        return int(v)

    def ffloat(k, default=None):
        v = request.form.get(k, default)
        if v in (None, "", "null"):
            return default
        return float(v)

    cfg = PipeConfig(
        max_side=fint("max_side") or PipeConfig.max_side,
        strong_enhance=bint("strong_enhance", 0),
        clahe_clip=ffloat("clahe_clip") or PipeConfig.clahe_clip,
        detail_binary=bint("detail_binary", 0),
        block_size=fint("block_size") or PipeConfig.block_size,
        C=fint("C") or PipeConfig.C,
        close_itr=fint("close_itr") or PipeConfig.close_itr,
        open_itr=fint("open_itr") or PipeConfig.open_itr,
        use_frangi=bint("use_frangi", 0),
        frangi_thresh=ffloat("frangi_thresh") or PipeConfig.frangi_thresh,
        rect_skeleton_kernel=bint("rect_skeleton_kernel", 0),
        min_component_pixels=fint("min_component_pixels") or PipeConfig.min_component_pixels,
        prune_spur_iter=fint("prune_spur_iter") or PipeConfig.prune_spur_iter,
        show_hand=bint("show_hand", 1),
        hand_refine=request.form.get("hand_refine", PipeConfig.hand_refine),
        hand_alpha=ffloat("hand_alpha") or PipeConfig.hand_alpha,
    )

    # ---------- เรียก pipeline ----------
    out = analyze(img, outdir="debug_out", Cfg=cfg)

    # ถ้าตรวจไม่พบมือ/มีข้อผิดพลาดจาก pipeline
    if isinstance(out, dict) and out.get("error"):
        return jsonify(out), 422

    return jsonify(out)

if __name__ == "__main__":
    # ปิด auto-reloader กันรีสตาร์ทกลางคำขอ (หลบ ECONNRESET)
    app.run(host="0.0.0.0", port=8000, debug=True, use_reloader=False)
    # หากยังมีปัญหา ให้ลอง debug=False:
    # app.run(host="0.0.0.0", port=8000, debug=False)
