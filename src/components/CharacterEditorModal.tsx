import { useEffect, useState } from "react";
import type { CharacterInput } from "../types";
import { useCharacterStore } from "../stores/characterStore";
import { useUiStore } from "../stores/uiStore";
import AvatarPicker from "./AvatarPicker";

const inputCls =
  "w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-800";
const labelCls = "mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400";
const textareaCls = `${inputCls} min-h-20 resize-y`;

// 角色编辑器：新建 / 编辑共用。所有字段与 ST 卡片一一对应。
export default function CharacterEditorModal() {
  const editorOpen = useUiStore((s) => s.editorOpen);
  const closeEditor = useUiStore((s) => s.closeEditor);
  const showToast = useUiStore((s) => s.showToast);
  const fetchOne = useCharacterStore((s) => s.fetchOne);
  const save = useCharacterStore((s) => s.save);

  const [form, setForm] = useState<CharacterInput>({
    name: "",
    description: "",
    personality: "",
    scenario: "",
    first_messages: [""],
    example_messages: "",
    system_prompt: null,
    tags: [],
    nsfw: false,
    avatar: null,
  });
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);

  const editingId = editorOpen !== "create" ? editorOpen?.id : undefined;

  useEffect(() => {
    if (editorOpen === null) return;
    const targetId = editingId;
    if (targetId) {
      fetchOne(targetId).then((c) => {
        // 丢弃过期响应：等待期间弹窗可能已关闭或切换到别的角色
        const cur = useUiStore.getState().editorOpen;
        if (!cur || cur === "create" || cur.id !== targetId) return;
        setForm({
          name: c.name,
          description: c.description,
          personality: c.personality,
          scenario: c.scenario,
          first_messages: c.first_messages.length ? c.first_messages : [""],
          example_messages: c.example_messages,
          system_prompt: c.system_prompt,
          tags: c.tags,
          nsfw: c.nsfw,
          avatar: c.avatar,
        });
        setTagsText(c.tags.join(", "));
      });
    } else {
      setForm({
        name: "",
        description: "",
        personality: "",
        scenario: "",
        first_messages: [""],
        example_messages: "",
        system_prompt: null,
        tags: [],
        nsfw: false,
        avatar: null,
      });
      setTagsText("");
    }
  }, [editorOpen, editingId, fetchOne]);

  if (editorOpen === null) return null;

  const set = <K extends keyof CharacterInput>(k: K, v: CharacterInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setGreeting = (i: number, v: string) => {
    const list = [...(form.first_messages ?? [])];
    list[i] = v;
    set("first_messages", list);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      showToast("角色名不能为空");
      return;
    }
    setSaving(true);
    try {
      const input: CharacterInput = {
        ...form,
        first_messages: (form.first_messages ?? []).filter((s) => s.trim() !== ""),
        tags: tagsText
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
      };
      const saved = await save(editingId ?? null, input);
      showToast(editingId ? "已保存" : `已创建「${saved.name}」`);
      closeEditor();
    } catch (e) {
      showToast(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="overlay-anim fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6"
      onClick={closeEditor}
    >
      <div
        className="modal-anim max-h-full w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-sm font-semibold">
          {editingId ? "编辑角色" : "新建角色"}
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>头像</label>
            <AvatarPicker value={form.avatar ?? null} onChange={(v) => set("avatar", v)} />
          </div>

          <div>
            <label className={labelCls}>名称 *</label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputCls}
              placeholder="角色名"
              autoFocus
            />
          </div>
          <div>
            <label className={labelCls}>标签（逗号分隔）</label>
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              className={inputCls}
              placeholder="傲娇, 咖啡馆, 日常"
            />
          </div>

          <div className="col-span-2">
            <label className={labelCls}>描述</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className={textareaCls}
              placeholder="角色的外貌、身份、背景……会作为系统提示词的一部分发送给模型"
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>性格</label>
            <textarea
              value={form.personality}
              onChange={(e) => set("personality", e.target.value)}
              className={textareaCls}
              placeholder="性格特征、说话风格"
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>场景</label>
            <textarea
              value={form.scenario}
              onChange={(e) => set("scenario", e.target.value)}
              className={textareaCls}
              placeholder="故事发生的情境与开场设定"
            />
          </div>

          <div className="col-span-2">
            <label className={labelCls}>开场白（第一条为默认，可加多条轮流使用）</label>
            <div className="flex flex-col gap-2">
              {(form.first_messages ?? [""]).map((g, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <textarea
                    value={g}
                    onChange={(e) => setGreeting(i, e.target.value)}
                    className={`${textareaCls} min-h-14 flex-1`}
                    placeholder={`开场白 ${i + 1}（可用 {{user}} / {{char}}）`}
                  />
                  {i > 0 && (
                    <button
                      onClick={() =>
                        set("first_messages", (form.first_messages ?? []).filter((_, j) => j !== i))
                      }
                      className="mt-1 rounded px-1 text-neutral-400 hover:text-rose-500"
                      title="删除此开场白"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => set("first_messages", [...(form.first_messages ?? []), ""])}
              className="mt-1.5 text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              ＋ 添加备用开场白
            </button>
          </div>

          <div className="col-span-2">
            <label className={labelCls}>
              示例对话（{"{{user}}"} / {"{{char}}"} 会在发送时替换）
            </label>
            <textarea
              value={form.example_messages}
              onChange={(e) => set("example_messages", e.target.value)}
              className={`${textareaCls} min-h-24`}
              placeholder={"<START>\n{{user}}：你好\n{{char}}：你好"}
            />
          </div>

          <div className="col-span-2">
            <label className={labelCls}>自定义系统提示词（留空使用全局设置）</label>
            <textarea
              value={form.system_prompt ?? ""}
              onChange={(e) => set("system_prompt", e.target.value || null)}
              className={`${textareaCls} min-h-16`}
              placeholder="可选：覆盖全局默认的模型提示词"
            />
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={form.nsfw}
            onChange={(e) => set("nsfw", e.target.checked)}
            className="accent-neutral-800 dark:accent-neutral-200"
          />
          标记为 NSFW 内容
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={closeEditor}
            className="rounded-md border border-neutral-300 px-4 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-md bg-neutral-800 px-4 py-1.5 text-xs text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
