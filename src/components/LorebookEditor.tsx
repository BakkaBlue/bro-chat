import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Lorebook, LorebookInput, LoreEntryInput } from "../types";
import * as api from "../api/commands";
import { useUiStore } from "../stores/uiStore";

const inputCls =
  "rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] outline-none focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-800";
const labelCls = "mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400";

// 世界书编辑器：条目增删改、常驻/关键词/位置/顺序、导入独立 .json 世界书
export default function LorebookEditor({ characterId }: { characterId: string }) {
  const [lore, setLore] = useState<Lorebook | null>(null);
  const [saving, setSaving] = useState(false);
  const showToast = useUiStore((s) => s.showToast);

  useEffect(() => {
    api
      .getLorebook(characterId)
      .then(setLore)
      .catch(() => setLore(null));
  }, [characterId]);

  const patchEntry = (i: number, patch: Partial<LoreEntryInput>) => {
    setLore((prev) => {
      if (!prev) return prev;
      const entries = prev.entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e));
      return { ...prev, entries };
    });
  };

  const addEntry = () => {
    setLore((prev) => {
      const base = prev ?? {
        id: "",
        character_id: characterId,
        name: "世界书",
        description: "",
        scan_depth: 4,
        token_budget: 500,
        recursive_scanning: false,
        enabled: true,
        entries: [],
        created_at: "",
        updated_at: "",
      };
      const order =
        base.entries.length > 0
          ? Math.max(...base.entries.map((e) => e.insertion_order)) + 1
          : 0;
      return {
        ...base,
        entries: [
          ...base.entries,
          {
            id: `new-${Date.now()}`,
            keys: [],
            secondary_keys: [],
            comment: "",
            content: "",
            constant: false,
            selective: false,
            insertion_order: order,
            enabled: true,
            position: "before_char",
            created_at: "",
            updated_at: "",
          },
        ],
      };
    });
  };

  const removeEntry = (i: number) => {
    setLore((prev) =>
      prev ? { ...prev, entries: prev.entries.filter((_, idx) => idx !== i) } : prev,
    );
  };

  const save = async () => {
    if (!lore) return;
    setSaving(true);
    try {
      const input: LorebookInput = {
        name: lore.name,
        description: lore.description,
        scan_depth: lore.scan_depth,
        token_budget: lore.token_budget,
        recursive_scanning: lore.recursive_scanning,
        enabled: lore.enabled,
        entries: lore.entries.map((e) => ({
          keys: e.keys,
          secondary_keys: e.secondary_keys,
          comment: e.comment,
          content: e.content,
          constant: e.constant,
          selective: e.selective,
          insertion_order: e.insertion_order,
          enabled: e.enabled,
          position: e.position,
        })),
      };
      const saved = await api.saveLorebook(characterId, input);
      setLore(saved);
      showToast("世界书已保存，下次发送生效");
    } catch (e) {
      showToast(`保存世界书失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const removeAll = async () => {
    try {
      await api.deleteLorebook(characterId);
      setLore(null);
      showToast("世界书已删除");
    } catch (e) {
      showToast(`删除失败: ${e}`);
    }
  };

  const importFile = async () => {
    const path = await open({
      multiple: false,
      title: "导入世界书",
      filters: [{ name: "世界书", extensions: ["json"] }],
    });
    if (typeof path !== "string") return;
    try {
      const input = await api.importWorldbookFile(path);
      setLore((prev) => {
        const base = prev ?? {
          id: "",
          character_id: characterId,
          name: input.name,
          description: input.description,
          scan_depth: input.scan_depth,
          token_budget: input.token_budget,
          recursive_scanning: input.recursive_scanning,
          enabled: input.enabled,
          entries: [] as Lorebook["entries"],
          created_at: "",
          updated_at: "",
        };
        return {
          ...base,
          name: input.name || base.name,
          scan_depth: input.scan_depth,
          token_budget: input.token_budget,
          entries: [...base.entries, ...input.entries.map((e, i) => ({
            id: `imp-${Date.now()}-${i}`,
            keys: e.keys,
            secondary_keys: e.secondary_keys,
            comment: e.comment,
            content: e.content,
            constant: e.constant,
            selective: e.selective,
            insertion_order: e.insertion_order,
            enabled: e.enabled,
            position: e.position,
            created_at: "",
            updated_at: "",
          }))],
        };
      });
      showToast(`已导入世界书「${input.name}」，共 ${input.entries.length} 条，记得保存`);
    } catch (e) {
      showToast(`导入失败: ${e}`);
    }
  };

  return (
    <div className="col-span-2 mt-4 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold">
          世界书
          <span className="ml-2 text-[10px] font-normal text-neutral-400">
            按关键词注入设定，常驻条目始终生效
          </span>
        </h3>
        <div className="flex gap-1.5">
          <button
            onClick={importFile}
            className="rounded-md border border-neutral-300 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
          >
            导入 .json
          </button>
          {lore && (
            <button
              onClick={removeAll}
              className="rounded-md border border-rose-200 px-2 py-1 text-[11px] text-rose-500 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-900/20"
            >
              删除
            </button>
          )}
        </div>
      </div>

      {!lore ? (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-neutral-400">
            还没有世界书。导入卡片时内嵌的世界书会自动创建；也可以导入独立的 .json 世界书。
          </p>
          <button
            onClick={addEntry}
            className="rounded-md border border-neutral-300 px-2 py-1 text-[11px] hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
          >
            ＋ 新建世界书
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_80px_80px_auto] items-end gap-2">
            <div>
              <label className={labelCls}>名称</label>
              <input
                value={lore.name}
                onChange={(e) => setLore({ ...lore, name: e.target.value })}
                className={`${inputCls} w-full`}
              />
            </div>
            <div>
              <label className={labelCls}>扫描深度（条）</label>
              <input
                type="number"
                min={1}
                value={lore.scan_depth}
                onChange={(e) =>
                  setLore({ ...lore, scan_depth: parseInt(e.target.value) || 1 })
                }
                className={`${inputCls} w-full`}
              />
            </div>
            <div>
              <label className={labelCls}>注入预算（token）</label>
              <input
                type="number"
                min={1}
                value={lore.token_budget}
                onChange={(e) =>
                  setLore({ ...lore, token_budget: parseInt(e.target.value) || 1 })
                }
                className={`${inputCls} w-full`}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-1 pb-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              <input
                type="checkbox"
                checked={lore.enabled}
                onChange={(e) => setLore({ ...lore, enabled: e.target.checked })}
                className="accent-neutral-800 dark:accent-neutral-200"
              />
              启用
            </label>
          </div>

          <div className="flex flex-col gap-2">
            {lore.entries.map((e, i) => (
              <div
                key={e.id}
                className="rounded-md border border-neutral-200 p-2 dark:border-neutral-700"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                    <input
                      type="checkbox"
                      checked={e.enabled}
                      onChange={(ev) => patchEntry(i, { enabled: ev.target.checked })}
                      className="accent-neutral-800 dark:accent-neutral-200"
                    />
                    启用
                  </label>
                  <label className="flex cursor-pointer items-center gap-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                    <input
                      type="checkbox"
                      checked={e.constant}
                      onChange={(ev) => patchEntry(i, { constant: ev.target.checked })}
                      className="accent-neutral-800 dark:accent-neutral-200"
                    />
                    常驻
                  </label>
                  <input
                    value={e.keys.join(", ")}
                    onChange={(ev) =>
                      patchEntry(i, {
                        keys: ev.target.value
                          .split(/[,，]/)
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="触发关键词（逗号分隔）"
                    className={`${inputCls} min-w-0 flex-1`}
                  />
                  <select
                    value={e.position}
                    onChange={(ev) => patchEntry(i, { position: ev.target.value })}
                    className={`${inputCls} cursor-pointer`}
                    title="注入位置"
                  >
                    <option value="before_char">角色设定前</option>
                    <option value="after_char">角色设定后</option>
                  </select>
                  <input
                    type="number"
                    value={e.insertion_order}
                    onChange={(ev) =>
                      patchEntry(i, { insertion_order: parseInt(ev.target.value) || 0 })
                    }
                    className={`${inputCls} w-14`}
                    title="注入顺序（小在前）"
                  />
                  <button
                    onClick={() => removeEntry(i)}
                    className="rounded px-1 text-neutral-400 hover:text-rose-500"
                    title="删除条目"
                  >
                    ✕
                  </button>
                </div>
                <textarea
                  value={e.content}
                  onChange={(ev) => patchEntry(i, { content: ev.target.value })}
                  rows={2}
                  placeholder="条目内容：命中关键词时注入给模型"
                  className={`${inputCls} w-full resize-y`}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={addEntry}
              className="text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              ＋ 新增条目
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-neutral-800 px-3 py-1.5 text-[11px] text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
            >
              {saving ? "保存中…" : "保存世界书"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
