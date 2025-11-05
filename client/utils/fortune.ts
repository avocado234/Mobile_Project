import type { Timestamp } from 'firebase/firestore';

import type { FortuneDocument, ParsedFortune } from '@/types/fortune';

const SECTION_DEFS = [
  { key: 'love', title: 'Love', patterns: [/^1[\).\s-]*(love|relationship|ความรัก)/i, /\bความรัก\b/i] },
  { key: 'career', title: 'Career', patterns: [/^2[\).\s-]*(career|work|การงาน)/i, /\bการงาน\b/i] },
  { key: 'finance', title: 'Finance', patterns: [/^3[\).\s-]*(finance|money|การเงิน)/i, /\bการเงิน\b/i] },
  { key: 'health', title: 'Health', patterns: [/^4[\).\s-]*(health|wellness|สุขภาพ)/i, /\bสุขภาพ\b/i] },
] as const;

const TIPS_PATTERNS = [
  /^tips?:?/i,
  /^suggestions?:?/i,
  /^ข้อแนะนำ:?/i,
  /^แนวทาง:?/i,
] as const;

const CAUTION_PATTERNS = [
  /^caveats?:?/i,
  /^warnings?:?/i,
  /^ข้อควรระวัง:?/i,
  /^สิ่งที่ต้องระวัง:?/i,
] as const;

const BULLET_REGEX = /^[-–•\d\)]\s*(.+)$/;

const SECTION_ORDER = SECTION_DEFS.map((s) => s.key);

type SectionKey = (typeof SECTION_ORDER)[number];

type ParseMode = SectionKey | 'tips' | 'cautions' | null;

const normalizeLine = (line: string) =>
  line
    .replace(/\s+/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim();

function detectSection(line: string): SectionKey | null {
  for (const def of SECTION_DEFS) {
    if (def.patterns.some((pattern) => pattern.test(line))) {
      return def.key;
    }
  }
  return null;
}

function stripSectionHeading(line: string, key: SectionKey): string {
  const def = SECTION_DEFS.find((item) => item.key === key);
  if (!def) return line;
  for (const pattern of def.patterns) {
    const match = line.match(pattern);
    if (match) {
      return line.slice(match[0].length).trim();
    }
  }
  return line.trim();
}

function matchesAny(line: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(line));
}

export function parseFortuneAnswer(answer: string): ParsedFortune {
  const buffers: Record<SectionKey, string[]> = {
    love: [],
    career: [],
    finance: [],
    health: [],
  };
  const tips: string[] = [];
  const cautions: string[] = [];

  const lines = answer.split(/\r?\n/);
  let mode: ParseMode = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (matchesAny(line, TIPS_PATTERNS)) {
      mode = 'tips';
      continue;
    }
    if (matchesAny(line, CAUTION_PATTERNS)) {
      mode = 'cautions';
      continue;
    }

    const sectionKey = detectSection(line);
    if (sectionKey) {
      mode = sectionKey;
      const content = stripSectionHeading(line, sectionKey);
      if (content) {
        buffers[sectionKey].push(content);
      }
      continue;
    }

    const bulletMatch = line.match(BULLET_REGEX);
    if (mode === 'tips') {
      tips.push(normalizeLine(bulletMatch ? bulletMatch[1] : line));
      continue;
    }
    if (mode === 'cautions') {
      cautions.push(normalizeLine(bulletMatch ? bulletMatch[1] : line));
      continue;
    }
    if (mode && SECTION_ORDER.includes(mode)) {
      const key = mode as SectionKey;
      buffers[key].push(normalizeLine(line));
      continue;
    }

    // Fallback: place stray lines in love section
    buffers.love.push(normalizeLine(line));
  }

  const sections = SECTION_ORDER
    .map((key) => ({
      key,
      title: SECTION_DEFS.find((def) => def.key === key)?.title ?? key,
      content: buffers[key].join('\n'),
    }))
    .filter((section) => section.content.trim().length > 0);

  return {
    sections,
    tips: tips.filter(Boolean),
    cautions: cautions.filter(Boolean),
    raw: answer,
  };
}

export function createFortunePreview(parsed: ParsedFortune, maxChars = 160): string {
  const joined = [
    ...parsed.sections.map((section) => `${section.title}: ${section.content}`),
    parsed.tips.length ? `Tips: ${parsed.tips.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' • ');

  if (joined.length <= maxChars) {
    return joined;
  }
  return `${joined.slice(0, maxChars).trimEnd()}…`;
}

export function enrichFortuneRecord(fortune: FortuneDocument): FortuneDocument & {
  parsed: ParsedFortune;
  preview: string;
} {
  const parsed = parseFortuneAnswer(fortune.answer ?? '');
  return {
    ...fortune,
    parsed,
    preview: createFortunePreview(parsed),
  };
}

export function formatFortuneDate(
  value?: Timestamp | Date | string | number | null,
  locale?: string
): string {
  if (!value) return '';

  let date: Date | null = null;
  if (value && typeof (value as any).toDate === 'function') {
    date = (value as Timestamp).toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    const maybe = new Date(value);
    if (!Number.isNaN(maybe.getTime())) {
      date = maybe;
    }
  } else if (
    typeof value === 'object' &&
    value &&
    'seconds' in (value as any) &&
    'nanoseconds' in (value as any)
  ) {
    const seconds = Number((value as any).seconds);
    const nanos = Number((value as any).nanoseconds) / 1e6;
    date = new Date((seconds * 1000) + nanos);
  }

  if (!date) return '';
  try {
    return date.toLocaleString(locale ?? undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return date.toISOString();
  }
}
