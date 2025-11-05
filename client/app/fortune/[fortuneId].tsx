import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { FortuneResultCard } from '@/components/FortuneResultCard';
import { useAuth } from '@/contexts/AuthContext';
import { fetchFortune } from '@/services/fortunes';
import { enrichFortuneRecord, formatFortuneDate } from '@/utils/fortune';

type EnrichedFortune = ReturnType<typeof enrichFortuneRecord>;

const gradientColors = ['#1a0b2e', '#2d1b4e', '#1a0b2e'] as const;

export default function FortuneDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fortuneId?: string }>();
  const FortuneIdParam = params.fortuneId;
  const fortuneId = Array.isArray(FortuneIdParam) ? FortuneIdParam[0] : FortuneIdParam;
  const { user } = useAuth();

  const [fortune, setFortune] = useState<EnrichedFortune | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadFortune(uid: string, id: string) {
      try {
        setLoading(true);
        setError(null);
        const doc = await fetchFortune(uid, id);
        if (!mounted) return;
        if (!doc) {
          setError('Fortune not found or has been removed.');
          setFortune(null);
          return;
        }
        setFortune(enrichFortuneRecord(doc));
      } catch (err) {
        console.error('Failed to load fortune:', err);
        if (mounted) {
          setError('Unable to load this fortune. Please try again.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    if (!fortuneId) {
      setError('Missing fortune id.');
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    if (!user?.uid) {
      setError('Please sign in to view this fortune.');
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    loadFortune(user.uid, fortuneId);

    return () => {
      mounted = false;
    };
  }, [fortuneId, user?.uid]);

  const pageTitle = useMemo(() => {
    if (fortune) {
      return formatFortuneDate(fortune.createdAt ?? null) || 'Fortune Detail';
    }
    return 'Fortune Detail';
  }, [fortune]);

  return (
    <LinearGradient colors={gradientColors} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
            <Ionicons name="chevron-back" size={22} color="#E9D5FF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {pageTitle}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.centerBlock}>
              <ActivityIndicator size="large" color="#C4B5FD" />
              <Text style={styles.statusText}>Loading your fortune...</Text>
            </View>
          ) : error ? (
            <View style={styles.centerBlock}>
              <Ionicons name="alert-circle" size={20} color="#FCA5A5" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : fortune ? (
            <FortuneResultCard fortune={fortune} parsed={fortune.parsed} />
          ) : null}
        </ScrollView>
      </SafeAreaView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(196, 181, 253, 0.35)',
    backgroundColor: 'rgba(26, 11, 46, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: '#F4F3FF',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  centerBlock: {
    marginTop: 40,
    alignItems: 'center',
    gap: 12,
  },
  statusText: {
    color: '#C4B5FD',
    fontSize: 14,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 14,
    textAlign: 'center',
  },
});
