/**
 * TimeFlow 核心业务数据类型声明
 * 规则：
 * 1. 业务逻辑与内存状态一律使用 camelCase 规范字段。
 * 2. snake_case 只允许出现在 Raw*Row 导入/历史备份读取边界。
 * 3. 时间戳一律为毫秒 (ms)；FocusSession.duration 与 Harvest.durationSec 为秒 (s)；PomodoroState.focusMin 为分钟 (min)。
 */

/** 9 大标准交通方式 */
export type TransportMode =
  | 'walk'
  | 'bike'
  | 'drive'
  | 'taxi'
  | 'subway'
  | 'transit'
  | 'train'
  | 'flight'
  | 'boat';

/** 6 大标准专注分类 + 未分类 */
export type FocusCategoryKey =
  | 'work'
  | 'study'
  | 'create'
  | 'wellbeing'
  | 'life'
  | 'review'
  | 'insights.uncategorized';

/** 单次出行打卡记录 (对应 store.js 的 RECORD_COLS 映射后) */
export interface TravelRecord {
  /** 记录唯一 ID，由 makeId() 生成的字符串 */
  id: string;
  /** 打卡发生时刻的时间戳 (毫秒) */
  timestamp: number;
  /** 地点名称，未命名或占位时可为 null 或未命名文案 */
  locationName: string | null;
  /** 纬度 (WGS84 / GCJ-02)，未定位时为 null */
  lat: number | null;
  /** 经度 (WGS84 / GCJ-02)，未定位时为 null */
  lng: number | null;
  /** 出行方式 */
  mode: TransportMode;
  /** 所属连续行程 ID，独立点为 null */
  tripId: string | null;
}

/** 连续行程记录 (对应 store.js 的 getTrips) */
export interface Trip {
  /** 行程唯一 ID (tripId) */
  id: string;
  /** 行程开始时间戳 (毫秒) */
  startTs: number;
  /** 行程结束时间戳 (毫秒)，进行中为 null */
  endTs: number | null;
  /** 行程路线名称或自定义名称 */
  name: string;
  /** 是否为当前进行中的行程 */
  isActive: boolean;
  /** 行程创建时间戳 (毫秒) */
  createdAt: number;
}

/** 单次专注记录 (对应 store.js 的 FOCUS_COLS 映射后) */
export interface FocusSession {
  /** 专注记录唯一 ID，由 makeId() 生成的字符串 */
  id: string;
  /** 专注完成时刻的时间戳 (毫秒) */
  timestamp: number;
  /** 专注目标任务名称 */
  goalName: string | null;
  /** 专注累计时长 (秒) */
  duration: number;
  /** 专注分类 key */
  category: FocusCategoryKey | string | null;
  /** 专注备注 */
  note: string | null;
  /** 是否为提前结束 (决策 1：内存与业务中为布尔值，入库按 0/1 转换) */
  partial?: boolean;
}

/** 结算收获项 (对应 engine.js settle 输出的 harvested) */
export interface Harvest {
  /** 会话 ID，如 focus-1729000000000 */
  sessionId: string;
  /** 会话实际开始时间戳 (毫秒) */
  startTs: number;
  /** 会话结束时间戳 (毫秒) */
  endAt: number;
  /** 专注时长 (秒，满时长非墙钟差) */
  durationSec: number;
  /** 专注分类 key */
  category: string;
  /** 任务名称 */
  goalName: string;
  /** 氛围音效 */
  ambient: string;
  /** 当日累计完成番茄数 */
  completedToday: number;
  /** 是否为提前结束 */
  partial?: boolean;
}

/** 番茄专注状态机完整状态 (对应 engine.js createState v2) */
export interface PomodoroState {
  /** 协议版本号 (目前固定为 2) */
  v: 2;
  /** 当前模式：专注 / 短休 / 长休 */
  mode: 'focus' | 'short' | 'long';
  /** 是否处于计时运行中 */
  running: boolean;
  /** 计划结束时间戳 (毫秒)，停止或暂停时为 null */
  endAt: number | null;
  /** 剩余时长 (毫秒)，暂停时以此为基准 */
  remainingMs: number;
  /** 今日已完成番茄数 (跨天惰性归零) */
  completedToday: number;
  /** 状态最后更新时间戳 (毫秒) */
  updatedAt: number;
  /** 预设专注时长 (分钟，范围 2~120) */
  focusMin: number;
  /** 延长专注时长 (毫秒) */
  extraMs: number;
  /** 归属日期 (YYYY-MM-DD)，用于跨天归零判定 */
  completedDate: string | null;
  /** 上一次已结算的 endAt，防止重复结算 */
  settledEndAt: number | null;
  /** 当前专注会话唯一 ID */
  sessionId: string | null;
  /** 当前专注会话启动时间戳 (毫秒) */
  startTs: number | null;
  /** 专注分类 */
  category: string;
  /** 专注任务目标名称 */
  goalName: string;
  /** 背景音效 */
  ambient: string;
  /** 系统通知 ID，未发通知为 null */
  notifId: string | null;
  /** 待落盘/待展示的收获会话队列 (上限 10) */
  pendingHarvests: Harvest[];
}

/** 备份 V2 数据包明文结构 (对应 format.js buildPackage) */
export interface BackupPackage {
  app: 'timeflow';
  v: 1;
  /** ISO 格式的时间字符串，如 2026-10-30T08:00:00.000Z */
  createdAt: string;
  device: string;
  counts: {
    records: number;
    focus: number;
    trips: number;
  };
  data: {
    records: TravelRecord[];
    trips: Trip[];
    focusSessions: FocusSession[];
    prefs: Record<string, string>;
  };
}

/** 桌面小组件快照通道数据结构 (存放在 AsyncStorage: timeflow_widget_snapshot_v1) */
export interface WidgetSnapshot {
  v: 1;
  updatedAt: number;
  travel: {
    todayRecords: TravelRecord[];
    recentTimestamps: number[];
    count: number;
  };
  focus: {
    todayCompletedMinutes: number;
    past6DaysMinutes: number[];
  };
}

/* =========================================================
 * 导入边界原始输入类型 (允许 camelCase 与 snake_case 并存)
 * 仅用于 SQLite 原始游标解析、V1/V2 备份文件读取及外部导入处
 * ========================================================= */

export interface RawRecordRow {
  id?: string | number;
  timestamp?: number;
  locationName?: string | null;
  location_name?: string | null;
  lat?: number | null;
  lng?: number | null;
  mode?: string;
  tripId?: string | null;
  trip_id?: string | null;
  [key: string]: any;
}

export interface RawTripRow {
  id?: string;
  startTs?: number;
  start_ts?: number;
  endTs?: number | null;
  end_ts?: number | null;
  name?: string;
  isActive?: number | boolean;
  is_active?: number | boolean;
  createdAt?: number;
  created_at?: number;
  [key: string]: any;
}

export interface RawFocusRow {
  id?: string | number;
  timestamp?: number;
  goalName?: string | null;
  goal_name?: string | null;
  duration?: number;
  category?: string | null;
  note?: string | null;
  partial?: 0 | 1 | boolean;
  [key: string]: any;
}
