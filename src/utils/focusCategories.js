/**
 * 专注时段分类管理
 * 集中定义番茄钟/专注模块的 6 大分类及其元数据，
 * 并提供类别归一化与元数据查询工具函数。
 */

// 6 个标准专注分类：key、国际化键、emoji 与品牌色
export const FOCUS_CATEGORIES = [
  { key: 'work', i18nKey: 'pomodoro.helpWork', emoji: '💼', color: '#3A62D8' },
  { key: 'study', i18nKey: 'pomodoro.helpStudy', emoji: '📚', color: '#D33A3A' },
  { key: 'create', i18nKey: 'pomodoro.helpCreate', emoji: '🎨', color: '#E8891B' },
  { key: 'wellbeing', i18nKey: 'pomodoro.helpBodyMind', emoji: '🧘', color: '#2E9A6B' },
  { key: 'life', i18nKey: 'pomodoro.helpLife', emoji: '🧹', color: '#1F90B0' },
  { key: 'review', i18nKey: 'pomodoro.helpPlan', emoji: '💡', color: '#7B55C4' },
];

// 未分类兜底项（用于历史数据缺失或无法识别时展示）
export const UNCATEGORIZED = {
  key: 'insights.uncategorized',
  i18nKey: 'insights.uncategorized',
  emoji: '',
  color: '#B8AFA8',
};

// 便于快速查找的分类 key 集合
const VALID_KEYS = new Set(FOCUS_CATEGORIES.map((c) => c.key));

// 旧标签/别名到标准 key 的映射：支持中文名、英文名、emoji 前缀等
const ALIAS_MAP = {
  work: ['工作', 'work', '💼'],
  study: ['学习', 'study', '📚'],
  create: ['创作', 'create', '🎨'],
  wellbeing: ['身心', 'wellness', 'body', 'mind', 'bodymind', 'wellbeing', '🧘'],
  life: ['生活', 'life', '🧹'],
  review: ['规划', '复盘', 'plan', 'review', '💡'],
};

/**
 * 将任意原始类别值归一化为标准 key
 * @param {string|null|undefined} raw 原始类别值
 * @returns {string|null} 标准 key 或 null（表示未分类）
 */
export function normalizeCategory(raw) {
  if (!raw) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // 1. 精确匹配标准 key
  if (VALID_KEYS.has(trimmed)) return trimmed;

  // 2. 去除 emoji 后再尝试精确匹配（例如 "💼 工作" -> "工作" 不会命中 key，但后续别名会处理）
  const withoutEmoji = trimmed.replace(
    /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
    ''
  );
  const cleaned = withoutEmoji.trim();

  const lower = cleaned.toLowerCase();

  // 3. 按别名匹配
  for (const [key, aliases] of Object.entries(ALIAS_MAP)) {
    for (const alias of aliases) {
      const aliasLower = alias.toLowerCase();
      // 完全相等，或作为整词/子串出现（兼容 "身心 Wellness" 这类组合）
      if (lower === aliasLower || lower.includes(aliasLower)) {
        return key;
      }
    }
  }

  // 4. 无法识别，按未分类处理
  return null;
}

/**
 * 根据 key 获取完整分类元数据（含翻译后的名称）
 * @param {string|null|undefined} key 标准分类 key
 * @param {Function} t i18n 翻译函数
 * @returns {{key: string|null, i18nKey: string, emoji: string, color: string, name: string}}
 */
export function getCategoryMeta(key, t) {
  const category = getCategoryByKey(key);
  const translate = typeof t === 'function' ? t : ((k) => k);

  if (category) {
    return {
      ...category,
      name: translate(category.i18nKey),
    };
  }

  return {
    key: null,
    i18nKey: UNCATEGORIZED.i18nKey,
    emoji: UNCATEGORIZED.emoji,
    color: UNCATEGORIZED.color,
    name: translate(UNCATEGORIZED.i18nKey),
  };
}

/**
 * 根据 key 查找分类对象
 * @param {string|null|undefined} key 标准分类 key
 * @returns {Object|null} 分类对象或 null
 */
export function getCategoryByKey(key) {
  if (!key) return null;
  return FOCUS_CATEGORIES.find((c) => c.key === key) || null;
}
