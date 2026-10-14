// 备份 UI 共享工具：时间/大小格式化、四态状态卡取数、语义色映射。
import { STALE_MS } from '../../backup/state';

export function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 今天 → 「今天 10:15」；昨天 → 「昨天 21:14」；更早 → 「10月9日 21:14」（en: Today/Yesterday/Oct 9）
export function formatTime(ts, lang) {
  if (!ts) return '';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOf(now) - startOf(d)) / 86400000);
  const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (lang === 'en') {
    if (dayDiff === 0) return `Today ${hh}:${mm}`;
    if (dayDiff === 1) return `Yesterday ${hh}:${mm}`;
    return `${EN_MONTHS[d.getMonth()]} ${d.getDate()}, ${hh}:${mm}`;
  }
  if (dayDiff === 0) return `今天 ${hh}:${mm}`;
  if (dayDiff === 1) return `昨天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

export function staleDays(lastSuccessAt) {
  return Math.max(1, Math.floor((Date.now() - lastSuccessAt) / 86400000));
}

// 语义色 tone → { fg, bg }（用 theme token，不写死色值）
export function toneColors(colors, tone) {
  switch (tone) {
    case 'ok': return { fg: colors.ok, bg: colors.okBg };
    case 'warn': return { fg: colors.warn, bg: colors.warnBg };
    case 'err': return { fg: colors.err, bg: colors.errBg };
    default: return { fg: colors.idle, bg: colors.idleBg };
  }
}

const STATUS_ICON = {
  ok: 'shield-checkmark',
  stale: 'time',
  failed: 'alert-circle',
  empty: 'shield-outline',
};
const STATUS_TONE = { ok: 'ok', stale: 'warn', failed: 'err', empty: 'idle' };

/**
 * 四态状态卡取数（「我的」页状态卡与数据页 hero 共用）。
 * state 来自 useBackupState()（含派生 uiStatus）。
 * 返回 { tone, icon, title, sub, action: null|'quick'|'create'|'retry' }
 */
export function statusInfo(state, t, lang) {
  const ui = state?.uiStatus || 'empty';
  const icon = STATUS_ICON[ui];
  const tone = STATUS_TONE[ui];
  if (ui === 'ok' || ui === 'stale') {
    const sub = t('dataBackup.lastSub', {
      time: formatTime(state.lastSuccessAt, lang),
      n: state.lastCounts?.records ?? 0,
    });
    if (ui === 'ok') {
      return { tone, icon, title: t('dataBackup.statusOkTitle'), sub, action: null };
    }
    return {
      tone, icon,
      title: t('dataBackup.statusStaleTitle', { n: staleDays(state.lastSuccessAt) }),
      sub, action: 'quick',
    };
  }
  if (ui === 'failed') {
    const code = state?.lastError?.code;
    const sub = code === 'NO_SPACE' ? t('dataBackup.errNoSpace')
      : code === 'CLOUD_FAIL' ? t('dataBackup.errCloudFail')
      : t('dataBackup.errWriteFail');
    return { tone, icon, title: t('dataBackup.statusFailedTitle'), sub, action: 'retry' };
  }
  return {
    tone, icon,
    title: t('dataBackup.statusEmptyTitle'),
    sub: t('dataBackup.statusEmptySub'),
    action: 'create',
  };
}

// kind → 标签文案 key / 色调
export function kindMeta(kind) {
  if (kind === 'safe') return { labelKey: 'dataBackup.tagSafe', tone: 'warn' };
  if (kind === 'manual') return { labelKey: 'dataBackup.tagManual', tone: 'brown' };
  return { labelKey: 'dataBackup.tagAuto', tone: 'blue' };
}

export { STALE_MS };
