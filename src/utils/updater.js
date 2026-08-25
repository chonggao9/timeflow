import Constants from 'expo-constants';

// 版本台账：GitHub Releases。releases/latest 永远指向最新版，稳定不变。
// 每次发版 = 升 app.json 的 version + 打 tag + 把 APK 传成该 Release 的资产。
const REPO = 'chonggao9/timeflow';

// App 当前版本号（构建时注入到 expoConfig）
export function getAppVersion() {
  return Constants?.expoConfig?.version || '1.0.0';
}

// "1.0.1" / "v1.0.1" -> [1,0,1]
function parseVersion(v) {
  return String(v).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
}

// 判断 a 是否比 b 新（逐段比较）
function isNewer(a, b) {
  const A = parseVersion(a), B = parseVersion(b);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const x = A[i] || 0, y = B[i] || 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

// 检查是否有新版本。出错/无新版返回 null，静默失败不打扰用户。
export async function checkForUpdate() {
  if (__DEV__) return null; // 开发模式跳过，避免 Expo Go 里误弹
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'timeflow-app' },
    });
    if (!res.ok) return null;
    const release = await res.json();
    const latestVersion = String(release.tag_name || '').replace(/^v/i, '');
    const asset = (release.assets || []).find(a => /\.apk$/i.test(a.name)) || (release.assets || [])[0];
    const downloadUrl = asset ? asset.browser_download_url : (release.html_url || '');
    const current = getAppVersion();
    if (latestVersion && isNewer(latestVersion, current)) {
      return { currentVersion: current, latestVersion, downloadUrl };
    }
    return null;
  } catch (e) {
    return null;
  }
}
