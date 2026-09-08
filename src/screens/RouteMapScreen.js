// 线路轨迹：现代探索拓扑图（Metro / Transit 工业探索美学）与原生地图底图（Google Maps）双模切换
// 彻底解决旧版大白屏单薄折线问题，支持科技微网格底纹、渐变呼吸轨道、立体气泡、耗时胶囊与 6:4 黄金分割抽屉
import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { PROVIDER_GOOGLE, Marker, Polyline as MapPolyline } from 'react-native-maps';
import Svg, {
  Circle,
  Polyline as SvgPolyline,
  G,
  Line,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n/LanguageContext';
import { formatTime, formatDuration, isPlaceholderName } from '../utils/stats';
import ModeIcon from '../components/ModeIcon';
import { radius, shadow } from '../theme';

// 过滤仅保留有效坐标点
function validPoints(records) {
  return (records || []).filter(
    r => r.lat != null && r.lng != null && Number.isFinite(r.lat) && Number.isFinite(r.lng)
  );
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

// Haversine 两点地表距离计算（单位：米）
function getDistanceMeters(p1, p2) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (p2.lat - p1.lat) * rad;
  const dLng = (p2.lng - p1.lng) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1.lat * rad) * Math.cos(p2.lat * rad) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 计算总路程（单位：公里）
function calculateTotalDistanceKm(points) {
  if (!points || points.length < 2) return 0;
  let totalMeters = 0;
  for (let i = 1; i < points.length; i++) {
    totalMeters += getDistanceMeters(points[i - 1], points[i]);
  }
  return totalMeters / 1000;
}

// 将经纬度点投影映射到 SVG 拓扑画布二维相对坐标（自适应居中缩放、留足气泡安全区）
function projectPoints(pts, width, height) {
  if (!pts || !pts.length || width <= 0 || height <= 0) return [];
  // 留足边距，确保站点气泡与耗时胶囊不被裁切
  const padX = 72;
  const padY = 56;

  if (pts.length === 1) {
    return [{ ...pts[0], x: width / 2, y: height / 2 }];
  }

  const lats = pts.map(p => p.lat);
  const lngs = pts.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

  const innerW = Math.max(40, width - padX * 2);
  const innerH = Math.max(40, height - padY * 2);

  const dLat = maxLat - minLat;
  const dLng = maxLng - minLng;

  const hasSpanLng = dLng > 0.00008;
  const hasSpanLat = dLat > 0.00008;

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
      : height / 2 + (i - (pts.length - 1) / 2) * 56;
    return { ...p, x, y };
  });
}

