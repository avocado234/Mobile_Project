import { doc, getDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import type { FortuneDocument } from '@/types/fortune';

export async function fetchFortune(
  userId: string,
  fortuneId: string,
): Promise<FortuneDocument | null> {
  if (!userId || !fortuneId) return null;
  const ref = doc(db, 'users', userId, 'fortunes', fortuneId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return null;
  }
  const payload = snapshot.data() as Record<string, unknown>;

  const answer =
    (payload.answer as string | undefined)
    ?? (payload.predictionText as string | undefined)
    ?? '';

  return {
    id: snapshot.id,
    answer,
    createdAt: payload.createdAt as any,
    language: (payload.language as string | undefined) ?? (payload.result as any)?.language ?? '',
    style: (payload.style as string | undefined) ?? '',
    period: (payload.period as string | undefined) ?? '',
    period_text: (payload.period_text as FortuneDocument['period_text']) ?? null,
    summary: (payload.summary as FortuneDocument['summary']) ?? null,
    model: (payload.model as string | undefined) ?? undefined,
    user_profile_used: (payload.user_profile_used as Record<string, unknown> | undefined) ?? undefined,
    features: (payload.features as Record<string, unknown> | undefined) ?? undefined,
  };
}

export async function fetchFortuneOrFallback(
  userId: string,
  fortuneId: string,
  fallback: Pick<FortuneDocument, 'id' | 'answer'> & Partial<FortuneDocument>,
): Promise<FortuneDocument> {
  const doc = await fetchFortune(userId, fortuneId);
  if (doc) return doc;
  return { ...fallback };
}
