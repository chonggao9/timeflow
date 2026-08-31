// 线路轨迹地图：全屏 Modal，把某次行程的打卡点连成轨迹。
// 核心是「连点成线」，不加 Directions API。坐标可能为 null（定位/反查失败）→ 先过滤有效点。
import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import { formatTime, formatDuration, isPlaceholderName } from '../utils/stats';

// lat/lng 都可能为 null（定位/反查失败）→ 只保留有效坐标点
function validPoints(records) {
  return (records || []).filter(r => r.lat != null && r.lng != null && Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

// 由有效点推一个覆盖全部点的初始视野（fitToCoordinates 前的地图不至于定位到世界某处）
function regionOf(pts) {
  const lats = pts.map(p => p.lat);
  const lngs = pts.map(p => p.lng);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const latDelta = Math.max((Math.max(...lats) - Math.min(...lats)) * 1.4, 0.01);
  const lngDelta = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.4, 0.01);
  return { latitude: lat, longitude: lng, latitudeDelta: latDelta, longitudeDelta: lngDelta };
}

export default function RouteMapScreen({ visible, onClose, tripRecords }) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const mapRef = useRef(null);

  const pts = validPoints(tripRecords);
  const coords = pts.map(p => ({ latitude: p.lat, longitude: p.lng }));

  // 始终持有最新 coords，供 onMapReady 调用（每次打开 Modal，地图重新挂载触发一次）
  const coordsRef = useRef(coords);
  coordsRef.current = coords;
  const fitRegion = () => {
    const c = coordsRef.current;
    if (!mapRef.current || c.length < 2) return;
    mapRef.current.fitToCoordinates(c, {
      edgePadding: { top: 90, bottom: 90, left: 40, right: 40 },
      animated: true,
    });
  };

  // 底部小结：起/终点时刻 + 站点数 + 总时长
  const first = pts[0];
  const last = pts[pts.length - 1];
  const spanSec = pts.length > 1 ? Math.max(0, (pts[pts.length - 1].timestamp - pts[0].timestamp) / 1000) : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={[styles.nav, { paddingTop: insets.top }]}>
          <TouchableOpacity style={styles.back} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>{t('map.title')}</Text>
          <View style={styles.back} />
        </View>

        {pts.length < 2 ? (
          <View style={styles.empty}>
            <View style={styles.emptyRing}>
              <Ionicons name="map-outline" size={32} color={colors.primary} />
            </View>
            <Text style={styles.emptyText}>{t('map.noData')}</Text>
          </View>
        ) : (
          <View style={styles.mapWrap}>
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              userInterfaceStyle={isDark ? 'dark' : 'light'}
              initialRegion={regionOf(pts)}
              onMapReady={fitRegion}
            >
              <Polyline coordinates={coords} strokeColor={colors.primary} strokeWidth={4} />
              {pts.map((p, i) => {
                const label = isPlaceholderName(p.locationName) ? t('common.unnamed') : p.locationName;
                const pinColor = i === 0 ? colors.primaryStrong : (i === pts.length - 1 ? colors.primary : colors.primarySoft);
                return (
                  <Marker
                    key={p.id || i}
                    coordinate={{ latitude: p.lat, longitude: p.lng }}
                    pinColor={pinColor}
                    title={label}
                    description={formatTime(p.timestamp)}
                  />
                );
              })}
            </MapView>
            <View style={[styles.summary, { paddingBottom: insets.bottom + 6 }]}>
              <Text style={styles.summaryText}>
                {t('map.start')} {first ? formatTime(first.timestamp) : '—'} · {t('map.end')} {last ? formatTime(last.timestamp) : '—'}
              </Text>
              <Text style={styles.summaryText}>
                {t('map.stops', { n: pts.length })} · {formatDuration(spanSec, lang)}
              </Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingBottom: 10,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },

  mapWrap: { flex: 1 },
  map: { flex: 1 },
  summary: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 16, paddingTop: 12, gap: 4,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line,
  },
  summaryText: { fontSize: 13, color: colors.ink2, textAlign: 'center' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyRing: {
    width: 74, height: 74, borderRadius: 37, marginBottom: 18,
    backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { fontSize: 15, color: colors.ink2, textAlign: 'center', lineHeight: 22 },
});
