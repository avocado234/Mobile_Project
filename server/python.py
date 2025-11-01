import os, io, json, base64, math, heapq, collections, pathlib
from dataclasses import dataclass
from typing import List, Tuple, Dict, Any, Optional

import cv2
import numpy as np
from PIL import Image

# --- ทำให้ mediapipe เป็น optional: ถ้าไม่มีจะยังรันได้แต่จะคืน error ชัดเจน ---
try:
    import mediapipe as mp
    mp_hands = mp.solutions.hands
except Exception:
    mp = None
    mp_hands = None

# ================= Tunables (ค่าเริ่มต้น ปรับให้ “รันเฉยๆ” เหมือนที่คุณใช้บ่อย) =================
MAX_SIDE_DEFAULT = 1400
CLAHE_CLIP_DEFAULT = 3.0
BLACKHAT_K_DEFAULT = 15
OPEN_ITR_DEFAULT, CLOSE_ITR_DEFAULT = 1, 2
MIN_COMPONENT_PIXELS_DEFAULT = 1           # เดิม 60 -> ให้เห็นเส้นเล็กๆ ตามที่ใช้งาน
PRUNE_SPUR_ITER_DEFAULT = 3                # เดิม 8 -> ตามค่าที่คุณรันบ่อย

# ---- OpenCV constants (safe/fallback) ----
ADAPTIVE_GAUSS = getattr(cv2, "ADAPTIVE_THRESH_GAUSSIAN_C", 1)
ADAPTIVE_MEAN  = getattr(cv2, "ADAPTIVE_THRESH_MEAN_C", 0)

cv2.setNumThreads(max(1, int(os.getenv("OPENCV_THREADS", "0"))))

# ================= Config =================
@dataclass
class PipeConfig:
    # scale
    max_side: int = MAX_SIDE_DEFAULT
    # enhance
    strong_enhance: bool = True            # เดิม False -> True
    clahe_clip: float = CLAHE_CLIP_DEFAULT
    # binary
    detail_binary: bool = True             # เดิม False -> True
    block_size: int = 31
    C: int = 8
    close_itr: int = CLOSE_ITR_DEFAULT
    open_itr: int = OPEN_ITR_DEFAULT
    # frangi alternative
    use_frangi: bool = False
    frangi_sigmas: Tuple[int, ...] = (2,3,4,5)
    frangi_thresh: float = 0.05
    # skeleton
    rect_skeleton_kernel: bool = True      # เดิม False -> True
    # pruning
    min_component_pixels: int = MIN_COMPONENT_PIXELS_DEFAULT
    prune_spur_iter: int = PRUNE_SPUR_ITER_DEFAULT
    # show hand (segmentation)
    show_hand: bool = True
    hand_refine: str = "grabcut"           # "none"|"morph"|"skin"|"grabcut"
    hand_alpha: float = 0.5                # เดิม 0.35 -> 0.5

# ================= Utils =================
def _np_from_path(path: str) -> np.ndarray:
    img = cv2.imread(path)
    if img is None:
        raise FileNotFoundError(f"Cannot read image at '{path}'. Make sure the file exists and is an image.")
    return img

def _resize_keep_ratio(img: np.ndarray, max_side: int) -> Tuple[np.ndarray, float]:
    h, w = img.shape[:2]
    side = max(h, w)
    if side <= max_side: return img, 1.0
    scale = max_side / side
    r = cv2.resize(img, (int(w*scale), int(h*scale)), interpolation=cv2.INTER_AREA)
    return r, 1.0/scale

def _euclid(a,b): return float(np.hypot(a[0]-b[0], a[1]-b[1]))

def _png_b64(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".png", img)
    if not ok: raise RuntimeError("PNG encode failed")
    return base64.b64encode(buf).decode("ascii")

