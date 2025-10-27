import React, { useEffect, useRef, useState } from "react";
import { View, Text, Button, Image, StyleSheet, Alert, BackHandler, TouchableOpacity } from "react-native";
import { CameraView, useCameraPermissions, type FlashMode } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import LoadingScreen from "../../components/LoadingScreen.native"; // จะเลือก .native.tsx อัตโนมัติบนมือถือ

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const [facing, setFacing] = useState<"back" | "front">("back");
  const [flash, setFlash] = useState<FlashMode>("off");  // 'off' | 'on' | 'auto'
  const [torch, setTorch] = useState(false);             // ไฟฉายค้าง

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showLoading, setShowLoading] = useState(false);
  const loadingMs = 5500; // 5–6 วิ

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (showLoading) return true; // บล็อกปุ่ม Back ตอนกำลังโหลด
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
      const photo = await cameraRef.current?.takePictureAsync?.({
        quality: 1,
        skipProcessing: true,
      });

      // แสดงโหลด 5–6 วิ แล้วค่อยไปพรีวิว
      setTimeout(() => {
        setShowLoading(false);
        if (photo?.uri) setPhotoUri(photo.uri);
      }, loadingMs);
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

  // โหมดพรีวิว + บันทึก
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
            setFlash(f => (f === "off" ? "on" : f === "on" ? "auto" : "off"))
          }
        >
          <Text style={styles.topBtnText}>Flash: {flash}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.topBtn} onPress={() => setTorch(t => !t)}>
          <Text style={styles.topBtnText}>{torch ? "Torch On" : "Torch Off"}</Text>
        </TouchableOpacity>
      </View>

      {/* บาร์ล่าง: ซ้ายสลับกล้อง / กลางชัตเตอร์ */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.sideBtn} onPress={() => setFacing(f => (f === "back" ? "front" : "back"))}>
          <Text style={styles.sideBtnText}>สลับ</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shutter} onPress={takePhoto} activeOpacity={0.7}>
          <View style={styles.shutterInner} />
        </TouchableOpacity>

        <View style={styles.sideBtn} />{/* เว้นที่ให้บาลานซ์ขวา */}
      </View>

      {/* โอเวอร์เลย์ Loading (ทับทั้งหน้ากล้อง) */}
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
