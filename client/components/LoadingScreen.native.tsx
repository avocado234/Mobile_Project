import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";

type Props = {
  company?: string;               // ✅ เพิ่มให้รองรับพร็อพ company
  durationMs?: number;            // เวลาแสดงรวม (เช่น 5–6 วิ)
  onComplete?: () => void;        // เรียกเมื่อโหลดครบเวลา
  phrasesOverride?: string[];     // ถ้าอยากส่งรายการข้อความเอง
};

const DEFAULT_PHRASES_TH = [
  "กำลังดูความรัก...",
  "กำลังเช็กการเงิน...",
  "กำลังดูดวงวันนี้...",
  "กำลังเช็กการงาน...",
  "กำลังคำนวณโชคลาภ...",
  "กำลังดูสุขภาพ...",
  "กำลังเรียงไพ่ยิปซี...",
  "กำลังตรวจดวงรายเดือน...",
  "กำลังดูสีมงคลวันนี้...",
  "กำลังเช็กเลขนำโชค..."
];

export default function LoadingScreen({
  company = "Company",
  durationMs = 5500,
  onComplete,
  phrasesOverride,
}: Props) {
  const phrases = useMemo(
    () => (phrasesOverride?.length ? phrasesOverride : DEFAULT_PHRASES_TH),
    [phrasesOverride]
  );

  // แสดงวลีหมุนไปเรื่อย ๆ ระหว่างรอ
  const [phraseIndex, setPhraseIndex] = useState(0);

  // ✅ ใช้ ReturnType เพื่อให้ clearTimeout/clearInterval ถูกชนิดบน RN
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);

  useEffect(() => {
    // เปลี่ยนข้อความทุก ~900ms (ปรับได้)
    intervalRef.current = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % phrases.length);
    }, 900);

    timeoutRef.current = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      onComplete?.();
    }, durationMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current)  clearTimeout(timeoutRef.current);
    };
  }, [durationMs, onComplete, phrases.length]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <ActivityIndicator size="large" color="#FFD369" />
        <Text style={styles.title}>กำลังโหลดข้อมูลดวงชะตา</Text>
        <Text style={styles.phrase}>{phrases[phraseIndex]}</Text>
        {!!company && <Text style={styles.brand}>by {company}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // พื้นหลังเข้ม + ตัวอักษรสว่าง → อ่านง่าย
  container: {
    flex: 1,
    backgroundColor: "#0B1020", // น้ำเงินเข้ม
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#131A33", // เข้มแต่เบากว่าพื้นหลัง เพื่อแยกชั้น
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  title: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF", // ขาวชัด
  },
  phrase: {
    marginTop: 8,
    fontSize: 14,
    color: "#C9CFEC", // อ่อนลงเล็กน้อยให้อ่านสบาย
  },
  brand: {
    marginTop: 6,
    fontSize: 12,
    color: "#97A1D9",
  },
});
