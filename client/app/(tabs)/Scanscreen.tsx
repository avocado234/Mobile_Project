import React, { useEffect, useRef, useState } from "react";
import { View, Text, Button, Image, StyleSheet, Alert, BackHandler, TouchableOpacity, ScrollView } from "react-native";
import { CameraView, useCameraPermissions, type FlashMode } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import LoadingScreen from "../../components/LoadingScreen.native";
import { analyzeImage, type AnalyzeResult } from "../../components/api/analyze";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const [facing, setFacing] = useState<"back" | "front">("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [torch, setTorch] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  const [showLoading, setShowLoading] = useState(false);
  const loadingMs = 5500; // บังคับโชว์โหลด 5.5 วิ

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (showLoading) return true;
      return false;
    });
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
      setResult(null);
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

      // ยิงไปวิเคราะห์ + บังคับโชว์โหลด 5.5 วินาทีไปพร้อมกัน
      try {
        const [json] = await Promise.all([
          analyzeImage(photo.uri), // เรียก Flask /analyze
          wait(loadingMs),
        ]);
        setPhotoUri(photo.uri);
        setResult(json);
      } catch (e: any) {
        Alert.alert("วิเคราะห์ไม่สำเร็จ", e?.message ?? String(e));
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
      Alert.alert("บันทึกแล้ว", "รูปถูกบันทึกในคลังภาพของคุณ");
    } catch (e: any) {
      Alert.alert("บันทึกไม่สำเร็จ", e?.message ?? String(e));
    }
  };

  // โหมดแสดงผลลัพธ์ + พรีวิวรูป
  if (photoUri) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <Image source={{ uri: photoUri }} style={{ flex: 1, resizeMode: "contain" }} />
        <View style={styles.previewBar}>
          <Button title="ถ่ายใหม่" onPress={() => { setPhotoUri(null); setResult(null); }} />
          <Button title="บันทึกลงเครื่อง" onPress={saveToLibrary} />
        </View>

        {/* กล่องผลลัพธ์ */}
        <ScrollView style={styles.resultPanel}>
          <Text style={styles.resultTitle}>ผลการวิเคราะห์</Text>

          {result?.error && (
            <Text style={styles.errText}>⚠️ {result.error}</Text>
          )}

          {result && !result.error && (
            <>
              {/* สรุปค่าไฮไลต์ */}
              <Text style={styles.resultText}>
                ขนาดภาพ: {result.image_size?.width}×{result.image_size?.height}px
              </Text>
              {result.roi_bbox_small && (
                <Text style={styles.resultText}>
                  ROI: x={result.roi_bbox_small.x}, y={result.roi_bbox_small.y}, w={result.roi_bbox_small.w}, h={result.roi_bbox_small.h}
                </Text>
              )}
              {result.lines?.life && (
                <Text style={styles.resultText}>
                  เส้นชีวิต: length≈{result.lines.life.length_px?.toFixed?.(1)} px, style={result.lines.life.branch_style}
                </Text>
              )}
              {result.lines?.head && (
                <Text style={styles.resultText}>
                  เส้นสมอง: length≈{result.lines.head.length_px?.toFixed?.(1)} px, style={result.lines.head.branch_style}
                </Text>
              )}
              {result.lines?.heart && (
                <Text style={styles.resultText}>
                  เส้นหัวใจ: length≈{result.lines.heart.length_px?.toFixed?.(1)} px, style={result.lines.heart.branch_style}
                </Text>
              )}

              {/* แสดง Raw JSON ไว้ debug ช่วงแรก */}
              <Text style={[styles.resultTitle, { marginTop: 8 }]}>Raw JSON</Text>
              <Text selectable style={styles.rawJson}>
                {JSON.stringify(result, null, 2)}
              </Text>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  // โหมดกล้อง
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing={facing}
        flash={flash}
        enableTorch={torch}
      />

      {/* ท็อปบาร์: แฟลช / ไฟฉาย */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topBtn}
          onPress={() =>
            setFlash((f) => (f === "off" ? "on" : f === "on" ? "auto" : "off"))
          }
        >
          <Text style={styles.topBtnText}>Flash: {flash}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.topBtn} onPress={() => setTorch((t) => !t)}>
          <Text style={styles.topBtnText}>{torch ? "Torch On" : "Torch Off"}</Text>
        </TouchableOpacity>
      </View>

      {/* บาร์ล่าง: ซ้ายสลับกล้อง / กลางชัตเตอร์ */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.sideBtn} onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}>
          <Text style={styles.sideBtnText}>สลับ</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shutter} onPress={takePhoto} activeOpacity={0.7}>
          <View style={styles.shutterInner} />
        </TouchableOpacity>

        <View style={styles.sideBtn} />
      </View>

      {/* โอเวอร์เลย์ Loading */}
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

  resultPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "50%",
    backgroundColor: "#0f172a",
    padding: 12,
  },
  resultTitle: {
    color: "#fff",
    fontWeight: "700",
    marginBottom: 6,
  },
  resultText: {
    color: "#cbd5e1",
    marginBottom: 4,
  },
  errText: { color: "#fecaca", fontWeight: "600" },
  rawJson: { color: "#e2e8f0", fontFamily: "monospace" as any, marginTop: 6 },
});
