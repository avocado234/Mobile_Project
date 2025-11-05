import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Timestamp,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";


type FortuneLineSummary = {
  length_px?: number;
  branch_style?: string;
} | null;

type FortuneSummary = {
  life?: FortuneLineSummary;
  head?: FortuneLineSummary;
  heart?: FortuneLineSummary;
} | null;

type FortuneRecord = {
  id: string;
  predictionText: string;
  createdAt?: Timestamp | null;
  language?: string;
  style?: string;
  summary?: FortuneSummary;
  features?: Record<string, unknown>;
};

type FirestoreTimestamp = Timestamp | { seconds: number; nanoseconds: number };

const gradientColors = ["#1a0b2e", "#2d1b4e", "#1a0b2e"] as const;
const cardGradient = ["rgba(167, 139, 250, 0.18)", "rgba(196, 181, 253, 0.06)"] as const;
const historyLimit = 50;

export default function HistoryScreen() {
  const { user, initializing } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<FortuneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initializing) {
      return;
    }

    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const fortunesRef = collection(db, "users", user.uid, "fortunes");
    const fortunesQuery = query(fortunesRef, orderBy("createdAt", "desc"), limit(historyLimit));

    const unsubscribe = onSnapshot(
      fortunesQuery,
      (snapshot) => {
        const data: FortuneRecord[] = snapshot.docs.map((doc) => {
          const payload = doc.data();
          return {
            id: doc.id,
            predictionText: payload.predictionText
              ?? payload.result?.intro
              ?? payload.result?.topic1?.content
              ?? "",
            createdAt: payload.createdAt ?? null,
            language: payload.language ?? payload.result?.language ?? "",
            style: payload.style ?? "",
            summary: payload.summary ?? null,
            features: payload.features ?? undefined,
          };
  
      });
    setItems(data);
    setLoading(false);
  },
    (err) => {
      console.error("Failed to load fortunes:", err);
      if (err.code === "failed-precondition") {
        setError(
          "ต้องสร้าง Firestore index สำหรับ createdAt ก่อนใช้งาน (เปิดลิงก์จาก log เพื่อตั้งค่า)."
        );
      }
      setLoading(false);
    }
  );

  return unsubscribe;
}, [initializing, user]);

const emptyContent = useMemo(() => {
  if (loading || initializing) return null;
  if (!user) {
    return (
      <EmptyState
        icon="log-in-outline"
        title="กรุณาเข้าสู่ระบบ"
        subtitle="ล็อกอินเพื่อดูประวัติคำทำนายของคุณเอง"
      />
    );
  }

  return (
    <EmptyState
      icon="book-outline"
      title="ยังไม่มีประวัติ"
      subtitle="เมื่อสแกนฝ่ามือ ผลลัพธ์จะถูกจัดเก็บไว้ที่นี่โดยอัตโนมัติ"
    />
  );
}, [initializing, loading, user]);

return (
  <LinearGradient colors={gradientColors} style={styles.gradient}>
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>

      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color="#FCA5A5" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#C4B5FD" />
          <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={items.length ? styles.listContent : styles.emptyContainer}
          ListEmptyComponent={emptyContent}
          renderItem={({ item }) => (
            <HistoryCard
              item={item}
              onPress={() =>
                router.push({
                  pathname: "/fortune/[fortuneId]",
                  params: { fortuneId: item.id },
                })
              }
            />
          )}
        />
      )}
    </SafeAreaView>
  </LinearGradient>
);
}

type HistoryCardProps = {
  item: FortuneRecord;
  onPress: () => void;
};

function HistoryCard({ item, onPress }: HistoryCardProps) {
  const createdAt = formatTimestamp(item.createdAt);
  const lineSummary = buildLineSummary(item.summary);

  return (
    <Pressable onPress={onPress} style={styles.cardWrapper}>
      <LinearGradient colors={cardGradient} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Ionicons name="sparkles-outline" size={18} color="#F4F3FF" />
            <Text style={styles.cardDate}>{createdAt}</Text>
          </View>
          <View style={styles.badgeRow}>
            {item.language ? <Badge text={item.language.toUpperCase()} /> : null}
            {item.style ? <Badge text={item.style} /> : null}
          </View>
        </View>

        <Text style={styles.answerText} numberOfLines={3}>
          {item.predictionText || "ไม่มีคำตอบ"}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

type LineDisplay = {
  label: string;
  text: string;
};

function buildLineSummary(
  summary: FortuneSummary | null | undefined,
 
): LineDisplay[] {
  const hints: LineDisplay[] = [];

  const derivedSummary = summary ?? null;

  if (derivedSummary) {
    const mapping: Array<{ key: keyof NonNullable<FortuneSummary>; label: string }> = [
      { key: "life", label: "เส้นชีวิต" },
      { key: "head", label: "เส้นสมอง" },
      { key: "heart", label: "เส้นหัวใจ" },
    ];

    mapping.forEach(({ key, label }) => {
      const detail = derivedSummary?.[key];
      if (!detail) return;

      const parts: string[] = [];
      if (detail.length_px != null) {
        parts.push(`ความยาว ~${Math.round(detail.length_px)}px`);
      }
      if (detail.branch_style) {
        parts.push(`ลักษณะ ${detail.branch_style}`);
      }

      if (!parts.length) return;
      hints.push({ label, text: `${label}: ${parts.join(" · ")}` });
    });
  }

  const featureHints: Array<{ key: string; label: string }> = [
    
  ];

 

  return hints;
}

function formatTimestamp(value: FirestoreTimestamp | Date | null | undefined): string {
  const date = normalizeDate(value);
  if (!date) return "ไม่ทราบเวลา";
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = date.getFullYear();
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${minute} น.`;
}

function normalizeDate(value: FirestoreTimestamp | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof (value as Timestamp).toDate === "function") {
    return (value as Timestamp).toDate();
  }
  const ts = value as { seconds?: number; nanoseconds?: number };
  if (typeof ts.seconds === "number") {
    return new Date(ts.seconds * 1000 + (ts.nanoseconds ?? 0) / 1_000_000);
  }
  return null;
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={40} color="#C4B5FD" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    marginBottom: 100,
  },
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#F4F3FF",
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#C4B5FD",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(248, 113, 113, 0.15)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.35)",
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    color: "#FCA5A5",
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#C4B5FD",
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 28,
    gap: 16,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 48,
  },
  cardWrapper: {
    borderRadius: 22,
    backgroundColor: "rgba(26, 11, 46, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.25)",
    overflow: "hidden",
  },
  card: {
    padding: 18,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardDate: {
    color: "#E9D5FF",
    fontSize: 13,
    fontWeight: "600",
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(139, 92, 246, 0.25)",
  },
  badgeText: {
    color: "#E9D5FF",
    fontSize: 11,
    fontWeight: "600",
  },
  answerText: {
    color: "#F9FAFB",
    fontSize: 14,
    lineHeight: 20,
  },
  summarySection: {
    gap: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(168, 85, 247, 0.25)",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  summaryBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    backgroundColor: "#C4B5FD",
  },
  summaryText: {
    flex: 1,
    color: "#E0E7FF",
    fontSize: 12,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F4F3FF",
  },
  emptySubtitle: {
    textAlign: "center",
    color: "#C4B5FD",
    fontSize: 13,
    lineHeight: 18,
  },
});

