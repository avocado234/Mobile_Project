// components/api/analyze.ts
import { BASE_URL } from "../../utils/constants";

export type AnalyzeResult = {
  image_size?: { width: number; height: number };
  roi_bbox_small?: { x: number; y: number; w: number; h: number };
  lines?: any;
  hand?: any;
  roi_binary_png_b64?: string;
  roi_skeleton_png_b64?: string;
  roi_binary_rle?: any;
  finger_length_ratio_to_hand?: any;
  error?: string;
};

/**
 * วิเคราะห์ภาพด้วย Flask /analyze
 * - มี AbortController กัน timeout
 * - ใส่พารามิเตอร์ default แบบเบาเครื่อง (ลดโอกาส timeout)
 */
export async function analyzeImage(
  uri: string,
  extra: Record<string, string | number | boolean> = {},
  timeoutMs = 60000
) {
  const form = new FormData();

  // NOTE: ใน Expo/React Native ให้ส่งไฟล์แบบ object ดังนี้
  form.append(
    "file",
    {
      uri,
      name: "hand.jpg",
      type: "image/jpeg",
    } as any
  );

  // ค่าเริ่มต้นแบบ "เบาเครื่อง" (จะ override ด้วย extra ได้)
  const defaults: Record<string, any> = {
    max_side: 900,
    strong_enhance: 0,
    detail_binary: 0,
    rect_skeleton_kernel: 0,
    min_component_pixels: 25,
    prune_spur_iter: 2,
    show_hand: 0,            // ปิด overlay มือเพื่อลดงาน
    hand_refine: "grabcut",
    hand_alpha: 0.4,
  };

  const payload = { ...defaults, ...extra };
  Object.entries(payload).forEach(([k, v]) => form.append(k, String(v)));

  // ---- Timeout ด้วย AbortController ----
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const resp = await fetch(`${BASE_URL}/analyze`, {
      method: "POST",
      body: form,
      signal: ctrl.signal,
    });

    let json: AnalyzeResult | any = {};
    try {
      json = await resp.json();
    } catch {
      throw new Error(`Bad response (${resp.status})`);
    }

    if (!resp.ok) {
      // ดึงข้อความ error ที่เซิร์ฟเวอร์ส่งมา เพื่อดีบั๊กง่าย
      throw new Error(json?.detail || json?.error || `HTTP ${resp.status}`);
    }

    return json as AnalyzeResult;
  } finally {
    clearTimeout(timer);
  }
}
