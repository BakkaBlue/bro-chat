import { useUiStore } from "../stores/uiStore";

// 破坏性操作确认框
export default function ConfirmDialog() {
  const confirm = useUiStore((s) => s.confirm);
  const resolveConfirm = useUiStore((s) => s.resolveConfirm);
  const dismissConfirm = useUiStore((s) => s.dismissConfirm);

  if (!confirm) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={dismissConfirm}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold">{confirm.title}</h3>
        <p className="mt-2 whitespace-pre-line text-xs text-neutral-500 dark:text-neutral-400">
          {confirm.message}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={dismissConfirm}
            className="rounded-md border border-neutral-300 px-4 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
          >
            取消
          </button>
          <button
            onClick={resolveConfirm}
            className="rounded-md bg-rose-600 px-4 py-1.5 text-xs text-white hover:bg-rose-500"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
