// client/app/(tabs)/Scanscreen.tsx
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
import { getIdToken } from "../../services/auth";

import type { ColorValue } from "react-native";

import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSelector } from '@/redux/hooks';
import { FortuneSummaryCard } from '@/components/FortuneResultCard';
import { enrichFortuneRecord } from '@/utils/fortune';
import { fetchFortuneOrFallback } from '@/services/fortunes';







const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function saveResultToDB(
  analyzeResult: any,
  meta: Record<string, any> = {}
) {
  const token = await getIdToken();
  if (!token) throw new Error("กรุณาเข้าสู่ระบบก่อนสแกน");
  const res = await fetch(`${API_BASE}/scan/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ analyze_result: analyzeResult, meta }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `save failed (${res.status})`);
  return json as { id: string };
}

async function predictFortune(
  scanId: string,
  language: "th" | "en" = "th",
  style: "friendly" | "formal" = "friendly",
  model = "deepseek-chat",
  period = "today"
) {
  const token = await getIdToken();
  if (!token) throw new Error("กรุณาเข้าสู่ระบบก่อนทำนาย");
  const res = await fetch(`${API_BASE}/fortune/predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ scan_id: scanId, language, style, model }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `predict failed (${res.status})`);
  // server คืน { fortune_id, answer } ตามเวอร์ชันล่าสุด
  return json as { fortune_id: string; answer: string };
}

const gradientColors: readonly [ColorValue, ColorValue, ...ColorValue[]] = ["#1a0b2e", "#2d1b4e", "#1a0b2e"];
const cardGradientColors: readonly [ColorValue, ColorValue, ...ColorValue[]] = [
  "rgba(167, 139, 250, 0.18)",
  "rgba(196, 181, 253, 0.06)"
];

export default function CameraScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const userProfile = useAppSelector((state) => state.user.profile);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const [facing, setFacing] = useState<"back" | "front">("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [torch, setTorch] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [fortuneResult, setFortuneResult] =
    useState<ReturnType<typeof enrichFortuneRecord> | null>(null);
  const [showLoading, setShowLoading] = useState(false);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
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

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (showLoading) {
      timer = setTimeout(() => setShowLoadingOverlay(true), 1000);
    } else {
      setShowLoadingOverlay(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [showLoading]);

  const cycleFlash = () => {
    setFlash((current) => {
      if (current === "off") return "on";
      if (current === "on") return "auto";
      return "off";
    });
  };

  const toggleTorch = () => setTorch((current) => !current);

  const retake = () => {
    setPhotoUri(null);
    setFortuneResult(null);
    setShowLoading(false);
    setShowLoadingOverlay(false);
  };

  const takePhoto = async () => {
    try {
      setShowLoading(true);
      setPhotoUri(null);
      setFortuneResult(null);

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

        const fortuneConfig = {
          language: "th" as const,
          style: "friendly" as const,
          model: "deepseek-chat",
          period: "today" as const,
        };

        const { fortune_id: fortuneId, answer } = await predictFortune(
          scanId,
          fortuneConfig.language,
          fortuneConfig.style,
          fortuneConfig.model,
          fortuneConfig.period
        );

        let fortuneRecord = null;
        if (fortuneId) {
          const fallback = {
            id: fortuneId,
            answer,
            language: fortuneConfig.language,
            style: fortuneConfig.style,
            period: fortuneConfig.period,
            period_text: {
              th: fortuneConfig.period === "today" ? "วันนี้" : fortuneConfig.period,
              en: fortuneConfig.period,
            },
            createdAt: new Date(),
          };

          try {
            fortuneRecord = user?.uid
              ? await fetchFortuneOrFallback(user.uid, fortuneId, fallback)
              : fallback;
          } catch (fetchError) {
            console.warn("Failed to fetch fortune document:", fetchError);
            fortuneRecord = fallback;
          }
        }

        setPhotoUri(photo.uri);
        if (fortuneRecord) {
          setFortuneResult(enrichFortuneRecord(fortuneRecord));
        }
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

  const handleViewFortuneDetail = () => {
    if (!fortuneResult) return;
    router.push({
      pathname: "/fortune/[fortuneId]",
      params: { fortuneId: fortuneResult.id },
    });
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
                  {fortuneResult ? (
                    <View style={styles.fortuneResultContainer}>
                      <FortuneSummaryCard
                        fortune={fortuneResult}
                        parsed={fortuneResult.parsed}
                        onPress={() => handleViewFortuneDetail()}
                      />
                      <TouchableOpacity
                        style={styles.viewFortuneButton}
                        onPress={handleViewFortuneDetail}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="book-outline" size={18} color="#E9D5FF" />
                        <Text style={styles.viewFortuneText}>View full reading</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </>
              ) : null}
            </LinearGradient>
          </View>
        </View>
      </SafeAreaView>

      {showLoadingOverlay && (
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
  fortuneResultContainer: {
    marginTop: 18,
    gap: 12,
  },
  viewFortuneButton: {
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
  viewFortuneText: {
    color: "#E9D5FF",
    fontSize: 14,
    fontWeight: "600",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 1)",
    justifyContent: "center",
    alignItems: "center",
  },
});
