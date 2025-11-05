import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import LottieView from "lottie-react-native";
type Props = {
  company?: string;
  durationMs?: number;
  onComplete?: () => void;
  phrasesOverride?: string[];
};
export default function LoadingScreen({
  company = "Mee Duang",
  durationMs = 5500,
  onComplete,
  phrasesOverride,
}: Props) {
  const defaultPhrases = useMemo(
    () => [
      "กำลังสแกนลายนิ้วมือของคุณ",
      "อ่านค่าจากเส้นชีวิต เส้นสมอง และเส้นหัวใจ",
      "วิเคราะห์รูปทรงฝ่ามือและค่าโค้ง",
      "เตรียมคำพยากรณ์สำหรับคุณ",
    ],
    []
  );
  const phrases = useMemo(
    () => (phrasesOverride?.length ? phrasesOverride : defaultPhrases),
    [phrasesOverride, defaultPhrases]
  );
  const [phraseIndex, setPhraseIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (phrases.length > 1) {
      intervalRef.current = setInterval(() => {
        setPhraseIndex((index) => (index + 1) % phrases.length);
      }, 1200);
    }
    timeoutRef.current = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      onComplete?.();
    }, durationMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [durationMs, onComplete, phrases.length]);
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.brand}>{company}</Text>
        <Text style={styles.title}>กำลังประมวลผลลายนิ้วมือของคุณ</Text>
        <LottieView source={require("../Loading.json")} autoPlay loop style={styles.lottie} />
        <Text style={styles.phrase}>{phrases[phraseIndex] ?? phrases[0]}</Text>
      </View>
      </View>
     
  
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  glowOuter: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(99, 102, 241, 0.25)",
    opacity: 0.65,
  },
  glowInner: {
    width: "70%",
    height: "70%",
    borderRadius: 120,
    backgroundColor: "rgba(168, 85, 247, 0.45)",
    alignSelf: "center",
    marginTop: "15%",
  },
  card: {
    width: "88%",
    maxWidth: 340,
    backgroundColor: "rgba(26, 12, 52, 0.92)",
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(196, 181, 253, 0.25)",
    shadowColor: "#8B5CF6",
    shadowOpacity: 0.32,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  brand: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
    color: "#C4B5FD",
    textTransform: "uppercase",
  },
  title: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#F4F3FF",
  },
  phrase: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    color: "#D5CCFF",
  },
  lottie: {
    width: 200,
    height: 200,
  },
});
