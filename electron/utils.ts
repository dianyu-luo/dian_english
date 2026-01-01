// electron/utils.ts

/**
 * 获取北京时间（东八区）字符串，格式：yyyy-MM-dd HH:mm:ss
 */
export function getBeijingTimeString(): string {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return now.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
}

/**
 * 判断字符串是否为空或全是空格
 */
export function isEmpty(str: string): boolean {
  return !str || str.trim().length === 0;
}

/**
 * 简单的深拷贝对象
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 生成唯一ID（简单版）
 */
export function generateId(): string {
  return Math.random().toString(36).substr(2, 9) + Date.now();
}
