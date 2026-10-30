import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import Timeline from '../../components/Timeline';
import ModeIcon from '../../components/ModeIcon';
import { useTheme } from '../../theme/ThemeContext';
import { useI18n } from '../../i18n/LanguageContext';
import { formatDuration } from '../../utils/stats';
import { setLastMode } from '../../storage/store';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const PRIMARY_MODES = ['walk', 'bike', 'drive', 'taxi', 'subway'];
const MORE_MODES = ['transit', 'train', 'flight', 'boat'];
const ALL_MODES = [...PRIMARY_MODES, ...MORE_MODES];

const MODE_PEEK_SLOTS = 4.4;
const MODE_STRIP_PADDING = 12;
const MODE_GAP = 6;

/**
 * @param {Object} props
 * @param {any[]} props.records
 * @param {any[]} props.trips
 * @param {any} props.estimate
 * @param {number} props.travelCount
 * @param {number} props.travelTripsCount
 * @param {number} props.travelDurationSec
 * @param {string} props.mode
 * @param {(m: string) => void} props.setMode
 * @param {boolean} props.hasActiveTrip
 * @param {string[]} props.commonPlaces
 * @param {boolean} props.loading
 * @param {boolean | 'ended'} props.success
 * @param {Animated.Value} props.checkinScale
 * @param {Animated.Value} props.chargeProgress
 * @param {() => void} props.onCheckinPressIn
 * @param {() => void} props.onCheckinPressOut
 * @param {() => void} props.onCheckinPress
 * @param {() => void} props.onCheckinLongPress
 * @param {() => void} props.onOpenBackfill
 * @param {(record: any) => void} props.onRenamePoint
 * @param {(trip: any) => void} props.onShowMap
 * @param {(trip: any) => void} props.onShowReceipt
 * @param {(record: any) => void} props.onChangeSegmentMode
 * @param {(tripId: string) => void} props.onEndTrip
 * @param {(trip: any) => void} props.onRenameTrip
 * @param {(info: { mode: string }) => void} props.onAddStopBetween
 * @param {(recordId: string, placeName: string) => void} props.onQuickName
 * @param {(id: string) => void} props.onDeleteRecord
 */
