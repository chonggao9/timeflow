import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRecords, clearAll } from '../storage/store';
import { computePathStats } from '../utils/stats';
import { radius, shadow } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import ModeIcon from '../components/ModeIcon';

const minutes = (sec) => Math.round(sec / 60);

export default function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [stats, setStats] = useState([]);
  const [totalDays, setTotalDays] = useState(0);
  const [totalCheckins, setTotalCheckins] = useState(0);

  useFocusEffect(useCallback(() => {
    (async () => {
      const all = await getRecords();
      setTotalCheckins(all.length);
      const days = new Set(all.map(r => new Date(r.timestamp).toDateString())).size;
      setTotalDays(days);
      setStats(computePathStats(all));
    })();
  }, []));

  const handleClear = () => {
    Alert.alert(t('common.clearTitle'), t('common.clearBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => { await clearAll(); setStats([]); setTotalDays(0); setTotalCheckins(0); }
      },
    ]);
  };

  const sep = t('insights.separator');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Text style={styles.title}>{t('insights.title')}</Text>
        <Text style={styles.subtitle}>{t('insights.subtitle')}</Text>
      </View>

      <View style={styles.overview}>
        <View style={styles.overviewCard}>
          <Text style={styles.overviewNum}>{totalCheckins}</Text>
          <Text style={styles.overviewLabel}>{t('insights.tCheckins')}</Text>
        </View>
        <View style={styles.overviewCard}>
          <Text style={styles.overviewNum}>{totalDays}</Text>
          <Text style={styles.overviewLabel}>{t('insights.tDays')}</Text>
        </View>
        <View style={styles.overviewCard}>
          <Text style={styles.overviewNum}>{stats.length}</Text>
          <Text style={styles.overviewLabel}>{t('insights.tPaths')}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t('insights.section')}</Text>
      {stats.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('insights.empty.title')}</Text>
          <Text style={styles.emptyHint}>{t('insights.empty.hint')}</Text>
        </View>
      ) : (
        stats.map((s, i) => (
          <View key={i} style={styles.pathCard}>
            <View style={styles.pathHead}>
              <View style={styles.pathIcon}>
                <ModeIcon mode={s.mode} size={20} color={colors.primaryStrong} />
              </View>
              <View style={styles.pathRoute}>
                <Text style={styles.pathRouteText} numberOfLines={1}>
                  {s.fromName} <Text style={styles.arrow}>→</Text> {s.toName}
                </Text>
                <Text style={styles.pathSamples}>{t('insights.samples', { n: s.sampleCount })}</Text>
              </View>
            </View>
            <View style={styles.pathStats}>
              <Text style={styles.pathBig}>
                {minutes(s.medianSec)}<Text style={styles.pathBigUnit}> {t('insights.min')}</Text>
              </Text>
              <View style={styles.pathRangeCol}>
                <Text style={styles.pathRangeLabel}>{t('insights.median')}</Text>
                <Text style={styles.pathRange}>{t('insights.fast')} {minutes(s.minSec)} {t('insights.min')}{sep}{t('insights.slow')} {minutes(s.maxSec)} {t('insights.min')}</Text>
              </View>
            </View>
          </View>
        ))
      )}

      {totalCheckins > 0 && (
        <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
          <Text style={styles.clearText}>{t('profile.clear')}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },

  header: { paddingHorizontal: 4, marginBottom: 18 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.ink2, marginTop: 4 },

  overview: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  overviewCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md,
    paddingVertical: 16, alignItems: 'center', ...shadow.sm,
  },
  overviewNum: { fontSize: 27, fontWeight: '800', color: colors.primary, letterSpacing: -1 },
  overviewLabel: { fontSize: 11, color: colors.ink3, marginTop: 2 },

  sectionTitle: { fontSize: 13, color: colors.ink2, fontWeight: '700', letterSpacing: 0.4, marginBottom: 10, marginLeft: 4 },

  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, color: colors.ink3 },
  emptyHint: { fontSize: 13, color: colors.ink3, marginTop: 6 },

  pathCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
    marginBottom: 12, ...shadow.sm,
  },
  pathHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  pathIcon: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySofter,
    alignItems: 'center', justifyContent: 'center',
  },
  pathRoute: { flex: 1, minWidth: 0 },
  pathRouteText: { fontSize: 15, color: colors.ink, fontWeight: '700' },
  arrow: { color: colors.primary, fontWeight: '800' },
  pathSamples: { fontSize: 12, color: colors.ink3, marginTop: 2 },

  pathStats: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  pathBig: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: -1, lineHeight: 32 },
  pathBigUnit: { fontSize: 14, fontWeight: '700', color: colors.ink2, letterSpacing: 0 },
  pathRangeCol: { alignItems: 'flex-end' },
  pathRangeLabel: { fontSize: 12, color: colors.ink2, marginBottom: 2 },
  pathRange: { fontSize: 12, color: colors.ink3 },

  clearBtn: { marginTop: 26, alignItems: 'center', paddingVertical: 12 },
  clearText: { fontSize: 13, color: colors.danger, fontWeight: '600' },
});
