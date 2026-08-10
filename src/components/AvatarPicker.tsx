import { useRef } from "react";

// 头像选择：本地文件 → data URL
export default function AvatarPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = () => inputRef.current?.click();

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg bg-neutral-200 text-2xl text-neutral-400 dark:bg-neutral-700">
        {value ? (
          <img src={value} alt="头像" className="size-full object-cover" />
        ) : (
          "🖼"
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={pick}
          className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
        >
          选择图片…
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-left text-[11px] text-neutral-400 hover:text-rose-500"
          >
            移除头像
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