def _binary_to_rle(binary: np.ndarray) -> Dict[str, Any]:
    """RLE แบบง่าย: แถวหลัก (row-major), เก็บ counts และ start value (0/255)"""
    h, w = binary.shape[:2]
    flat = binary.reshape(-1)
    if flat.size == 0:
        return {"height": int(h), "width": int(w), "start": 0, "counts": []}
    run_val = int(flat[0])
    run_len = 1
    counts = []
    for v in flat[1:]:
        v = int(v)
        if v == run_val:
            run_len += 1
        else:
            counts.append(run_len)
            run_val = v
            run_len = 1
    counts.append(run_len)
    # บางระบบชอบเก็บเป็น 0/1 มากกว่า 0/255 เรา normalize ให้เป็น 0/1 ด้วย
    return {"height": int(h), "width": int(w), "start": 1 if int(flat[0])>0 else 0, "counts": counts}

# ================= Hand ROI / Landmarks =================
def detect_landmarks(img_bgr):
    """
    คืนพิกัดแลนด์มาร์คมือเป็น list[(x, y)] ถ้าหาไม่เจอหรือ mediapipe มีปัญหา -> คืน None
    """
    if img_bgr is None or img_bgr.size == 0:
        return None

    h, w = img_bgr.shape[:2]

    # กัน import mediapipe ล้ม (เช่น protobuf mismatch)
    try:
        import mediapipe as mp
    except Exception:
        return None

    try:
        rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    except Exception:
        return None

    try:
        with mp.solutions.hands.Hands(
            static_image_mode=True,
            max_num_hands=1,
            model_complexity=0,            # เร็วขึ้น
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        ) as hands:
            res = hands.process(rgb)

        if not res or not getattr(res, "multi_hand_landmarks", None):
            return None

        lm0 = res.multi_hand_landmarks[0].landmark
        pts = [(int(lm.x * w), int(lm.y * h)) for lm in lm0]
        return pts
    except Exception:
        return None


def hand_mask_from_landmarks(img_bgr: np.ndarray, land: List[Tuple[int,int]]) -> np.ndarray:
    h, w = img_bgr.shape[:2]
    pts = np.array(land, np.int32)
    hull = cv2.convexHull(pts)
    mask = np.zeros((h, w), np.uint8)
    cv2.fillConvexPoly(mask, hull, 255)
    mask = cv2.morphologyEx(mask, cv2.MORPH_DILATE,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(21,21)))
    return mask

# ================= Hand Segmentation helpers =================
def refine_mask_morph(mask: np.ndarray) -> np.ndarray:
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9,9))
    m = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=2)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN,  k, iterations=1)
    return m

def refine_mask_skin(img_bgr: np.ndarray, coarse_mask: np.ndarray) -> np.ndarray:
    ycrcb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2YCrCb)
    skin = cv2.inRange(ycrcb, (0,133,77), (255,173,127))
    m = cv2.bitwise_and(skin, skin, mask=coarse_mask)
    return refine_mask_morph(m)

