/** 将毫秒格式化为中文可读时长，如 `1小时23分`、`45分钟`、`30秒` */
export function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}秒`;

  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}分钟`;

  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (minutes === 0) return `${hours}小时`;
  return `${hours}小时${minutes}分`;
}
