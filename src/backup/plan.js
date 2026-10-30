// @ts-check
// 纯决策函数：保留策略（prune）与恢复预览（replace/merge 条数）。
// 不依赖 RN/expo，可在 node 测试脚本中直接 require。

export const MAX_AUTO = 7;          // 自动备份最多保留份数
export const MAX_MANUAL_SAFE = 10;  // manual+safe 合计上限（超出仅提示，不自动删）

/**
 * 自动清理决策。versions: [{ name, kind, records, at }]（来自文件名解析）。
 * 规则：
 * - 只清理 kind==='auto'；manual/safe 永不自动删。
 * - auto 超过 MAX_AUTO 时，从最旧的开始删。
 * - 永远保留「records 最多」的那一份（star，防骤减/空库备份挤掉完整数据；
 *   平手时取最新的一份，与设计稿 starId 行为一致）。
 * - 只有新备份写入并校验成功后才调用（由调用方保证）。
 * 返回 { toDelete: [name], overManualSafe: boolean, starName: string|null }
 */
export function planPrune(versions) {
  const list = (versions || []).filter((v) => v && v.name);
  if (!list.length) return { toDelete: [], overManualSafe: false, starName: null };

  // star：records 最多的一份（平手取 at 最新）
  let star = null;
  for (const v of list) {
    if (!star || v.records > star.records || (v.records === star.records && v.at > star.at)) star = v;
  }

  const autos = list
    .filter((v) => v.kind === 'auto' && (!star || v.name !== star.name))
    .sort((a, b) => a.at - b.at); // 旧 → 新：超出上限时从最旧的开始删

  const toDelete = [];
  // 保留最新的 MAX_AUTO-? 份：star 也占一个 auto 名额当它本身是 auto
  const autoTotal = list.filter((v) => v.kind === 'auto').length;
  let overflow = autoTotal - MAX_AUTO;
  for (const v of autos) {
    if (overflow <= 0) break;
    toDelete.push(v.name);
    overflow -= 1;
  }

  const manualSafe = list.filter((v) => v.kind === 'manual' || v.kind === 'safe').length;
  return {
    toDelete,
    overManualSafe: manualSafe > MAX_MANUAL_SAFE,
    starName: star ? star.name : null,
  };
}

export const MAX_CLOUD = 3; // 云端保留最近份数

/**
 * 云端轮转决策：entries 为远端 timeflow/ 下「符合当前命名规范」的文件
 * [{ name, at }]（调用方须先用 parseBackupFilename 过滤——旧版
 * timeflow-backup-latest.json 等 legacy 文件天然不在列表中：不读取、不删除）。
 * 超出 MAX_CLOUD 时从最旧的开始删。返回 [name]。
 */
export function planCloudPrune(entries) {
  const list = (entries || []).filter((e) => e && e.name).sort((a, b) => a.at - b.at); // 旧 → 新
  const overflow = list.length - MAX_CLOUD;
  if (overflow <= 0) return [];
  return list.slice(0, overflow).map((e) => e.name);
}

/**
 * 恢复预览：给定当前库与备份包各自的 id 集合，算出两种方式的条数。
 * - replaceOverwritten：「回到这个时间点」会被替换掉的现有记录数（当前有而备份没有）
 * - mergeAdded / mergeIds：「只补回缺少的记录」将补入的条数与 id（备份有而当前没有）
 * currentIds/backupIds: 三表合并后的 id 数组（records+focus+trips 或仅数据表，由调用方统一口径）
 */
export function planRestore(currentIds, backupIds) {
  const cur = new Set(currentIds || []);
  const bak = new Set(backupIds || []);
  let replaceOverwritten = 0;
  for (const id of cur) if (!bak.has(id)) replaceOverwritten += 1;
  const mergeIds = [];
  for (const id of bak) if (!cur.has(id)) mergeIds.push(id);
  return { replaceOverwritten, mergeAdded: mergeIds.length, mergeIds };
}
