import type { Timestamp } from 'firebase/firestore';

export type FortuneLineSummary = {
  length_px?: number;
  branch_style?: string;
} | null;

export type FortuneSummary = {
  life?: FortuneLineSummary;
  head?: FortuneLineSummary;
  heart?: FortuneLineSummary;
} | null;

export type FortunePeriodText = {
  th?: string;
  en?: string;
};

export type FortuneDocument = {
  id: string;
  answer: string;
  createdAt?: Timestamp | Date | null;
  language?: string;
  style?: string;
  period?: string;
  period_text?: FortunePeriodText | null;
  summary?: FortuneSummary;
  model?: string;
  user_profile_used?: Record<string, unknown>;
  features?: Record<string, unknown>;
};

export type ParsedFortune = {
  sections: Array<{ key: string; title: string; content: string }>;
  tips: string[];
  cautions: string[];
  raw: string;
};