def refine_mask_grabcut(img_bgr: np.ndarray, coarse_mask: np.ndarray) -> np.ndarray:
    h,w = coarse_mask.shape
    if h==0 or w==0: return coarse_mask
    bgdModel = np.zeros((1,65), np.float64)
    fgdModel = np.zeros((1,65), np.float64)
    x,y,w0,h0 = cv2.boundingRect(coarse_mask)
    rect = (max(0,x-10), max(0,y-10), min(w-1, w0+20), min(h-1, h0+20))
    gc_mask = np.full((h,w), cv2.GC_BGD, np.uint8)
    gc_mask[coarse_mask>0] = cv2.GC_PR_FGD
    try:
        cv2.grabCut(img_bgr, gc_mask, rect, bgdModel, fgdModel, 3, cv2.GC_INIT_WITH_MASK)
        m = np.where((gc_mask==cv2.GC_FGD)|(gc_mask==cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    except Exception:
        m = coarse_mask.copy()
    return refine_mask_morph(m)

def overlay_region(full_bgr: np.ndarray, mask: np.ndarray,
                   fill_color=(0,255,255), edge_color=(0,128,255),
                   alpha_fill=0.35, edge_thick=3) -> np.ndarray:
    out = full_bgr.copy()
    if out.ndim==2: out = cv2.cvtColor(out, cv2.COLOR_GRAY2BGR)
    fill = np.zeros_like(out); fill[:] = fill_color
    out = np.where(mask[...,None]>0,
                   (alpha_fill*fill + (1-alpha_fill)*out).astype(np.uint8),
                   out)
    cnts,_ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(out, cnts, -1, edge_color, edge_thick, cv2.LINE_AA)
    return out

def contour_features(mask: np.ndarray):
    cnts,_ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts: return None
    c = max(cnts, key=cv2.contourArea)
    area = float(cv2.contourArea(c))
    peri  = float(cv2.arcLength(c, True))
    eps = 0.005*peri
    approx = cv2.approxPolyDP(c, eps, True)
    poly = [(int(p[0][0]), int(p[0][1])) for p in approx]
    x,y,w,h = cv2.boundingRect(c)
    bbox = {"x":int(x), "y":int(y), "w":int(w), "h":int(h)}
    return {"area_px":area, "perimeter_px":peri, "polygon_px":poly, "bbox":bbox}

# ========== Enhance ==========
def enhance(gray: np.ndarray, Cfg: PipeConfig) -> np.ndarray:
    clahe = cv2.createCLAHE(Cfg.clahe_clip, (8,8))
    g = clahe.apply(gray)
    if Cfg.strong_enhance:
        g = cv2.bilateralFilter(g, 7, 55, 55)
        g = cv2.convertScaleAbs(g, alpha=1.8, beta=10)
    else:
        g = cv2.bilateralFilter(g, 9, 75, 75)
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (BLACKHAT_K_DEFAULT, BLACKHAT_K_DEFAULT))
    g = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, k)
    if Cfg.strong_enhance:
        g = cv2.convertScaleAbs(g, alpha=1.6, beta=8)
    return g

# ========== Binary (adaptive / frangi) ==========
def to_binary(gray_enh: np.ndarray, Cfg: PipeConfig) -> np.ndarray:
    if gray_enh.dtype != np.uint8:
        gray_enh = cv2.normalize(gray_enh, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    if Cfg.use_frangi:
        try:
            from skimage.filters import frangi
        except Exception as e:
            raise RuntimeError("use_frangi = True แต่ไม่พบ skimage.filters.frangi") from e
        resp = frangi(gray_enh.astype(np.float32)/255.0, sigmas=Cfg.frangi_sigmas)
        binary = (resp > Cfg.frangi_thresh).astype(np.uint8) * 255
    else:
        block = 21 if Cfg.detail_binary else Cfg.block_size
        block = max(3, block if block % 2 == 1 else block + 1)
        C     = 6  if Cfg.detail_binary else Cfg.C
        method = ADAPTIVE_GAUSS if hasattr(cv2, "ADAPTIVE_THRESH_GAUSSIAN_C") else ADAPTIVE_MEAN
        binary = cv2.adaptiveThreshold(gray_enh, 255, method, cv2.THRESH_BINARY_INV, block, C)
    kernel = np.ones((3,3), np.uint8)
    close_itr = 1 if Cfg.detail_binary else Cfg.close_itr
    open_itr  = 1 if Cfg.detail_binary else Cfg.open_itr
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=close_itr)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN,  kernel, iterations=open_itr)
    return binary

# ========== Skeletonization ==========
def skeletonize_morph(binary: np.ndarray, Cfg: PipeConfig) -> np.ndarray:
    img = (binary>0).astype(np.uint8)*255
    if cv2.countNonZero(img) == 0:
        return np.zeros_like(img)
    skel = np.zeros_like(img, np.uint8)
    kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT if Cfg.rect_skeleton_kernel else cv2.MORPH_CROSS, (3,3)
    )
    while True:
        eroded = cv2.erode(img, kernel)
        temp = cv2.dilate(eroded, kernel)
        temp = cv2.subtract(img, temp)
        skel = cv2.bitwise_or(skel, temp)
        img = eroded.copy()
        if cv2.countNonZero(img) == 0: break
    return skel