export default function TravelScene({
  records,
  trips,
  estimate,
  travelCount,
  travelTripsCount,
  travelDurationSec,
  mode,
  setMode,
  hasActiveTrip,
  commonPlaces,
  loading,
  success,
  checkinScale,
  chargeProgress,
  onCheckinPressIn,
  onCheckinPressOut,
  onCheckinPress,
  onCheckinLongPress,
  onOpenBackfill,
  onRenamePoint,
  onShowMap,
  onShowReceipt,
  onChangeSegmentMode,
  onEndTrip,
  onRenameTrip,
  onAddStopBetween,
  onQuickName,
  onDeleteRecord,
}) {
  const { t, lang } = useI18n();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const { width: winWidth } = useWindowDimensions();
  const modeGeo = useMemo(() => {
    const avail = winWidth - MODE_STRIP_PADDING * 2;
    const slot = avail / MODE_PEEK_SLOTS;
    return { slot, itemW: slot - MODE_GAP };
  }, [winWidth]);

  /** @type {React.MutableRefObject<any>} */
  const modeStripRef = useRef(null);
  const modeStripXRef = useRef(0);
  const [modeStripW, setModeStripW] = useState(0);

  useEffect(() => {
    const idx = ALL_MODES.indexOf(mode);
    if (idx < 0 || !modeStripW) return;
    const left = MODE_STRIP_PADDING + idx * modeGeo.slot;
    const right = left + modeGeo.itemW;
    const x = modeStripXRef.current;
    if (left >= x - 1 && right <= x + modeStripW + 1) return;
    const timer = setTimeout(() => {
      modeStripRef.current?.scrollTo({ x: Math.max(0, idx * modeGeo.slot), animated: true });
    }, 60);
    return () => clearTimeout(timer);
  }, [mode, modeGeo.slot, modeGeo.itemW, modeStripW]);

  return (
    <>
      {/* 行程统计 3 列卡片 */}
      <View style={styles.statsCard}>
        <View style={styles.statsCol}>
          <Text style={styles.statsValue}>{travelCount}</Text>
          <Text style={styles.statsLabel}>{t('home.statCheckins')}</Text>
        </View>
        <View style={[styles.statsCol, styles.statsColBorder]}>
          <Text style={styles.statsValue}>{travelTripsCount}</Text>
          <Text style={styles.statsLabel}>{t('home.statTrips')}</Text>
        </View>
        <View style={styles.statsCol}>
          <Text style={styles.statsValue}>
            {travelCount > 1 ? formatDuration(travelDurationSec, lang) : '--'}
          </Text>
          <Text style={styles.statsLabel}>{t('home.statElapsed')}</Text>
        </View>
      </View>

      {/* 时间轴滚动区 */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Timeline
          records={records}
          trips={trips}
          estimate={estimate}
          onRename={onRenamePoint}
          onShowMap={onShowMap}
          onShowReceipt={onShowReceipt}
          onChangeSegmentMode={onChangeSegmentMode}
          onEndTrip={onEndTrip}
          onRenameTrip={onRenameTrip}
          onAddStopBetween={onAddStopBetween}
          onQuickName={onQuickName}
          onDeleteRecord={onDeleteRecord}
          commonPlaces={commonPlaces}
          hasActiveTrip={hasActiveTrip}
        />
      </ScrollView>

      {/* 底部操作区：出行方式 + 补记 + 打卡 */}
      <View style={styles.bottomComposer}>
        {/* 行程进行中：接下来的出行方式指示标签 */}
        {hasActiveTrip && (
          <View style={styles.nextModeRow}>
            <Ionicons name="arrow-forward-circle-outline" size={13} color={colors.primaryStrong} />
            <Text style={styles.nextModeTitle}>{t('home.nextModeLabel', '接下来的出行方式')}</Text>
          </View>
        )}

        {/* 出行方式横滑条：9 种方式一行排开 */}
        <ScrollView
          ref={modeStripRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.modesStrip}
          contentContainerStyle={styles.modesStripContent}
          scrollEventThrottle={16}
          onScroll={(e) => {
            modeStripXRef.current = e.nativeEvent.contentOffset.x;
          }}
          onLayout={(e) => setModeStripW(e.nativeEvent.layout.width)}
        >
          {ALL_MODES.map((m) => {
            const isSelected = mode === m;
            return (
              <TouchableOpacity
                key={'mode-btn-' + m}
                style={[
                  styles.modeBtn,
                  { width: modeGeo.itemW },
                  isSelected && styles.modeBtnActive,
                ]}
                onPress={async () => {
                  setMode(m);
                  await setLastMode(m);
                }}
                activeOpacity={0.7}
              >
                <ModeIcon mode={m} size={20} color={isSelected ? colors.primaryStrong : colors.ink2} />
                <Text style={[styles.modeBtnText, isSelected && styles.modeBtnTextActive]}>
                  {t('mode.' + m)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* 核心操作行：[+ 补记] 与 [打卡] */}
        <View style={styles.actionBtnRow}>
          {/* 独立补记按钮 */}
          <TouchableOpacity
            style={styles.backfillSquareBtn}
            onPress={onOpenBackfill}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={22} color="#B3302C" />
            <Text style={styles.backfillSquareText}>{t('home.backfill')}</Text>
          </TouchableOpacity>

          {/* 核心打卡主按钮 */}
          <Animated.View style={[{ flex: 1 }, { transform: [{ scale: checkinScale }] }]}>
            <Pressable
              style={[
                styles.checkinMainBtn,
                success === 'ended' && styles.checkinBtnEnded,
                success === true && styles.checkinBtnSuccess,
              ]}
              onPressIn={onCheckinPressIn}
              onPressOut={onCheckinPressOut}
              onPress={onCheckinPress}
              onLongPress={onCheckinLongPress}
              delayLongPress={650}
              disabled={loading || !!success}
            >
              {/* 长按充能内衬 */}
              <Animated.View
                style={[
                  styles.chargeFill,
                  {
                    width: chargeProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                    opacity: chargeProgress.interpolate({
                      inputRange: [0, 0.2, 1],
                      outputRange: [0, 0.15, 0.35],
                    }),
                  },
                ]}
              />

              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : success ? (
                <View style={styles.checkinInnerRow}>
                  <Text style={{ fontSize: 22, color: '#fff' }}>
                    {success === 'ended' ? '🏁' : '✓'}
                  </Text>
                  <View style={styles.checkinTextGroup}>
                    <Text style={styles.checkinBtnTitle}>
                      {success === 'ended' ? t('checkin.ended') : t('checkin.done')}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.checkinInnerRow}>
                  {/* 指纹图标与环形充能圈 */}
                  <View style={styles.fingerRingWrap}>
                    <Svg width={40} height={40}>
                      <Circle
                        cx={20}
                        cy={20}
                        r={17}
                        stroke="rgba(255,255,255,0.25)"
                        strokeWidth={3}
                        fill="none"
                      />
                      <AnimatedCircle
                        cx={20}
                        cy={20}
                        r={17}
                        stroke="#FFFFFF"
                        strokeWidth={3}
                        strokeDasharray={106.8}
                        strokeDashoffset={chargeProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [106.8, 0],
                        })}
                        strokeLinecap="round"
                        fill="none"
                        transform="rotate(-90 20 20)"
                      />
                    </Svg>
                    <View style={styles.fingerIconCenter}>
                      <Ionicons name="finger-print-outline" size={24} color="#fff" />
                    </View>
                  </View>

                  <View style={styles.checkinTextGroup}>
                    <Text style={styles.checkinBtnTitle}>
                      {hasActiveTrip ? t('home.btnCheckIn', '到达打卡') : t('home.btnStartTrip', '开始行程')}
                    </Text>
                    <Text style={styles.checkinBtnSub}>
                      {hasActiveTrip ? t('checkin.hint') : t('home.btnPressToStart', '点击开始行程')}
                    </Text>
                  </View>
                </View>
              )}
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </>
  );
}

const makeStyles = (colors, isDark) =>
  StyleSheet.create({
    statsCard: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      marginHorizontal: 16,
      marginBottom: 10,
      borderRadius: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.line,
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    statsCol: {
      flex: 1,
      alignItems: 'center',
    },
    statsColBorder: {
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.line2,
    },
    statsValue: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.ink,
      fontVariant: ['tabular-nums'],
    },
    statsLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.ink3,
      marginTop: 2,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 20,
    },
    bottomComposer: {
      backgroundColor: colors.surface,
      paddingHorizontal: MODE_STRIP_PADDING,
      paddingTop: 8,
      paddingBottom: 12,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 6,
    },
    nextModeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 4,
      marginBottom: 6,
    },
    nextModeTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primaryStrong,
      letterSpacing: 0.2,
    },
    modesStrip: {
      marginBottom: 8,
    },
    modesStripContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: MODE_GAP,
      paddingRight: 4,
    },
    modeBtn: {
      paddingVertical: 5,
      paddingHorizontal: 2,
      borderRadius: 10,
      backgroundColor: colors.chip,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    modeBtnActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    modeBtnText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.ink2,
    },
    modeBtnTextActive: {
      color: colors.primaryStrong,
      fontWeight: '800',
    },
    actionBtnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    backfillSquareBtn: {
      width: 60,
      height: 60,
      borderRadius: 18,
      backgroundColor: colors.primarySoft,
      borderWidth: 1.5,
      borderColor: colors.primarySoftBorder,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
    },
    backfillSquareText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primaryStrong,
    },
    checkinMainBtn: {
      width: '100%',
      height: 60,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.32,
      shadowRadius: 14,
      elevation: 6,
      position: 'relative',
      overflow: 'hidden',
    },
    checkinBtnEnded: {
      backgroundColor: colors.ink2,
      shadowColor: colors.ink2,
    },
    checkinBtnSuccess: {
      backgroundColor: colors.success,
      shadowColor: colors.success,
    },
    chargeFill: {
      position: 'absolute',
      top: 0,
      left: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      borderRadius: 18,
      zIndex: 1,
    },
    checkinInnerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      zIndex: 2,
    },
    fingerRingWrap: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fingerIconCenter: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkinTextGroup: {
      justifyContent: 'center',
    },
    checkinBtnTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.surface,
      letterSpacing: 4,
      lineHeight: 24,
    },
    checkinBtnSub: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.surface,
      opacity: 0.95,
      lineHeight: 14,
    },
  });
