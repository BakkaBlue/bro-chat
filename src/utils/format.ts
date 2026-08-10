/** 时间显示：今天显示时分，否则显示月日 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (isNaN(d.getTime())) return "";
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}
