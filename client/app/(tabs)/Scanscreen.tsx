import React, { useEffect, useRef, useState } from "react";
import { View, Text, Button, Image, StyleSheet, Alert, BackHandler, TouchableOpacity } from "react-native";
import { CameraView, useCameraPermissions, type FlashMode } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import LoadingScreen from "../../components/LoadingScreen.native";
import { analyzeImage } from "../../components/api/analyze";
import { API_BASE } from "../../utils/constants";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- POST: บันทึกผลวิเคราะห์ลง Firestore ผ่าน Flask (/scan/save)
async function saveResultToDB(
  analyzeResult: any,
  meta: Record<string, any> = {},
  userId: string = "demo-user"
) {
  const res = await fetch(`${API_BASE}/scan/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, analyze_result: analyzeResult, meta }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `save failed (${res.status})`);
  return json as { id: string };
}

// --- POST: ทำนายดวงจาก scan_id (/fortune/predict)
async function predictFortune(
  scanId: string,
  userId: string = "demo-user",
  language: "th" | "en" = "th",
  style: "friendly" | "formal" = "friendly",
  model = "deepseek-chat"
) {
  const res = await fetch(`${API_BASE}/fortune/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scan_id: scanId, user_id: userId, language, style, model }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `predict failed (${res.status})`);
  return json as { fortune_id: string; answer: string };
}

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const [facing, setFacing] = useState<"back" | "front">("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [torch, setTorch] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showLoading, setShowLoading] = useState(false);
  const loadingMs = 4000; // ให้พอครอบคลุม analyze+save+predict

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => (showLoading ? true : false));
    return () => sub.remove();
  }, [showLoading]);

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text>ต้องการสิทธิ์ใช้งานกล้อง</Text>
        <Button title="อนุญาต" onPress={requestPermission} />
      </View>
    );
  }

  const takePhoto = async () => {
    try {
      setShowLoading(true);
      setPhotoUri(null);

      const photo = await cameraRef.current?.takePictureAsync?.({
        quality: 1,
        skipProcessing: true,
      });

      if (!photo?.uri) {
        setShowLoading(false);
        Alert.alert("ถ่ายรูปไม่สำเร็จ", "ไม่มีรูปภาพที่ได้จากกล้อง");
        return;
      }

      try {
        const [analyzeJson] = await Promise.all([analyzeImage(photo.uri), wait(loadingMs)]);

        const { id: scanId } = await saveResultToDB(analyzeJson, { device: "expo", facing, flash, torch });

        const { answer } = await predictFortune(scanId, "demo-user", "th", "friendly", "deepseek-chat");

        setPhotoUri(photo.uri);

      } catch (e: any) {
        Alert.alert("ทำนายไม่สำเร็จ", e?.message ?? String(e));
      } finally {
        setShowLoading(false);
      }
    } catch (e: any) {
      setShowLoading(false);
      Alert.alert("ถ่ายรูปไม่สำเร็จ", e?.message ?? String(e));
    }
  };

  const saveToLibrary = async () => {
    try {
      if (!photoUri) return;
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("ต้องการสิทธิ์", "โปรดอนุญาตเข้าถึงคลังรูปภาพ");
        return;
      }
      await MediaLibrary.saveToLibraryAsync(photoUri);
      Alert.alert("บันทึกแล้ว!!", "รูปถูกบันทึกในคลังภาพของคุณ");
    } catch (e: any) {
      Alert.alert("บันทึกไม่สำเร็จ", e?.message ?? String(e));
    }
  };

  // โหมดพรีวิวรูป
  if (photoUri) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <Image source={{ uri: photoUri }} style={{ flex: 1, resizeMode: "contain" }} />
        <View style={styles.previewBar}>
          <Button title="ถ่ายใหม่" onPress={() => setPhotoUri(null)} />
          <Button title="บันทึกลงเครื่อง" onPress={saveToLibrary} />
        </View>
      </View>
    );
  }

  // โหมดกล้อง
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing} flash={flash} enableTorch={torch} />

      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topBtn}
          onPress={() => setFlash((f) => (f === "off" ? "on" : f === "on" ? "auto" : "off"))}
        >
          <Text style={styles.topBtnText}>Flash: {flash}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.topBtn} onPress={() => setTorch((t) => !t)}>
          <Text style={styles.topBtnText}>{torch ? "Torch On" : "Torch Off"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.sideBtn} onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}>
          <Text style={styles.sideBtnText}>สลับ</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shutter} onPress={takePhoto} activeOpacity={0.7}>
          <View style={styles.shutterInner} />
        </TouchableOpacity>

        <View style={styles.sideBtn} />
      </View>

      {showLoading && (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <LoadingScreen company="Horo App" durationMs={loadingMs} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  topBar: {
    position: "absolute",
    top: 20,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 10,
  },
  topBtn: {
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  topBtnText: { color: "#fff", fontSize: 14 },

  bottomBar: {
    position: "absolute",
    bottom: 28,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sideBtn: {
    width: 64,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  sideBtnText: { color: "#fff" },

  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
  },

  previewBar: {
    position: "absolute",
    bottom: 24,
    width: "100%",
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-around",
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
});
