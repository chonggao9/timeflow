/**
 * 备份目标抽象接口
 * 所有存储目标（本地沙盒、WebDAV 云盘等）均需实现该接口
 */
export default class Target {
  constructor(name) {
    this.name = name;
  }

  /**
   * 写入备份文件
   * @param {string} filename - 文件名，如 timeflow-20261012-1815.tfb
   * @param {string} content - 文件内容（JSON 字符串）
   * @returns {Promise<void>}
   */
  async put(filename, content) {
    throw new Error('Target.put() must be implemented');
  }

  /**
   * 列出所有备份文件（按修改时间倒序排列，最新在首）
   * @returns {Promise<Array<{ name: string, size: number, modifiedAt: number, isLegacy?: boolean }>>}
   */
  async list() {
    throw new Error('Target.list() must be implemented');
  }

  /**
   * 读取单个备份文件内容
   * @param {string} filename
   * @returns {Promise<string>}
   */
  async get(filename) {
    throw new Error('Target.get() must be implemented');
  }

  /**
   * 删除单个备份文件
   * @param {string} filename
   * @returns {Promise<void>}
   */
  async remove(filename) {
    throw new Error('Target.remove() must be implemented');
  }
}
