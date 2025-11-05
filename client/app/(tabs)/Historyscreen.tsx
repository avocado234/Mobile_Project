import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";

import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { FortuneSummaryCard } from "@/components/FortuneResultCard";
import { enrichFortuneRecord } from "@/utils/fortune";
import type { FortuneDocument, FortuneSummary } from "@/types/fortune";

const gradientColors = ["#1a0b2e", "#2d1b4e", "#1a0b2e"] as const;
const historyLimit = 50;

type FortuneItem = ReturnType<typeof enrichFortuneRecord>;

export default function HistoryScreen() {
  const { user, initializing } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<FortuneItem[]>([]);
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
        const data: FortuneItem[] = snapshot.docs.map((docSnap) => {
          const payload = docSnap.data() as Record<string, unknown>;
          const nestedResult = payload.result as Record<string, unknown> | undefined;

          const fortuneDoc: FortuneDocument = {
            id: docSnap.id,
            answer:
              (payload.answer as string | undefined) ??
              (payload.predictionText as string | undefined) ??
              (nestedResult?.intro as string | undefined) ??
              (nestedResult?.topic1 as any)?.content ??
              "",
            createdAt: (payload.createdAt as any) ?? null,
            language:
              (payload.language as string | undefined) ??
              (nestedResult?.language as string | undefined) ??
              "",
            style: (payload.style as string | undefined) ?? "",
            period: (payload.period as string | undefined) ?? "",
            period_text: (payload.period_text as FortuneDocument["period_text"]) ?? null,
            summary: (payload.summary as FortuneSummary | undefined) ?? null,
            model:
              (payload.model as string | undefined) ??
              (nestedResult?.model as string | undefined) ??
              undefined,
            user_profile_used: payload.user_profile_used as Record<string, unknown> | undefined,
            features: payload.features as Record<string, unknown> | undefined,
          };

          return enrichFortuneRecord(fortuneDoc);
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
            <HistoryItem
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

type HistoryItemProps = {
  item: FortuneItem;
  onPress: () => void;
};

function HistoryItem({ item, onPress }: HistoryItemProps) {
  return (
    <View style={styles.historyItemWrapper}>
      <FortuneSummaryCard fortune={item} parsed={item.parsed} onPress={onPress} />
    </View>
  );
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
    gap: 12,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 48,
  },
  historyItemWrapper: {
    gap: 12,
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

