// 线路轨迹：支持全屏高颜值离线矢量拓扑轨迹图（SVG）与原生地图底图（Google Maps）双模切换。
// 解决国内机型/模拟器无 GMS 导致的地图空白问题，同时修复全屏 Modal 状态栏安全区重复 Padding 错位。
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { PROVIDER_GOOGLE, Marker, Polyline as MapPolyline } from 'react-native-maps';
import Svg, { Circle, Polyline as SvgPolyline, Text as SvgText, G, Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import { formatTime, formatDuration, isPlaceholderName } from '../utils/stats';
import ModeIcon from '../components/ModeIcon';
import { radius, shadow } from '../theme';

// 过滤仅保留有效坐标点
function validPoints(records) {
  return (records || []).filter(r => r.lat != null && r.lng != null && Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

// 原始地图初始视野计算
function regionOf(pts) {
  const lats = pts.map(p => p.lat);
  const lngs = pts.map(p => p.lng);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const latDelta = Math.max((Math.max(...lats) - Math.min(...lats)) * 1.4, 0.01);
  const lngDelta = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.4, 0.01);
  return { latitude: lat, longitude: lng, latitudeDelta: latDelta, longitudeDelta: lngDelta };
}

// 将经纬度点投影映射到 SVG 拓扑画布二维相对坐标（支持自适应缩放与点重合防坍缩）
function projectPoints(pts, width, height) {
  if (!pts || !pts.length || width <= 0 || height <= 0) return [];
  const padX = 52;
  const padY = 46;

  if (pts.length === 1) {
    return [{ ...pts[0], x: width / 2, y: height / 2 }];
  }

  const lats = pts.map(p => p.lat);
  const lngs = pts.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

  const innerW = Math.max(20, width - padX * 2);
  const innerH = Math.max(20, height - padY * 2);

  const dLat = maxLat - minLat;
  const dLng = maxLng - minLng;

  const hasSpanLng = dLng > 0.00005;
  const hasSpanLat = dLat > 0.00005;

  let scale = 1;
  if (hasSpanLng && hasSpanLat) {
    scale = Math.min(innerW / dLng, innerH / dLat);
  } else if (hasSpanLng) {
    scale = innerW / dLng;
  } else if (hasSpanLat) {
    scale = innerH / dLat;
  }

  const actualW = dLng * scale;
  const actualH = dLat * scale;
  const startX = padX + (innerW - actualW) / 2;
  const startY = padY + (innerH - actualH) / 2;

  return pts.map((p, i) => {
    // 经度自西向东递增 (x+)，纬度自南向北递增（画布 y 轴向下，故取 maxLat - lat）
    const x = hasSpanLng ? startX + (p.lng - minLng) * scale : width / 2;
    const y = hasSpanLat
      ? startY + (maxLat - p.lat) * scale
      : height / 2 + (i - (pts.length - 1) / 2) * 44;
    return { ...p, x, y };
  });
}

export default function RouteMapScreen({ visible, onClose, tripRecords }) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const mapRef = useRef(null);

  // 模式切换：默认使用 100% 离线、无需 GMS 的「矢量轨迹拓扑图」；可一键切为「地图底图」
  const [viewMode, setViewMode] = useState('trajectory'); // 'trajectory' | 'map'
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [activeStopIndex, setActiveStopIndex] = useState(null);

  const pts = validPoints(tripRecords);
  const coords = pts.map(p => ({ latitude: p.lat, longitude: p.lng }));

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

  const first = pts[0];
  const last = pts[pts.length - 1];
  const spanSec = pts.length > 1 ? Math.max(0, (pts[pts.length - 1].timestamp - pts[0].timestamp) / 1000) : 0;

  const projected = useMemo(
    () => projectPoints(pts, canvasSize.width, canvasSize.height),
    [pts, canvasSize]
  );
  const pointsString = projected.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.screen}>
        {/* 顶部导航栏：采用 statusBarTranslucent 沉浸式，严谨适配状态栏高度 */}
        <View style={[styles.nav, { paddingTop: insets.top + (Platform.OS === 'android' ? 6 : 0) }]}>
          <TouchableOpacity
            style={styles.back}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </TouchableOpacity>

          {/* 顶栏分段切换胶囊：轨迹拓扑 / 卫星底图 */}
          <View style={styles.tabToggle}>
            <TouchableOpacity
              style={[styles.tabBtn, viewMode === 'trajectory' && styles.tabBtnActive]}
              onPress={() => setViewMode('trajectory')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="git-commit-outline"
                size={14}
                color={viewMode === 'trajectory' ? colors.primaryStrong : colors.ink2}
              />
              <Text style={[styles.tabText, viewMode === 'trajectory' && styles.tabTextActive]}>
                {t('map.trajectory')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, viewMode === 'map' && styles.tabBtnActive]}
              onPress={() => setViewMode('map')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="map-outline"
                size={14}
                color={viewMode === 'map' ? colors.primaryStrong : colors.ink2}
              />
              <Text style={[styles.tabText, viewMode === 'map' && styles.tabTextActive]}>
                {t('map.satellite')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.back} />
        </View>

        {pts.length < 2 ? (
          <View style={styles.empty}>
            <View style={styles.emptyRing}>
              <Ionicons name="map-outline" size={32} color={colors.primary} />
            </View>
            <Text style={styles.emptyText}>{t('map.noData')}</Text>
          </View>
        ) : viewMode === 'trajectory' ? (
          /* 模式 A：高颜值离线矢量拓扑轨迹（无需 GMS，不卡死、不空白） */
          <View style={styles.contentWrap}>
            {/* 上半部分：SVG 相对地理轨迹投影画布 */}
            <View
              style={styles.canvasContainer}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                if (width > 0 && height > 0) setCanvasSize({ width, height });
              }}
            >
              {canvasSize.width > 0 && canvasSize.height > 0 && (
                <Svg width={canvasSize.width} height={canvasSize.height}>
                  {/* 底层发光轨道线 */}
                  <SvgPolyline
                    points={pointsString}
                    stroke={colors.primarySoft}
                    strokeWidth={8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* 主轨迹连线 */}
                  <SvgPolyline
                    points={pointsString}
                    stroke={colors.primary}
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* 站点节点与标签 */}
                  {projected.map((p, i) => {
                    const isFirst = i === 0;
                    const isLast = i === projected.length - 1;
                    const isSelected = activeStopIndex === i;
                    const label = isPlaceholderName(p.locationName) ? t('common.unnamed') : p.locationName;
                    const timeStr = formatTime(p.timestamp);

                    // 避免文字与节点重叠：奇偶左右错开
                    const alignRight = i % 2 === 1;
                    const labelX = alignRight ? p.x - 14 : p.x + 14;
                    const textAnchor = alignRight ? 'end' : 'start';

                    return (
                      <G key={p.id || i}>
                        {/* 选中光环 */}
                        {isSelected && (
                          <Circle
                            cx={p.x}
                            cy={p.y}
                            r={14}
                            fill={colors.primarySoft}
                            opacity={0.8}
                          />
                        )}

                        {/* 节点圆形 */}
                        {isFirst ? (
                          <>
                            <Circle cx={p.x} cy={p.y} r={9} fill={colors.primaryStrong} />
                            <Circle cx={p.x} cy={p.y} r={3.5} fill="#FFFFFF" />
                          </>
                        ) : isLast ? (
                          <>
                            <Circle cx={p.x} cy={p.y} r={8.5} fill={colors.primary} />
                            <Circle cx={p.x} cy={p.y} r={3} fill="#FFFFFF" />
                          </>
                        ) : (
                          <Circle
                            cx={p.x}
                            cy={p.y}
                            r={5.5}
                            fill={colors.surface}
                            stroke={colors.primary}
                            strokeWidth={2.5}
                          />
                        )}

                        {/* 节点名称与时刻 */}
                        <SvgText
                          x={labelX}
                          y={p.y - 4}
                          fontSize={12}
                          fontWeight="700"
                          fill={isFirst || isLast ? colors.primaryStrong : colors.ink}
                          textAnchor={textAnchor}
                        >
                          {label}
                        </SvgText>
                        <SvgText
                          x={labelX}
                          y={p.y + 10}
                          fontSize={10}
                          fontWeight="500"
                          fill={colors.ink3}
                          textAnchor={textAnchor}
                        >
                          {timeStr}
                        </SvgText>
                      </G>
                    );
                  })}
                </Svg>
              )}

              {/* 右上方正北指北针标识 */}
              <View style={styles.compassBadge}>
                <Ionicons name="navigate" size={12} color={colors.primary} />
                <Text style={styles.compassText}>N</Text>
              </View>
            </View>

            {/* 下半部分：沿途站点明细纵向列表（可滚动） */}
            <View style={styles.stopsListWrap}>
              <Text style={styles.stopsListTitle}>
                {t('timeline.title')} · {pts.length} {t('history.stops', { n: '' })}
              </Text>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stopsScroll}>
                {pts.map((p, i) => {
                  const isFirst = i === 0;
                  const isLast = i === pts.length - 1;
                  const prev = i > 0 ? pts[i - 1] : null;
                  const legSec = prev ? Math.max(0, (p.timestamp - prev.timestamp) / 1000) : 0;
                  const label = isPlaceholderName(p.locationName) ? t('common.unnamed') : p.locationName;
                  const isSelected = activeStopIndex === i;

                  return (
                    <TouchableOpacity
                      key={p.id || i}
                      style={[styles.stopItem, isSelected && styles.stopItemSelected]}
                      onPress={() => setActiveStopIndex(isSelected ? null : i)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.stopLeftCol}>
                        <View style={[styles.stopIndexDot, isFirst && styles.stopIndexDotFirst, isLast && styles.stopIndexDotLast]}>
                          <Text style={[styles.stopIndexText, (isFirst || isLast) && styles.stopIndexTextWhite]}>
                            {i + 1}
                          </Text>
                        </View>
                        {!isLast && <View style={styles.stopConnectLine} />}
                      </View>

                      <View style={styles.stopInfoCol}>
                        <View style={styles.stopNameRow}>
                          <Text style={[styles.stopName, (isFirst || isLast) && styles.stopNameHighlight]} numberOfLines={1}>
                            {label}
                          </Text>
                          <Text style={styles.stopTimeText}>{formatTime(p.timestamp)}</Text>
                        </View>

                        {legSec > 0 && (
                          <View style={styles.legMetaRow}>
                            <ModeIcon mode={p.mode || 'walk'} size={12} color={colors.ink3} />
                            <Text style={styles.legMetaText}>
                              +{formatDuration(legSec, lang)}
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        ) : (
          /* 模式 B：Google 原生底图模式（具备 GMS 框架时使用） */
          <View style={styles.mapWrap}>
            <View style={styles.gmsBanner}>
              <Ionicons name="information-circle-outline" size={14} color={colors.ink2} />
              <Text style={styles.gmsBannerText} numberOfLines={1}>
                {t('map.gmsNotice')}
              </Text>
              <TouchableOpacity onPress={() => setViewMode('trajectory')}>
                <Text style={styles.gmsBannerAction}>{t('map.trajectory')}</Text>
              </TouchableOpacity>
            </View>

            <MapView
              ref={mapRef}
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              userInterfaceStyle={isDark ? 'dark' : 'light'}
              initialRegion={regionOf(pts)}
              onMapReady={fitRegion}
            >
              <MapPolyline coordinates={coords} strokeColor={colors.primary} strokeWidth={4} />
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
          </View>
        )}

        {/* 底部小结栏：紧凑居底，具有明确的表面色与发丝边框 */}
        {pts.length >= 2 && (
          <View style={[styles.summary, { paddingBottom: insets.bottom + 8 }]}>
            <Text style={styles.summaryTextMain}>
              {t('map.start')} {first ? formatTime(first.timestamp) : '—'} · {t('map.end')} {last ? formatTime(last.timestamp) : '—'}
            </Text>
            <Text style={styles.summaryTextSub}>
              {t('map.stops', { n: pts.length })} · {formatDuration(spanSec, lang)}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  // 顶部导航栏
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  back: { width: 40, height: 38, alignItems: 'center', justifyContent: 'center' },

  // 模式切换胶囊
  tabToggle: {
    flexDirection: 'row',
    backgroundColor: colors.chip,
    borderRadius: radius.sm,
    padding: 3,
    gap: 4,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm - 3,
  },
  tabBtnActive: {
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink2,
  },
  tabTextActive: {
    color: colors.primaryStrong,
    fontWeight: '700',
  },

  contentWrap: { flex: 1 },

  // SVG 画布容器
  canvasContainer: {
    height: 250,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    position: 'relative',
    overflow: 'hidden',
  },
  compassBadge: {
    position: 'absolute',
    top: 12,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.chip,
  },
  compassText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.ink2,
  },

  // 站点明细列表
  stopsListWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  stopsListTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink3,
    marginBottom: 8,
    marginLeft: 4,
  },
  stopsScroll: {
    paddingBottom: 80,
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
  },
  stopItemSelected: {
    backgroundColor: colors.primarySoft,
  },
  stopLeftCol: {
    alignItems: 'center',
    width: 28,
    marginRight: 10,
  },
  stopIndexDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  stopIndexDotFirst: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primaryStrong,
  },
  stopIndexDotLast: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stopIndexText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.ink2,
  },
  stopIndexTextWhite: {
    color: '#FFFFFF',
  },
  stopConnectLine: {
    width: 2,
    height: 28,
    backgroundColor: colors.line,
    marginVertical: 2,
  },
  stopInfoCol: {
    flex: 1,
  },
  stopNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  stopName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    flex: 1,
    marginRight: 8,
  },
  stopNameHighlight: {
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  stopTimeText: {
    fontSize: 12,
    color: colors.ink3,
    fontWeight: '500',
  },
  legMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  legMetaText: {
    fontSize: 11,
    color: colors.ink3,
  },

  // MapView 容器与提示条
  mapWrap: { flex: 1 },
  map: { flex: 1 },
  gmsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primarySoft,
    gap: 6,
  },
  gmsBannerText: {
    fontSize: 11,
    color: colors.ink2,
    flex: 1,
  },
  gmsBannerAction: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryStrong,
  },

  // 底部小结
  summary: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 3,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    ...shadow.sm,
  },
  summaryTextMain: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  summaryTextSub: {
    fontSize: 12,
    color: colors.ink2,
    textAlign: 'center',
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyRing: {
    width: 74,
    height: 74,
    borderRadius: 37,
    marginBottom: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: 15, color: colors.ink2, textAlign: 'center', lineHeight: 22 },
});
