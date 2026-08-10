import { useUiStore } from "../stores/uiStore";

// 全局 Toast 提示
export default function Toast() {
  const toast = useUiStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-neutral-900/90 px-4 py-2 text-xs text-white shadow-lg dark:bg-neutral-100/90 dark:text-neutral-900">
      {toast}
    </div>
  );
}