// 格式化路程公里数
function formatKm(km) {
  if (km == null || km <= 0) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export default function RouteMapScreen({ visible, onClose, tripRecords }) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const mapRef = useRef(null);

  // 模式切换：默认使用现代探索拓扑图（无需 GMS，视觉现代），可切原生地图底图
  const [viewMode, setViewMode] = useState('trajectory'); // 'trajectory' | 'map'
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [activeStopIndex, setActiveStopIndex] = useState(null);

  const pts = useMemo(() => validPoints(tripRecords), [tripRecords]);
  const coords = useMemo(() => pts.map(p => ({ latitude: p.lat, longitude: p.lng })), [pts]);

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
  const totalKm = useMemo(() => calculateTotalDistanceKm(pts), [pts]);

  // 几何投影点
  const projected = useMemo(
    () => projectPoints(pts, canvasSize.width, canvasSize.height),
    [pts, canvasSize]
  );
  const pointsString = useMemo(
    () => projected.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    [projected]
  );

  // 计算相邻站点的中间点与行进指示微点（用于悬浮耗时胶囊与行进方向微标记）
  const legMetaList = useMemo(() => {
    if (projected.length < 2) return [];
    const legs = [];
    for (let i = 1; i < projected.length; i++) {
      const pPrev = projected[i - 1];
      const pCurr = projected[i];
      const midX = (pPrev.x + pCurr.x) / 2;
      const midY = (pPrev.y + pCurr.y) / 2;
      const legSec = Math.max(0, (pCurr.timestamp - pPrev.timestamp) / 1000);
      const legMeters = getDistanceMeters(pPrev, pCurr);
      const legKm = legMeters / 1000;

      const dx = pCurr.x - pPrev.x;
      const dy = pCurr.y - pPrev.y;

      // 前进方向微点标记（在 35% 与 70% 处）
      const arrowX1 = pPrev.x + dx * 0.35;
      const arrowY1 = pPrev.y + dy * 0.35;
      const arrowX2 = pPrev.x + dx * 0.7;
      const arrowY2 = pPrev.y + dy * 0.7;

      legs.push({
        index: i,
        midX,
        midY,
        legSec,
        legKm,
        mode: pCurr.mode || 'walk',
        arrow1: { x: arrowX1, y: arrowY1 },
        arrow2: { x: arrowX2, y: arrowY2 },
      });
    }
    return legs;
  }, [projected]);

  // Blueprint 网格线生成（每 36px 一条虚线）
  const gridLines = useMemo(() => {
    const { width, height } = canvasSize;
    if (width <= 0 || height <= 0) return { hLines: [], vLines: [], dots: [] };
    const step = 36;
    const hLines = [];
    const vLines = [];
    const dots = [];

    for (let y = step; y < height; y += step) {
      hLines.push(y);
    }
    for (let x = step; x < width; x += step) {
      vLines.push(x);
    }
    for (let x = step * 2; x < width - step; x += step * 2) {
      for (let y = step * 2; y < height - step; y += step * 2) {
        dots.push({ x, y });
      }
    }
    return { hLines, vLines, dots };
  }, [canvasSize]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.screen}>
        {/* 顶部沉浸式导航栏 */}
        <View style={[styles.nav, { paddingTop: insets.top + (Platform.OS === 'android' ? 6 : 0) }]}>
          <TouchableOpacity
            style={styles.back}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </TouchableOpacity>

          {/* 顶栏切换胶囊：探索拓扑 / 高精底图 */}
          <View style={styles.tabToggle}>
            <TouchableOpacity
              style={[styles.tabBtn, viewMode === 'trajectory' && styles.tabBtnActive]}
              onPress={() => setViewMode('trajectory')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="git-network-outline"
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
              <Ionicons name="git-network-outline" size={34} color={colors.primary} />
            </View>
            <Text style={styles.emptyText}>{t('map.noData')}</Text>
          </View>
        ) : viewMode === 'trajectory' ? (
          /* 模式 A：现代探索拓扑图（方案 A 工业探索美学） */
          <View style={styles.contentWrap}>
            {/* 上半部：SVG 拓扑探索舞台（占约 58% 高度） */}
            <View
              style={styles.canvasContainer}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                if (width > 0 && height > 0) setCanvasSize({ width, height });
              }}
            >
              {canvasSize.width > 0 && canvasSize.height > 0 && (
                <Svg width={canvasSize.width} height={canvasSize.height} style={StyleSheet.absoluteFill}>
                  <Defs>
                    {/* 渐变流体主轨道：翡翠绿起点 -> 珊瑚橙品牌色 -> 亮橙红终点 */}
                    <LinearGradient id="trackGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <Stop offset="0%" stopColor={colors.success || '#4CAE7F'} />
                      <Stop offset="55%" stopColor={colors.primary} />
                      <Stop offset="100%" stopColor={colors.primaryStrong} />
                    </LinearGradient>
                  </Defs>

                  {/* 1. Blueprint 科技微网格底纹（消灭大白屏空洞感） */}
                  {gridLines.hLines.map((y, idx) => (
                    <Line
                      key={`hl-${idx}`}
                      x1={0}
                      y1={y}
                      x2={canvasSize.width}
                      y2={y}
                      stroke={colors.line}
                      strokeWidth={1}
                      strokeDasharray="2, 4"
                      opacity={isDark ? 0.35 : 0.6}
                    />
                  ))}
                  {gridLines.vLines.map((x, idx) => (
                    <Line
                      key={`vl-${idx}`}
                      x1={x}
                      y1={0}
                      x2={x}
                      y2={canvasSize.height}
                      stroke={colors.line}
                      strokeWidth={1}
                      strokeDasharray="2, 4"
                      opacity={isDark ? 0.35 : 0.6}
                    />
                  ))}
                  {/* 交叉点测绘微点阵 */}
                  {gridLines.dots.map((dot, idx) => (
                    <Circle
                      key={`dot-${idx}`}
                      cx={dot.x}
                      cy={dot.y}
                      r={1.5}
                      fill={colors.ink3}
                      opacity={0.3}
                    />
                  ))}

                  {/* 2. 双层流体轨道线 */}
                  {/* 外层半透明呼吸光晕带 */}
                  <SvgPolyline
                    points={pointsString}
                    stroke={isDark ? 'rgba(255, 107, 107, 0.22)' : 'rgba(255, 107, 107, 0.18)'}
                    strokeWidth={14}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* 核心主轨道渐变线 */}
                  <SvgPolyline
                    points={pointsString}
                    stroke="url(#trackGrad)"
                    strokeWidth={4.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* 3. 沿途前进方向微指示（两小圆点） */}
                  {legMetaList.map((leg, idx) => (
                    <G key={`arrows-${idx}`}>
                      <Circle cx={leg.arrow1.x} cy={leg.arrow1.y} r={2.2} fill="#FFFFFF" opacity={0.9} />
                      <Circle cx={leg.arrow2.x} cy={leg.arrow2.y} r={2.2} fill="#FFFFFF" opacity={0.9} />
                    </G>
                  ))}

                  {/* 4. 底层站点选中光环 */}
                  {projected.map((p, i) => {
                    const isSelected = activeStopIndex === i;
                    return isSelected ? (
                      <Circle
                        key={`sel-${i}`}
                        cx={p.x}
                        cy={p.y}
                        r={20}
                        fill={colors.primarySoft}
                        opacity={0.7}
                      />
                    ) : null;
                  })}
                </Svg>
              )}

              {/* 5. 悬浮覆盖层：立体站点气泡卡片 */}
              {projected.map((p, i) => {
                const isFirst = i === 0;
                const isLast = i === projected.length - 1;
                const isSelected = activeStopIndex === i;
                const label = isPlaceholderName(p.locationName) ? t('common.unnamed') : p.locationName;
                const timeStr = formatTime(p.timestamp);

                // 奇偶错落排列防遮挡
                const isOdd = i % 2 === 1;
                const bubbleStyle = [
                  styles.stopBubble,
                  isFirst && styles.stopBubbleStart,
                  isLast && styles.stopBubbleEnd,
                  isSelected && styles.stopBubbleActive,
                  {
                    left: p.x,
                    top: p.y,
                    transform: [
                      { translateX: isOdd ? -110 : 12 },
                      { translateY: -22 },
                    ],
                  },
                ];

                return (
                  <TouchableOpacity
                    key={p.id || i}
                    style={bubbleStyle}
                    activeOpacity={0.8}
                    onPress={() => setActiveStopIndex(isSelected ? null : i)}
                  >
                    <View style={styles.bubbleIconWrap}>
                      {isFirst ? (
                        <Text style={styles.bubbleEmoji}>🚩</Text>
                      ) : isLast ? (
                        <Text style={styles.bubbleEmoji}>🏁</Text>
                      ) : (
                        <ModeIcon mode={p.mode || 'walk'} size={13} color={colors.primaryStrong} />
                      )}
                    </View>
                    <View style={styles.bubbleTextWrap}>
                      <Text
                        style={[
                          styles.bubbleName,
                          (isFirst || isLast) && styles.bubbleNameBold,
                          isSelected && { color: colors.primaryStrong },
                        ]}
                        numberOfLines={1}
                      >
                        {label}
                        {isFirst ? ` (${t('map.start')})` : isLast ? ` (${t('map.end')})` : ''}
                      </Text>
                      <Text style={styles.bubbleTime}>
                        {timeStr} · {isFirst ? t('map.depart') : isLast ? t('map.arrive') : t('map.transfer')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* 6. 悬浮覆盖层：两站中点耗时胶囊 */}
              {legMetaList.map((leg) => {
                const durText = formatDuration(leg.legSec, lang);
                return (
                  <View
                    key={`capsule-${leg.index}`}
                    style={[
                      styles.legCapsule,
                      {
                        left: leg.midX,
                        top: leg.midY,
                      },
                    ]}
                  >
                    <ModeIcon mode={leg.mode} size={11} color={colors.ink2} />
                    <Text style={styles.legCapsuleText}>+{durText}</Text>
                  </View>
                );
              })}

              {/* 7. 右上角科技罗盘徽标 */}
              <View style={styles.techCompass}>
                <Ionicons name="compass" size={13} color={colors.primary} />
                <Text style={styles.compassText}>N 18°</Text>
              </View>

              {/* 8. 左下角比例尺标尺 */}
              <View style={styles.scaleBar}>
                <View style={styles.scaleLine} />
                <Text style={styles.scaleText}>{t('map.scale')}</Text>
              </View>
            </View>

            {/* 下半部：6:4 黄金分割半展开流体抽屉 (BottomSheet) */}
            <View style={styles.bottomSheet}>
              {/* 顶部手柄条 */}
              <View style={styles.dragHandle} />

              {/* 行程核心指标卡片：总耗时、预估里程、途径站数 */}
              <View style={styles.tripSummaryCard}>
                <View style={styles.summaryCol}>
                  <Text style={styles.sumValAccent}>
                    {Math.round(spanSec / 60)}{' '}
                    <Text style={styles.sumUnit}>{t('map.minute')}</Text>
                  </Text>
                  <Text style={styles.sumLabel}>{t('map.totalDuration')}</Text>
                </View>

                <View style={styles.summaryColDivider} />

                <View style={styles.summaryCol}>
                  <Text style={styles.sumVal}>
                    {formatKm(totalKm)}
                  </Text>
                  <Text style={styles.sumLabel}>{t('map.estDistance')}</Text>
                </View>

                <View style={styles.summaryColDivider} />

                <View style={styles.summaryCol}>
                  <Text style={styles.sumVal}>
                    {pts.length}{' '}
                    <Text style={styles.sumUnit}>{t('map.stopsUnit')}</Text>
                  </Text>
                  <Text style={styles.sumLabel}>{t('map.stopCount')}</Text>
                </View>
              </View>

              {/* 紧凑沿途站点滚动明细列表 */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.stopsScroll}
              >
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
                      style={[styles.stopRowMini, isSelected && styles.stopRowMiniSelected]}
                      onPress={() => setActiveStopIndex(isSelected ? null : i)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.stopMiniLeft}>
                        {/* 序号徽章 */}
                        <View
                          style={[
                            styles.stopNumBadge,
                            isFirst && styles.stopNumBadgeStart,
                            isLast && styles.stopNumBadgeEnd,
                            isSelected && styles.stopNumBadgeActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.stopNumText,
                              (isFirst || isLast || isSelected) && styles.stopNumTextWhite,
                            ]}
                          >
                            {i + 1}
                          </Text>
                        </View>

                        {/* 站点名称与路段信息 */}
                        <View style={styles.stopTextCol}>
                          <Text
                            style={[
                              styles.stopMiniName,
                              (isFirst || isLast) && styles.stopMiniNameBold,
                              isSelected && { color: colors.primaryStrong },
                            ]}
                            numberOfLines={1}
                          >
                            {label}
                          </Text>
                          {legSec > 0 && (
                            <View style={styles.stopMiniSubRow}>
                              <ModeIcon mode={p.mode || 'walk'} size={11} color={colors.ink3} />
                              <Text style={styles.stopMiniLegText}>
                                +{formatDuration(legSec, lang)}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* 右侧时刻戳 */}
                      <Text style={styles.stopMiniTime}>
                        {formatTime(p.timestamp)}
                      </Text>
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
                const pinColor =
                  i === 0
                    ? colors.success || '#4CAE7F'
                    : i === pts.length - 1
                    ? colors.primaryStrong
                    : colors.primary;
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

            {/* 原生地图模式的底部紧凑汇总 */}
            <View style={[styles.gmsSummary, { paddingBottom: insets.bottom + 8 }]}>
              <Text style={styles.gmsSummaryText}>
                {t('map.start')} {first ? formatTime(first.timestamp) : '—'} · {t('map.end')}{' '}
                {last ? formatTime(last.timestamp) : '—'} · {formatKm(totalKm)}
              </Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (colors, isDark) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
    },

    // 顶部沉浸导航栏
    nav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingBottom: 8,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      zIndex: 30,
    },
    back: {
      width: 40,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },

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
      gap: 5,
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

    // 主容器：划分 6:4 黄金分割
    contentWrap: {
      flex: 1,
    },

    // 上半部分：SVG 拓扑探索舞台（占约 58% 高度）
    canvasContainer: {
      flex: 1.4,
      backgroundColor: colors.bg,
      position: 'relative',
      overflow: 'hidden',
    },

    // 悬浮立体站点气泡
    stopBubble: {
      position: 'absolute',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.line,
      ...shadow.md,
      zIndex: 10,
      maxWidth: 140,
    },
    stopBubbleStart: {
      borderColor: colors.success || '#4CAE7F',
      borderWidth: 1.5,
      backgroundColor: isDark ? 'rgba(76, 174, 127, 0.14)' : '#F2FAF6',
    },
    stopBubbleEnd: {
      borderColor: colors.primaryStrong,
      borderWidth: 1.5,
      backgroundColor: isDark ? 'rgba(242, 78, 78, 0.14)' : colors.primarySofter || '#FFF5F2',
    },
    stopBubbleActive: {
      borderColor: colors.primaryStrong,
      transform: [{ scale: 1.05 }],
      ...shadow.lg,
    },
    bubbleIconWrap: {
      width: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bubbleEmoji: {
      fontSize: 13,
    },
    bubbleTextWrap: {
      flex: 1,
    },
    bubbleName: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.ink,
    },
    bubbleNameBold: {
      fontWeight: '800',
      color: colors.ink,
    },
    bubbleTime: {
      fontSize: 9.5,
      fontWeight: '600',
      color: colors.ink3,
      marginTop: 1,
    },

    // 线上路段耗时小胶囊
    legCapsule: {
      position: 'absolute',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2.5,
      borderWidth: 1,
      borderColor: colors.line,
      transform: [{ translateX: -28 }, { translateY: -12 }],
      ...shadow.sm,
      zIndex: 8,
    },
    legCapsuleText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.primaryStrong,
    },

    // 科技罗盘
    techCompass: {
      position: 'absolute',
      top: 12,
      right: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(38, 32, 25, 0.85)' : 'rgba(255, 255, 255, 0.88)',
      borderWidth: 1,
      borderColor: colors.line,
      ...shadow.sm,
    },
    compassText: {
      fontSize: 10.5,
      fontWeight: '800',
      color: colors.ink2,
    },

    // 比例尺
    scaleBar: {
      position: 'absolute',
      bottom: 12,
      left: 14,
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(38, 32, 25, 0.7)' : 'rgba(255, 255, 255, 0.75)',
    },
    scaleLine: {
      width: 44,
      height: 2,
      backgroundColor: colors.ink3,
      borderLeftWidth: 2,
      borderRightWidth: 2,
      borderLeftColor: colors.ink2,
      borderRightColor: colors.ink2,
    },
    scaleText: {
      fontSize: 9,
      fontWeight: '700',
      color: colors.ink3,
    },

    // 下半部分：现代流体抽屉 (BottomSheet)
    bottomSheet: {
      flex: 1,
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingHorizontal: 16,
      paddingTop: 10,
      ...shadow.md,
      zIndex: 20,
    },
    dragHandle: {
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line,
      alignSelf: 'center',
      marginBottom: 10,
    },

    // 行程概览仪表盘卡片（3列）
    tripSummaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.chip,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.line,
      paddingVertical: 9,
      paddingHorizontal: 6,
      marginBottom: 10,
    },
    summaryCol: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    summaryColDivider: {
      width: 1,
      height: 22,
      backgroundColor: colors.line,
    },
    sumValAccent: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.primaryStrong,
    },
    sumVal: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.ink,
    },
    sumUnit: {
      fontSize: 10.5,
      fontWeight: '600',
    },
    sumLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.ink3,
      marginTop: 2,
    },

    // 沿途站点精简列表
    stopsScroll: {
      paddingBottom: 24,
      gap: 6,
    },
    stopRowMini: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.line,
    },
    stopRowMiniSelected: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    stopMiniLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      flex: 1,
    },
    stopNumBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.chip,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.line,
    },
    stopNumBadgeStart: {
      backgroundColor: colors.success || '#4CAE7F',
      borderColor: colors.success || '#4CAE7F',
    },
    stopNumBadgeEnd: {
      backgroundColor: colors.primaryStrong,
      borderColor: colors.primaryStrong,
    },
    stopNumBadgeActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    stopNumText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.ink2,
    },
    stopNumTextWhite: {
      color: '#FFFFFF',
    },
    stopTextCol: {
      flex: 1,
    },
    stopMiniName: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.ink,
    },
    stopMiniNameBold: {
      fontWeight: '800',
    },
    stopMiniSubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    stopMiniLegText: {
      fontSize: 10,
      color: colors.ink3,
      fontWeight: '500',
    },
    stopMiniTime: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.ink3,
      marginLeft: 8,
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
    gmsSummary: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 10,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      ...shadow.sm,
    },
    gmsSummaryText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.ink,
      textAlign: 'center',
    },

    // 空状态
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
    },
    emptyRing: {
      width: 76,
      height: 76,
      borderRadius: 38,
      marginBottom: 18,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      fontSize: 14.5,
      color: colors.ink2,
      textAlign: 'center',
      lineHeight: 22,
    },
  });
