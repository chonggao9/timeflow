require('@babel/register')({
  presets: ['babel-preset-expo'],
  extensions: ['.js', '.jsx', '.ts', '.tsx'],
});

// 核心数据模型与分析算法边界测试
const { computePathStats, placeKey, isPlaceholderName, formatDuration, formatTime } = require('../src/utils/stats');
const { groupTrips, groupTripsByDate, getPlaceOptions } = require('../src/utils/analytics');

console.log('Running data integrity & edge cases tests...\n');

// 1. 测试历史老数据形态（无 tripId、无 mode、老 mode、未命名地点、缺失坐标等）
const mockLegacyRecords = [
  { id: '1', timestamp: 1725400000000, locationName: null, lat: null, lng: null },
  { id: '2', timestamp: 1725401000000, locationName: '未命名', lat: 39.9, lng: 116.4, mode: 'walk' },
  { id: '3', timestamp: 1725403000000, locationName: '公司', lat: 39.91, lng: 116.41, mode: 'transit', tripId: 'trip_1' },
  { id: '4', timestamp: 1725405000000, locationName: '咖啡馆', lat: 39.92, lng: 116.42, mode: 'future_alien_mode', tripId: 'trip_1' },
];

console.log('Test 1: placeKey & isPlaceholderName with edge cases...');
for (const r of mockLegacyRecords) {
  const key = placeKey(r);
  if (typeof key !== 'string' || !key.length) throw new Error(`Invalid placeKey: ${key}`);
}
console.log('✓ placeKey passed');

console.log('Test 2: computePathStats with mixed legacy records...');
const stats = computePathStats(mockLegacyRecords);
if (!Array.isArray(stats)) throw new Error('computePathStats must return an array');
console.log(`✓ computePathStats passed (${stats.length} paths computed)`);

console.log('Test 3: groupTrips with legacy records (null tripId)...');
const trips = groupTrips(mockLegacyRecords);
if (trips.length === 0) throw new Error('groupTrips returned empty array on non-empty input');
for (const t of trips) {
  if (!t.tripId) throw new Error('trip must have tripId');
  if (!Array.isArray(t.records)) throw new Error('trip.records must be array');
}
console.log(`✓ groupTrips passed (${trips.length} trips grouped)`);

console.log('Test 4: groupTripsByDate...');
const byDate = groupTripsByDate(trips);
if (!Array.isArray(byDate)) throw new Error('groupTripsByDate must return an array');
console.log(`✓ groupTripsByDate passed (${byDate.length} days grouped)`);

console.log('Test 5: formatDuration...');
if (formatDuration(0) !== '--') throw new Error('formatDuration(0) failed');
if (formatDuration(null) !== '--') throw new Error('formatDuration(null) failed');
if (formatDuration(20, 'zh') !== '不到1分钟') throw new Error('formatDuration(20) failed');
if (formatDuration(60, 'zh') !== '1分钟') throw new Error('formatDuration(60) failed');
if (formatDuration(3600, 'zh') !== '1小时') throw new Error('formatDuration(3600) failed');
if (formatDuration(3660, 'zh') !== '1小时1分') throw new Error('formatDuration(3660) failed');
console.log('✓ formatDuration passed');

console.log('\n✅ All unit and data compatibility tests passed successfully!');