def remove_small_components(skel255: np.ndarray, min_pixels: int) -> np.ndarray:
    S = (skel255>0).astype(np.uint8)
    if S.sum()==0: return skel255
    num, labels = cv2.connectedComponents(S, connectivity=8)
    keep = np.zeros_like(S)
    for i in range(1, num):
        if (labels==i).sum() >= min_pixels:
            keep[labels==i] = 1   # fixed typo
    return (keep*255).astype(np.uint8)

def prune_spurs(skel255: np.ndarray, iterations: int) -> np.ndarray:
    S = (skel255>0).astype(np.uint8)
    if S.sum()==0: return skel255
    k = np.array([[1,1,1],[1,10,1],[1,1,1]], np.uint8)
    for _ in range(max(0, iterations)):
        conv = cv2.filter2D(S, -1, k)
        deg  = conv - (S*10)
        endpoints = ((S>0) & (deg==1)).astype(np.uint8)
        if endpoints.sum()==0: break
        S[endpoints>0] = 0
    return (S*255).astype(np.uint8)

# ================= Zones (บน ROI) =================
def zone_masks_on_roi(w:int, h:int) -> Dict[str,np.ndarray]:
    z={}
    life = np.zeros((h,w), np.uint8)
    cx = int(0.30*w); cy = int(0.60*h)
    cv2.ellipse(life, (cx,cy), (int(0.45*w), int(0.55*h)), 15, 10, 270, 255, -1)
    life = cv2.morphologyEx(life, cv2.MORPH_CLOSE,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(15,15)))
    z["life"] = life
    head = np.zeros((h,w), np.uint8); head[int(0.45*h):int(0.65*h), :] = 255
    z["head"] = head
    heart = np.zeros((h,w), np.uint8); heart[:int(0.42*h), :] = 255
    z["heart"] = heart
    return z

# ========== Skeleton graph & metrics ==========
def neighbors_mask(S: np.ndarray):
    k = np.array([[1,1,1],[1,10,1],[1,1,1]], np.uint8)
    return cv2.filter2D(S, -1, k) - (S*10)

def endpoints_from_skel(S: np.ndarray) -> List[Tuple[int,int]]:
    deg = neighbors_mask(S)
    ys,xs = np.where((S>0) & (deg==1))
    return list(zip(xs,ys))

