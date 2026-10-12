import * as FileSystem from 'expo-file-system';
import Target from './Target';

export const LOCAL_BACKUP_DIR = `${FileSystem.documentDirectory}timeflow-backups/`;
export const KEEP_LOCAL_COUNT = 5;
export const KEEP_SNAP_COUNT = 3;

export default class LocalTarget extends Target {
  constructor(dir = LOCAL_BACKUP_DIR) {
    super('local');
    this.dir = dir.endsWith('/') ? dir : `${dir}/`;
  }

  async ensureDir() {
    try {
      const info = await FileSystem.getInfoAsync(this.dir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(this.dir, { intermediates: true });
      }
    } catch (e) {
      // 忽略目录已存在等异常
    }
  }

  async put(filename, content) {
    await this.ensureDir();
    const uri = `${this.dir}${filename}`;
    await FileSystem.writeAsStringAsync(uri, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  async list() {
    await this.ensureDir();
    try {
      const filenames = await FileSystem.readDirectoryAsync(this.dir);
      const rows = [];
      for (const name of filenames) {
        if (!name.endsWith('.tfb') && !name.endsWith('.json')) continue;
        const uri = `${this.dir}${name}`;
        const info = await FileSystem.getInfoAsync(uri, { md5: false });
        if (info.exists) {
          const isSnap = name.includes('-snap-') || name.startsWith('snap-');
          const isLegacy = name.endsWith('.json') && !name.endsWith('.tfb');
          rows.push({
            name,
            uri,
            size: info.size || 0,
            modifiedAt: info.modificationTime ? info.modificationTime * (info.modificationTime < 1e11 ? 1000 : 1) : Date.now(),
            isSnap,
            isLegacy,
          });
        }
      }
      rows.sort((a, b) => b.modifiedAt - a.modifiedAt);
      return rows;
    } catch (e) {
      return [];
    }
  }

  async get(filename) {
    const uri = `${this.dir}${filename}`;
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  async remove(filename) {
    const uri = `${this.dir}${filename}`;
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch (e) {}
  }

  /**
   * 清理本地旧版本：普通备份保留最近 max 普通份（默认 5），快照保留最近 maxSnap 份（默认 3）
   */
  async prune(maxNormal = KEEP_LOCAL_COUNT, maxSnap = KEEP_SNAP_COUNT) {
    const all = await this.list();
    const normalBackups = all.filter(r => !r.isSnap);
    const snapBackups = all.filter(r => r.isSnap);

    for (let i = maxNormal; i < normalBackups.length; i++) {
      await this.remove(normalBackups[i].name);
    }
    for (let i = maxSnap; i < snapBackups.length; i++) {
      await this.remove(snapBackups[i].name);
    }
  }
}
