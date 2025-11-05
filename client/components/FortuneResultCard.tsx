import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';

import type { FortuneDocument, FortuneLineSummary, ParsedFortune } from '@/types/fortune';
import {
  createFortunePreview,
  formatFortuneDate,
  parseFortuneAnswer,
} from '@/utils/fortune';

const cardGradient = ['rgba(167, 139, 250, 0.20)', 'rgba(196, 181, 253, 0.08)'] as const;

type FortuneResultCardProps = {
  fortune: FortuneDocument;
  parsed?: ParsedFortune;
  showSummary?: boolean;
  headerLabel?: string;
};

export function FortuneResultCard({
  fortune,
  parsed,
  showSummary = true,
  headerLabel = 'Fortune Insight',
}: FortuneResultCardProps) {
  const derivedParsed = parsed ?? parseFortuneAnswer(fortune.answer ?? '');

  return (
    <LinearGradient colors={cardGradient} style={styles.resultCard}>
      <View style={styles.headerRow}>
        <Ionicons name="sparkles-outline" size={20} color="#F4F3FF" />
        <Text style={styles.headerText}>{headerLabel}</Text>
      </View>

      <View style={styles.metaRow}>
        {fortune.createdAt ? (
          <MetaChip icon="time-outline" text={formatFortuneDate(fortune.createdAt)} />
        ) : null}
        {fortune.period_text?.th || fortune.period ? (
          <MetaChip
            icon="calendar-outline"
            text={fortune.period_text?.th ?? fortune.period ?? ''}
          />
        ) : null}
        {fortune.language ? (
          <MetaChip icon="globe-outline" text={fortune.language.toUpperCase()} />
        ) : null}
        {fortune.style ? <MetaChip icon="color-wand-outline" text={fortune.style} /> : null}
      </View>

      <View style={styles.sectionGroup}>
        {derivedParsed.sections.map((section) => (
          <View key={section.key} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.content.split(/\n+/).map((paragraph, idx) => (
              <Text key={idx} style={styles.sectionText}>
                {paragraph.trim()}
              </Text>
            ))}
          </View>
        ))}
      </View>

      {derivedParsed.tips.length ? (
        <View style={styles.bulletGroup}>
          <Text style={styles.bulletTitle}>Practical Tips</Text>
          {derivedParsed.tips.map((tip, idx) => (
            <BulletRow key={idx} text={tip} />
          ))}
        </View>
      ) : null}

      {derivedParsed.cautions.length ? (
        <View style={styles.bulletGroup}>
          <Text style={styles.bulletTitle}>Cautions</Text>
          {derivedParsed.cautions.map((caution, idx) => (
            <BulletRow key={idx} text={caution} tone="warning" />
          ))}
        </View>
      ) : null}

      {showSummary && fortune.summary ? (
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryTitle}>Line Summary</Text>
          {renderLineSummary('Life line', fortune.summary.life)}
          {renderLineSummary('Head line', fortune.summary.head)}
          {renderLineSummary('Heart line', fortune.summary.heart)}
        </View>
      ) : null}
    </LinearGradient>
  );
}

type FortuneSummaryCardProps = {
  fortune: FortuneDocument;
  parsed?: ParsedFortune;
  previewText?: string;
  onPress?: (event: GestureResponderEvent) => void;
};

export function FortuneSummaryCard({
  fortune,
  parsed,
  previewText,
  onPress,
}: FortuneSummaryCardProps) {
  const derivedParsed = parsed ?? parseFortuneAnswer(fortune.answer ?? '');
  const preview = previewText ?? createFortunePreview(derivedParsed);

  const content = (
    <LinearGradient colors={cardGradient} style={styles.summaryContent}>
      <View style={styles.summaryHeader}>
        <View style={styles.summaryHeaderLeft}>
          <Ionicons name="sparkles-outline" size={18} color="#F4F3FF" />
          <Text style={styles.summaryDate}>
            {formatFortuneDate(fortune.createdAt) || 'Recent fortune'}
          </Text>
        </View>
        <View style={styles.summaryChipRow}>
          {fortune.language ? (
            <MetaChip small text={fortune.language.toUpperCase()} />
          ) : null}
          {fortune.style ? <MetaChip small text={fortune.style} /> : null}
        </View>
      </View>
      <Text style={styles.previewText} numberOfLines={3}>
        {preview}
      </Text>
    </LinearGradient>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.summaryCard} accessibilityRole="button">
        {content}
      </Pressable>
    );
  }

  return <View style={styles.summaryCard}>{content}</View>;
}

function MetaChip({
  text,
  icon,
  small = false,
}: {
  text: string;
  icon?: keyof typeof Ionicons.glyphMap;
  small?: boolean;
}) {
  return (
    <View style={[styles.metaChip, small && styles.metaChipSmall]}>
      {icon ? <Ionicons name={icon} size={small ? 12 : 14} color="#E9D5FF" /> : null}
      <Text style={[styles.metaText, small && styles.metaTextSmall]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function BulletRow({ text, tone = 'default' }: { text: string; tone?: 'default' | 'warning' }) {
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.bulletDot, tone === 'warning' && styles.bulletDotWarning]} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function renderLineSummary(label: string, summary?: FortuneLineSummary) {
  if (!summary) return null;
  const { length_px: length, branch_style: branch } = summary || {};
  if (length == null && !branch) return null;
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>
        {[
          length != null ? `length: ${Math.round(length)}` : null,
          branch ? `branch: ${branch}` : null,
        ]
          .filter(Boolean)
          .join(' • ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  resultCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.35)',
    backgroundColor: 'rgba(26, 11, 46, 0.68)',
    padding: 20,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerText: {
    color: '#F4F3FF',
    fontSize: 18,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196, 181, 253, 0.38)',
    backgroundColor: 'rgba(139, 92, 246, 0.18)',
  },
  metaChipSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaText: {
    color: '#E9D5FF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  metaTextSmall: {
    fontSize: 11,
  },
  sectionGroup: {
    gap: 16,
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionText: {
    color: '#E0E7FF',
    fontSize: 14,
    lineHeight: 20,
  },
  bulletGroup: {
    gap: 8,
  },
  bulletTitle: {
    color: '#F4F3FF',
    fontSize: 15,
    fontWeight: '700',
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    backgroundColor: '#C4B5FD',
  },
  bulletDotWarning: {
    backgroundColor: '#F97316',
  },
  bulletText: {
    flex: 1,
    color: '#E0E7FF',
    fontSize: 13,
    lineHeight: 20,
  },
  summaryBlock: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(167, 139, 250, 0.35)',
    gap: 6,
  },
  summaryTitle: {
    color: '#C4B5FD',
    fontSize: 13,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  summaryLabel: {
    width: 78,
    color: '#C4B5FD',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryValue: {
    flex: 1,
    color: '#E0E7FF',
    fontSize: 12,
    lineHeight: 18,
  },
  summaryCard: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  summaryContent: {
    padding: 18,
    gap: 12,
    borderRadius: 22,
    backgroundColor: 'rgba(26, 11, 46, 0.62)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.28)',
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryDate: {
    color: '#E9D5FF',
    fontSize: 13,
    fontWeight: '600',
  },
  summaryChipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  previewText: {
    color: '#F9FAFB',
    fontSize: 14,
    lineHeight: 20,
  },
});
