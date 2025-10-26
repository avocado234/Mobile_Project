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

export async function analyzeImage(uri: string, extra: Record<string, string | number | boolean> = {}) {
  const form = new FormData();
  form.append("file", {
    uri,
    name: "hand.jpg",
    type: "image/jpeg",
  } as any);

  // ใส่พารามิเตอร์ที่คุณอยากเปิดเป็นค่าเริ่มต้นให้ pipeline
  const defaults = {
    strong_enhance: 1,
    detail_binary: 1,
    rect_skeleton_kernel: 1,
    min_component_pixels: 1,
    prune_spur_iter: 3,
    show_hand: 1,
    hand_refine: "grabcut",
    hand_alpha: 0.5,
  } as Record<string, any>;

  const payload = { ...defaults, ...extra };
  Object.entries(payload).forEach(([k, v]) => form.append(k, String(v)));

  // หมายเหตุ: บน React Native/Expo ไม่ต้องตั้ง Content-Type เอง ให้ระบบเซ็ต boundary ให้
  const resp = await fetch(`${BASE_URL}/analyze`, {
    method: "POST",
    body: form,
  });

  let json: AnalyzeResult | any = {};
  try {
    json = await resp.json();
  } catch {
    throw new Error(`Bad response (${resp.status})`);
  }

  if (!resp.ok) {
    throw new Error((json && (json.detail || json.error)) || `HTTP ${resp.status}`);
  }

  return json as AnalyzeResult;
}