def longest_path_in_zone(skel: np.ndarray, zone: np.ndarray) -> List[Tuple[int,int]]:
    S = ((skel>0) & (zone>0)).astype(np.uint8)
    if S.sum()==0: return []
    H,W = S.shape
    def idx(x,y): return y*W+x
    nbrs=[(-1,-1),(0,-1),(1,-1),(-1,0),(1,0),(-1,1),(0,1),(1,1)]
    graph={}
    ys,xs = np.where(S>0)
    for (x,y) in zip(xs,ys):
        u=idx(x,y); adj=[]
        for dx,dy in nbrs:
            xx,yy=x+dx,y+dy
            if 0<=xx<W and 0<=yy<H and S[yy,xx]>0:
                w=1.0 if dx==0 or dy==0 else math.sqrt(2)
                adj.append((idx(xx,yy), w))
        if adj: graph[u]=adj
    ends = [(x,y) for (x,y) in endpoints_from_skel(S)]
    if len(ends)<2: ends = list(zip(xs,ys))[:120]
    best=-1.0; best_pair=None; best_parent=None; best_src=None
    import heapq
    for (sx,sy) in (ends if len(ends)<=80 else ends[:80]):
        s=idx(sx,sy)
        dist=collections.defaultdict(lambda: float('inf')); parent={}
        dist[s]=0.0; pq=[(0.0,s)]
        while pq:
            d,u=heapq.heappop(pq)
            if d!=dist[u]: continue
            for v,w in graph.get(u,[]):
                nd=d+w
                if nd<dist[v]:
                    dist[v]=nd; parent[v]=u; heapq.heappush(pq,(nd,v))
        for (tx,ty) in ends:
            t=idx(tx,ty)
            if dist[t]<float('inf') and dist[t]>best:
                best=dist[t]; best_pair=((sx,sy),(tx,ty)); best_parent=parent; best_src=s
    if best_pair is None: return []
    dst = best_pair[1][1]*W + best_pair[1][0]
    path=[dst]
    while path[-1]!=best_src and path[-1] in best_parent:
        path.append(best_parent[path[-1]])
    path.reverse()
    return [(p%W, p//W) for p in path]

def path_length(path: List[Tuple[int,int]]) -> float:
    if len(path)<2: return 0.0
    return float(sum(_euclid(path[i], path[i+1]) for i in range(len(path)-1)))

def curvature_score(path: List[Tuple[int,int]]) -> float:
    if len(path)<3: return 0.0
    def ang(a,b,c):
        v1=(b[0]-a[0], b[1]-a[1]); v2=(c[0]-b[0], c[1]-b[1])
        n1=np.hypot(*v1); n2=np.hypot(*v2)
        if n1==0 or n2==0: return 0.0
        cs=(v1[0]*v2[0]+v1[1]*v2[1])/(n1*n2); cs=max(-1,min(1,cs))
        return math.degrees(math.acos(cs))
    return float(np.mean([ang(path[i-1],path[i],path[i+1]) for i in range(1,len(path)-1)]))

def thickness_on_path(path: List[Tuple[int,int]], binary: np.ndarray) -> float:
    if binary.size == 0: return 0.0
    dt = cv2.distanceTransform((binary>0).astype(np.uint8), cv2.DIST_L2, 3)
    vals=[float(dt[y,x]) for (x,y) in path if 0<=x<dt.shape[1] and 0<=y<dt.shape[0]]
    return 2.0*(np.mean(vals) if vals else 0.0)

def intensity_on_path(path: List[Tuple[int,int]], gray_enh: np.ndarray) -> float:
    vals=[float(gray_enh[y,x]) for (x,y) in path if 0<=x<gray_enh.shape[1] and 0<=y<gray_enh.shape[0]]
    return float(np.mean(vals) if vals else 0.0)

def branch_points_on_path(path: List[Tuple[int,int]], skel: np.ndarray) -> int:
    S=(skel>0).astype(np.uint8)
    if S.sum()==0: return 0
    deg = neighbors_mask(S)
    cnt=0
    for (x,y) in path:
        if 0<=x<S.shape[1] and 0<=y<S.shape[0] and deg[y,x]>=3: cnt+=1
    return int(cnt)

# ================= CORE =================
def analyze(img_bgr: np.ndarray, outdir="debug_out", Cfg: PipeConfig = PipeConfig()) -> Dict[str,Any]:
    if img_bgr is None or img_bgr.size == 0:
        return {"error": "Invalid image."}

    small, inv_scale = _resize_keep_ratio(img_bgr, Cfg.max_side)

    land = detect_landmarks(small)
    if land is None:
        return {"error":"Hand not detected (or mediapipe not installed). Use a clear palm-up photo or install mediapipe."}

    # ROI robust
    mask_full = hand_mask_from_landmarks(small, land)
    x,y,w,h = cv2.boundingRect(mask_full)
    gray_full = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

    gray_roi = gray_full[y:y+h, x:x+w].copy()
    roi_mask = mask_full[y:y+h, x:x+w]
    if cv2.countNonZero(roi_mask) < (roi_mask.size // 10):
        roi_mask = cv2.bitwise_not(roi_mask)
    gray_roi = cv2.bitwise_and(gray_roi, gray_roi, mask=roi_mask)

    # ===== Hand (whole-hand) segmentation & overlay =====
    hand_json = None
    if Cfg.show_hand:
        coarse = mask_full.copy()
        if Cfg.hand_refine == "none":
            hand = refine_mask_morph(coarse)
        elif Cfg.hand_refine == "morph":
            hand = refine_mask_morph(coarse)
        elif Cfg.hand_refine == "skin":
            hand = refine_mask_skin(small, coarse)
        else:
            hand = refine_mask_grabcut(small, coarse)
        hand_overlay = overlay_region(small, hand,
                                      fill_color=(0,255,255),
                                      edge_color=(0,128,255),
                                      alpha_fill=float(Cfg.hand_alpha),
                                      edge_thick=3)
        os.makedirs(outdir, exist_ok=True)
        cv2.imwrite(os.path.join(outdir, "hand_mask.png"), hand)
        cv2.imwrite(os.path.join(outdir, "hand_overlay.png"), hand_overlay)
        feats = contour_features(hand)
        if feats:
            hand_json = {
                "area_px": feats["area_px"],
                "perimeter_px": feats["perimeter_px"],
                "bbox_small": feats["bbox"],
                "polygon_small": feats["polygon_px"]
            }

    # ===== Pipeline: enhance → binary → skeleton =====
    enh = enhance(gray_roi, Cfg)
    binary = to_binary(enh, Cfg)
    skel = skeletonize_morph(binary, Cfg)
    skel = remove_small_components(skel, Cfg.min_component_pixels)
    skel = prune_spurs(skel, Cfg.prune_spur_iter)

    # ===== Zones บน ROI =====
    masks = zone_masks_on_roi(w, h)

    # ===== Metrics ต่อเส้น =====
    lines={}
    for name, z in masks.items():
        path = longest_path_in_zone(skel, z)
        length_px = path_length(path) * inv_scale
        start_end=None
        if len(path)>=2:
            p0 = (int((path[0][0]+x)*inv_scale),   int((path[0][1]+y)*inv_scale))
            p1 = (int((path[-1][0]+x)*inv_scale), int((path[-1][1]+y)*inv_scale))
            start_end={"start":{"x":p0[0],"y":p0[1]}, "end":{"x":p1[0],"y":p1[1]}}
        thick_px = thickness_on_path(path, binary) * inv_scale
        inten = intensity_on_path(path, enh)
        branch = branch_points_on_path(path, skel)
        curve = curvature_score(path)
        style = "curved" if curve>=15 else "forked" if branch>=2 else "straight"
        lines[name]={
            "start_end_px": start_end,
            "length_px": length_px,
            "thickness_px": thick_px,
            "intensity_mean": inten,
            "branch_points": branch,
            "branch_style": style
        }

    # ===== Debug outputs =====
    os.makedirs(outdir, exist_ok=True)
    cv2.imwrite(os.path.join(outdir,"roi_enh.png"), enh)
    cv2.imwrite(os.path.join(outdir,"roi_binary.png"), binary)
    cv2.imwrite(os.path.join(outdir,"roi_skeleton.png"), skel)

    # overlay เขียวบน full image (กันเคสภาพเป็น gray)
    overlay = small.copy()
    if overlay.ndim == 2:
        overlay = cv2.cvtColor(overlay, cv2.COLOR_GRAY2BGR)
    roi_green = overlay[y:y+h, x:x+w].copy()
    ch1 = 1  # ใช้ช่องสีเขียว
    roi_green[..., ch1] = np.maximum(
        roi_green[..., ch1],
        (skel>0).astype(np.uint8)*255
    )
    overlay[y:y+h, x:x+w] = roi_green
    cv2.imwrite(os.path.join(outdir,"overlay_full.png"), overlay)

    # base64 + RLE
    roi_binary_png_b64 = _png_b64(binary)
    roi_skeleton_png_b64 = _png_b64(skel)
    roi_binary_rle = _binary_to_rle(binary)

    # ===== Return JSON =====
    return {
        "image_size": {"width": img_bgr.shape[1], "height": img_bgr.shape[0]},
        "roi_bbox_small": {"x": x, "y": y, "w": w, "h": h},
        "lines": lines,
        "finger_length_ratio_to_hand": _finger_ratios([(int(px*inv_scale), int(py*inv_scale)) for (px,py) in land]),
        "roi_binary_png_b64": roi_binary_png_b64,
        "roi_skeleton_png_b64": roi_skeleton_png_b64,
        "roi_binary_rle": roi_binary_rle,
        "hand": hand_json
    }

def _finger_ratios(land_full: List[Tuple[int,int]]) -> Dict[str,float]:
    L=lambda i: land_full[i]
    wrist=L(0)
    mcp = { "thumb":L(1), "index":L(5), "middle":L(9), "ring":L(13), "pinky":L(17) }
    tip = { "thumb":L(4), "index":L(8), "middle":L(12), "ring":L(16), "pinky":L(20) }
    hand_len=_euclid(wrist, tip["middle"])
    ratios={}
    for k in tip:
        ratios[k]= _euclid(mcp[k], tip[k]) / hand_len if hand_len>1 else 0.0
    return ratios

# ================= CLI =================
if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--path", default="Hand.jpg")
    ap.add_argument("--outdir", default="debug_out")

    # mode switches (ตั้ง default ให้ “ทำงานเหมือนที่คุณใส่ flag บ่อยๆ”)
    ap.add_argument("--strong_enhance", type=int, default=1)
    ap.add_argument("--detail_binary", type=int, default=1)
    ap.add_argument("--use_frangi", type=int, default=0)
    ap.add_argument("--rect_skeleton_kernel", type=int, default=1)

    # params
    ap.add_argument("--max_side", type=int, default=MAX_SIDE_DEFAULT)
    ap.add_argument("--clahe_clip", type=float, default=CLAHE_CLIP_DEFAULT)
    ap.add_argument("--block_size", type=int, default=31)
    ap.add_argument("--C", type=int, default=8)
    ap.add_argument("--close_itr", type=int, default=CLOSE_ITR_DEFAULT)
    ap.add_argument("--open_itr", type=int, default=OPEN_ITR_DEFAULT)
    ap.add_argument("--min_component_pixels", type=int, default=MIN_COMPONENT_PIXELS_DEFAULT)
    ap.add_argument("--prune_spur_iter", type=int, default=PRUNE_SPUR_ITER_DEFAULT)
    ap.add_argument("--frangi_thresh", type=float, default=0.05)

    # whole-hand segmentation options
    ap.add_argument("--show_hand", type=int, default=1)
    ap.add_argument("--hand_refine", type=str, default="grabcut", choices=["none","morph","skin","grabcut"])
    ap.add_argument("--hand_alpha", type=float, default=0.5)

    args = ap.parse_args()

    if not os.path.exists(args.path):
        print(f"[!] not found: {args.path}"); raise SystemExit(1)

    Cfg = PipeConfig(
        max_side=args.max_side,
        strong_enhance=bool(args.strong_enhance),
        clahe_clip=args.clahe_clip,
        detail_binary=bool(args.detail_binary),
        block_size=args.block_size,
        C=args.C,
        close_itr=args.close_itr,
        open_itr=args.open_itr,
        use_frangi=bool(args.use_frangi),
        frangi_thresh=args.frangi_thresh,
        rect_skeleton_kernel=bool(args.rect_skeleton_kernel),
        min_component_pixels=args.min_component_pixels,
        prune_spur_iter=args.prune_spur_iter,
        show_hand=bool(args.show_hand),
        hand_refine=args.hand_refine,
        hand_alpha=args.hand_alpha
    )

    try:
        img = _np_from_path(args.path)
        out = analyze(img, outdir=args.outdir, Cfg=Cfg)
    except Exception as e:
        os.makedirs(args.outdir, exist_ok=True)
        out = {"error": str(e)}

    os.makedirs(args.outdir, exist_ok=True)
    with open(os.path.join(args.outdir, "result.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"✅ Saved images & JSON in {args.outdir}\\")
