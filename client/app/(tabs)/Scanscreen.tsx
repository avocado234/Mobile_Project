import React, { useEffect, useRef, useState } from "react";
import { View, Text, Image, StyleSheet, Alert, BackHandler, TouchableOpacity } from "react-native";
import { CameraView, useCameraPermissions, type FlashMode } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import LoadingScreen from "../../components/LoadingScreen.native";
import { analyzeImage } from "../../components/api/analyze";
import { API_BASE } from "../../utils/constants";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

const gradientColors = ["#1a0b2e", "#2d1b4e", "#1a0b2e"];
const cardGradientColors = ["rgba(167, 139, 250, 0.18)", "rgba(196, 181, 253, 0.06)"];

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const [facing, setFacing] = useState<"back" | "front">("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [torch, setTorch] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [fortuneAnswer, setFortuneAnswer] = useState<string | null>(null);
  const [showLoading, setShowLoading] = useState(false);
  const loadingMs = 4000;

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => (showLoading ? true : false));
    return () => sub.remove();
  }, [showLoading]);

  const cycleFlash = () => {
    setFlash((current) => {
      if (current === "off") return "on";
      if (current === "on") return "auto";
      return "off";
    });
  };

  const toggleTorch = () => setTorch((current) => !current);
  const switchCamera = () => setFacing((current) => (current === "back" ? "front" : "back"));
  const retake = () => {
    setPhotoUri(null);
    setFortuneAnswer(null);
  };

  const takePhoto = async () => {
    try {
      setShowLoading(true);
      setPhotoUri(null);
      setFortuneAnswer(null);

      const photo = await cameraRef.current?.takePictureAsync?.({
        quality: 1,
        skipProcessing: true,
      });

      if (!photo?.uri) {
        setShowLoading(false);
        Alert.alert("Scan failed", "Please reposition your palm and try again.");
        return;
      }

      try {
        const [analyzeJson] = await Promise.all([analyzeImage(photo.uri), wait(loadingMs)]);

        const { id: scanId } = await saveResultToDB(analyzeJson, {
          device: "expo",
          facing,
          flash,
          torch,
        });

        const { answer } = await predictFortune(scanId, "demo-user", "th", "friendly", "deepseek-chat");

        setPhotoUri(photo.uri);
        setFortuneAnswer(answer);
      } catch (error: any) {
        Alert.alert("Analysis failed", error?.message ?? String(error));
      } finally {
        setShowLoading(false);
      }
    } catch (error: any) {
      setShowLoading(false);
      Alert.alert("Scan failed", error?.message ?? String(error));
    }
  };

  const saveToLibrary = async () => {
    try {
      if (!photoUri) return;
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Please allow photo library access to save your scan.");
        return;
      }
      await MediaLibrary.saveToLibraryAsync(photoUri);
      Alert.alert("Saved", "The scan has been saved to your device.");
    } catch (error: any) {
      Alert.alert("Save failed", error?.message ?? String(error));
    }
  };

  if (!permission) {
    return (
      <LinearGradient colors={gradientColors} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea} />
      </LinearGradient>
    );
  }

  if (!permission.granted) {
    return (
      <LinearGradient colors={gradientColors} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.starsContainer} pointerEvents="none">
            <Ionicons name="star" size={18} color="#B794F6" style={[styles.star, styles.star1]} />
            <Ionicons name="star" size={14} color="#E9D5FF" style={[styles.star, styles.star2]} />
            <Ionicons name="star" size={16} color="#C4B5FD" style={[styles.star, styles.star3]} />
            <Ionicons name="star" size={12} color="#DDD6FE" style={[styles.star, styles.star4]} />
          </View>
          <View style={styles.container}>
            <View style={styles.header}>
              <Text style={styles.title}>Palm Scan</Text>
              <Text style={styles.subtitle}>
                Allow camera access so we can capture your palm and generate insights.
              </Text>
            </View>

            <View style={styles.permissionCard}>
              <Text style={styles.permissionText}>
                Your camera feed is only used to analyse the palm reading and will not be stored without your
                consent.
              </Text>

              <TouchableOpacity style={styles.primaryButton} onPress={requestPermission} activeOpacity={0.85}>
                <Ionicons name="camera-outline" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Allow Camera Access</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={gradientColors} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.starsContainer} pointerEvents="none">
          <Ionicons name="star" size={18} color="#B794F6" style={[styles.star, styles.star1]} />
          <Ionicons name="star" size={14} color="#E9D5FF" style={[styles.star, styles.star2]} />
          <Ionicons name="star" size={16} color="#C4B5FD" style={[styles.star, styles.star3]} />
          <Ionicons name="star" size={12} color="#DDD6FE" style={[styles.star, styles.star4]} />
        </View>

        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Palm Scan</Text>
          
          </View>

          <View style={styles.card}>
            <LinearGradient colors={cardGradientColors} style={styles.cardGradient}>
              <View style={styles.cameraWrapper}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.previewImage} />
                ) : (
                  <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing={facing}
                    flash={flash}
                    enableTorch={torch}
                  />
                )}
              </View>

              <Text style={styles.hintText}>
                {photoUri ? "Not happy with the shot? Tap the button below to scan again." : "Make sure your palm is well lit and fills the guide."}
              </Text>

              <View style={styles.controlsRow}>
                <TouchableOpacity style={styles.controlButton} onPress={cycleFlash} activeOpacity={0.8}>
                  <Ionicons
                    name={
                      flash === "off"
                        ? "flash-off-outline"
                        : flash === "on"
                        ? "flash-outline"
                        : "flash"
                    }
                    size={18}
                    color="#E9D5FF"
                  />
                  <Text style={styles.controlText}>Flash: {flash}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.controlButton} onPress={toggleTorch} activeOpacity={0.8}>
                  <Ionicons name={torch ? "flashlight" : "flashlight-outline"} size={18} color="#E9D5FF" />
                  <Text style={styles.controlText}>{torch ? "Torch On" : "Torch Off"}</Text>
                </TouchableOpacity>

                
              </View>

              <View style={styles.shutterWrapper}>
                <TouchableOpacity
                  style={styles.shutter}
                  onPress={photoUri ? retake : takePhoto}
                  activeOpacity={0.85}
                  disabled={showLoading}
                >
                  <View style={styles.shutterInner} />
                </TouchableOpacity>
                <Text style={styles.shutterLabel}>{photoUri ? "Scan Again" : "Tap to Scan"}</Text>
              </View>

              {photoUri ? (
                <>
                  <TouchableOpacity style={styles.secondaryButton} onPress={saveToLibrary} activeOpacity={0.85}>
                    <Ionicons name="download-outline" size={18} color="#C4B5FD" />
                    <Text style={styles.secondaryButtonText}>Save to device</Text>
                  </TouchableOpacity>
                  {fortuneAnswer ? (
                    <View style={styles.fortuneBox}>
                      <Ionicons name="sparkles-outline" size={18} color="#C4B5FD" />
                      <Text style={styles.fortuneText}>{fortuneAnswer}</Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </LinearGradient>
          </View>
        </View>
      </SafeAreaView>

      {showLoading && (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <LoadingScreen company="Horo App" durationMs={loadingMs} />
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    alignItems: "center",
  },
  starsContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  star: {
    position: "absolute",
    opacity: 0.4,
  },
  star1: { top: 80, left: 40 },
  star2: { top: 140, right: 50 },
  star3: { top: "35%", left: 80 },
  star4: { bottom: 120, right: 70 },

  header: {
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#E9D5FF",
    letterSpacing: 0.5,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#C4B5FD",
    textAlign: "center",
  },

  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.25)",
    backgroundColor: "rgba(26, 11, 46, 0.65)",
  },
  cardGradient: {
    padding: 20,
  },
  cameraWrapper: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#050212",
  },
  camera: {
    flex: 1,
  },
  previewImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  hintText: {
    marginTop: 16,
    fontSize: 13,
    color: "#E9D5FF",
    textAlign: "center",
  },
  controlsRow: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  controlButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(26, 11, 46, 0.5)",
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.2)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  controlText: {
    fontSize: 12,
    color: "#E9D5FF",
    fontWeight: "600",
  },
  shutterWrapper: {
    marginTop: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  shutter: {
    width: 66,
    height: 66,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: "#fff",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterInner: {
    width: 48,
    height: 48,
    borderRadius: 34,
    backgroundColor: "#fff",
  },
  shutterLabel: {
    fontSize: 14,
    color: "#E9D5FF",
    fontWeight: "600",
  },
  primaryButton: {
    marginTop: 20,
    borderRadius: 16,
    paddingVertical: 14,
    backgroundColor: "rgba(139, 92, 246, 0.92)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryButtonText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  secondaryButton: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(196, 181, 253, 0.35)",
    backgroundColor: "rgba(196, 181, 253, 0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryButtonText: {
    color: "#C4B5FD",
    fontSize: 14,
    fontWeight: "600",
  },
  permissionCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    padding: 24,
    backgroundColor: "rgba(26, 11, 46, 0.7)",
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.25)",
  },
  permissionText: {
    fontSize: 14,
    color: "#E9D5FF",
    lineHeight: 20,
    textAlign: "center",
  },
  fortuneBox: {
    marginTop: 18,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "rgba(26, 11, 46, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(196, 181, 253, 0.3)",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  fortuneText: {
    flex: 1,
    color: "#E9D5FF",
    fontSize: 13,
    lineHeight: 18,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 2, 18, 0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
});
