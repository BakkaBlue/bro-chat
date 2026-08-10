import { useEffect, useRef, useState } from "react";
import type { Settings } from "../types";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";
import * as api from "../api/commands";

const inputCls =
  "w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-800";
const labelCls = "mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400";

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700">
      <div className="min-w-0">
        <div className="text-xs">{label}</div>
        {hint && <div className="mt-0.5 text-[10px] text-neutral-400">{hint}</div>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="shrink-0 accent-neutral-800 dark:accent-neutral-200"
      />
    </label>
  );
}

function SegBtn({
  options,
  value,
  onChange,
}: {
  options: [string, string][]; // [value, label]
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-md px-3.5 py-1.5 text-xs ${
            value === v
              ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
              : "border border-neutral-300 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

type Tab = "model" | "appearance" | "characters" | "misc" | "chat" | "enter" | "auto";
const TABS: [Tab, string][] = [
  ["model", "模型连接"],
  ["appearance", "UI 主题"],
  ["characters", "角色处理"],
  ["misc", "杂项"],
  ["chat", "聊天处理"],
  ["enter", "Enter 发送"],
  ["auto", "自动化"],
];

// 设置整窗：六分类（参考酒馆设置结构，只保留本应用真实生效的项）
export default function SettingsView() {
  const { settings, load, save } = useSettingsStore();
  const setView = useUiStore((s) => s.setView);
  const showToast = useUiStore((s) => s.showToast);
  const bgImage = useSettingsStore((s) => s.bgImage);
  const setBgImage = useSettingsStore((s) => s.setBgImage);
  const [form, setForm] = useState<Settings | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [tab, setTab] = useState<Tab>("model");
  const bgInputRef = useRef<HTMLInputElement>(null);

  // 模型列表
  const [models, setModels] = useState<string[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    if (!settings) load();
  }, [settings, load]);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  if (!form) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-400">
        加载中…
      </div>
    );
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const list = await api.listModels();
      setModels(list);
      showToast(`获取到 ${list.length} 个模型`);
    } catch (e) {
      setModels(null);
      showToast(`获取模型失败: ${e}`);
    } finally {
      setLoadingModels(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <h1 className="text-sm font-semibold">设置</h1>
        <button
          onClick={() => setView("main")}
          className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
        >
          返回
        </button>
      </header>

      <div className="flex flex-wrap gap-1.5 border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-700">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            className={`rounded-md px-3 py-1.5 text-xs ${
              tab === t
                ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            }`}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mx-auto w-full max-w-xl flex-1 p-5">
        {tab === "model" && (
          <>
            <div className="col-span-2">
              <label className={labelCls}>接口地址（自动补全 /v1/chat/completions 后缀）</label>
              <input
                value={form.base_url}
                onChange={(e) => set("base_url", e.target.value)}
                className={inputCls}
                placeholder="https://api.deepseek.com（本地 Ollama：http://localhost:11434/v1）"
              />
            </div>
            <div className="mt-4">
              <label className={labelCls}>API Key（本地模型可留空）</label>
              <div className="flex gap-1.5">
                <input
                  type={showKey ? "text" : "password"}
                  value={form.api_key}
                  onChange={(e) => set("api_key", e.target.value)}
                  className={inputCls}
                  placeholder="sk-…"
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className="shrink-0 rounded-md border border-neutral-300 px-2 text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
                >
                  {showKey ? "隐藏" : "显示"}
                </button>
              </div>
            </div>
            <div className="mt-4">
              <label className={labelCls}>模型</label>
              <div className="flex gap-1.5">
                <input
                  value={form.model}
                  onChange={(e) => set("model", e.target.value)}
                  className={inputCls}
                  placeholder="deepseek-chat / qwen2.5:7b …"
                />
                <button
                  onClick={fetchModels}
                  disabled={loadingModels}
                  className="shrink-0 rounded-md border border-neutral-300 px-2 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-700"
                >
                  {loadingModels ? "获取中…" : "获取模型列表"}
                </button>
              </div>
              {models && models.length > 0 && (
                <div className="mt-2">
                  <select
                    value={form.model}
                    onChange={(e) => set("model", e.target.value)}
                    className={`${inputCls} cursor-pointer`}
                  >
                    <option value="">从上游选择…</option>
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="mt-1.5 text-[11px] text-neutral-400">
                提示：输入接口地址后点「获取模型列表」，即可从上游选择模型
              </p>
            </div>
          </>
        )}

        {tab === "appearance" && (
          <>
            <h2 className="mb-3 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              基础主题
            </h2>
            <div className="mb-4 flex flex-col gap-3">
              <div>
                <label className={labelCls}>背景图片（配合「背景模糊」使用）</label>
                <div className="flex items-center gap-2">
                  {bgImage && (
                    <img
                      src={bgImage}
                      alt="背景预览"
                      className="h-10 w-16 rounded-md border border-neutral-200 object-cover dark:border-neutral-600"
                    />
                  )}
                  <button
                    onClick={() => bgInputRef.current?.click()}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-700"
                  >
                    选择图片…
                  </button>
                  {bgImage && (
                    <button
                      onClick={() => setBgImage(null)}
                      className="text-xs text-neutral-400 hover:text-rose-500"
                    >
                      移除
                    </button>
                  )}
                </div>
                <input
                  ref={bgInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const reader = new FileReader();
                      reader.onload = () => setBgImage(reader.result as string);
                      reader.readAsDataURL(f);
                    }
                    e.target.value = "";
                  }}
                />
              </div>
              <div>
                <label className={labelCls}>主题名称</label>
                <SegBtn
                  options={[
                    ["system", "跟随系统"],
                    ["light", "浅色"],
                    ["dark", "深色"],
                  ]}
                  value={form.ui_theme}
                  onChange={(v) => set("ui_theme", v as Settings["ui_theme"])}
                />
              </div>
              <div>
                <label className={labelCls}>消息字号</label>
                <SegBtn
                  options={[
                    ["12", "小"],
                    ["13", "中"],
                    ["14", "大"],
                    ["16", "特大"],
                  ]}
                  value={String(form.ui_font_size)}
                  onChange={(v) => set("ui_font_size", parseInt(v))}
                />
              </div>
              <div>
                <label className={labelCls}>头像样式</label>
                <SegBtn
                  options={[
                    ["", "圆角"],
                    ["circle", "圆形"],
                  ]}
                  value={form.ui_avatar_style}
                  onChange={(v) => set("ui_avatar_style", v)}
                />
              </div>
              <div>
                <label className={labelCls}>聊天风格</label>
                <SegBtn
                  options={[
                    ["", "气泡"],
                    ["flat", "平铺"],
                  ]}
                  value={form.ui_chat_style}
                  onChange={(v) => set("ui_chat_style", v)}
                />
              </div>
            </div>

            <h2 className="mb-3 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              UI 效果开关
            </h2>
            <div className="flex flex-col gap-1.5">
              <Toggle
                label="背景高斯模糊"
                hint="面板毛玻璃，透出模糊的背景层"
                checked={form.ui_glass_blur}
                onChange={(v) => set("ui_glass_blur", v)}
              />
              <Toggle
                label="文本阴影"
                hint="消息文字带轻微阴影"
                checked={form.ui_text_shadow}
                onChange={(v) => set("ui_text_shadow", v)}
              />
              <Toggle
                label="聊天时间戳"
                checked={form.ui_show_timestamps}
                onChange={(v) => set("ui_show_timestamps", v)}
              />
              <Toggle
                label="头像悬停放大"
                checked={form.ui_avatar_hover_zoom}
                onChange={(v) => set("ui_avatar_hover_zoom", v)}
              />
              <Toggle
                label="减少动态效果"
                hint="关闭动画与过渡"
                checked={form.ui_reduce_motion}
                onChange={(v) => set("ui_reduce_motion", v)}
              />
              <Toggle
                label="消息渐入动画"
                checked={form.ui_message_animation}
                onChange={(v) => set("ui_message_animation", v)}
              />
              <Toggle
                label="自动展开消息操作菜单"
                hint="关闭后仅在悬停时显示"
                checked={form.ui_auto_expand_actions}
                onChange={(v) => set("ui_auto_expand_actions", v)}
              />
              <Toggle
                label="AI 回复计时器"
                hint="显示每次回复耗时"
                checked={form.ui_reply_timer}
                onChange={(v) => set("ui_reply_timer", v)}
              />
              <Toggle
                label="显示消息楼层"
                hint="每条消息前显示楼层编号"
                checked={form.ui_show_floor}
                onChange={(v) => set("ui_show_floor", v)}
              />
              <Toggle
                label="显示消息 Token 数"
                hint="按消息估算（CJK 感知）"
                checked={form.ui_show_token_count}
                onChange={(v) => set("ui_show_token_count", v)}
              />
              <Toggle
                label="单击编辑消息"
                hint="点击消息内容直接进入编辑"
                checked={form.ui_click_to_edit}
                onChange={(v) => set("ui_click_to_edit", v)}
              />
            </div>
          </>
        )}

        {tab === "characters" && (
          <div className="flex flex-col gap-1.5">
            <h2 className="mb-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              角色列表
            </h2>
            <Toggle
              label="显示角色版本"
              hint="列表项显示卡片里的角色版本号"
              checked={form.char_show_version}
              onChange={(v) => set("char_show_version", v)}
            />
          </div>
        )}

        {tab === "misc" && (
          <div className="flex flex-col gap-1.5">
            <h2 className="mb-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              传输与反馈
            </h2>
            <Toggle
              label="消息声音"
              hint="发送消息时播放提示音"
              checked={form.chat_sound}
              onChange={(v) => set("chat_sound", v)}
            />
            <Toggle
              label="将提示词记录到控制台"
              hint="发送前打印完整提示词（tauri dev 终端可见）"
              checked={form.chat_debug_prompt}
              onChange={(v) => set("chat_debug_prompt", v)}
            />
            <p className="mt-2 text-[11px] text-neutral-400">
              聊天功能按钮：聊天窗口顶部提供「重新加载」「清理」操作，无需设置。
            </p>
          </div>
        )}

        {tab === "chat" && (
          <div className="flex flex-col gap-1.5">
            <h2 className="mb-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              消息与加载
            </h2>
            <div className="mb-1">
              <label className={labelCls}>要加载多少条消息</label>
              <input
                type="number"
                min={10}
                max={1000}
                value={form.chat_load_messages}
                onChange={(e) => set("chat_load_messages", parseInt(e.target.value) || 100)}
                className={`${inputCls} w-32`}
              />
            </div>
            <Toggle
              label="自动滚动聊天"
              hint="新消息自动滚到底部，手动上滚后暂停"
              checked={form.chat_auto_scroll}
              onChange={(v) => set("chat_auto_scroll", v)}
            />
            <Toggle
              label="删除消息确认"
              checked={form.chat_confirm_delete}
              onChange={(v) => set("chat_confirm_delete", v)}
            />
            <Toggle
              label="禁止外部媒体"
              hint="不加载 markdown 里的外部图片/音视频"
              checked={form.chat_block_external_media}
              onChange={(v) => set("chat_block_external_media", v)}
            />
            <Toggle
              label="允许机器人消息中替换 {{user}}/{{char}}"
              hint="关闭后 assistant 消息保留令牌原文"
              checked={form.chat_substitute_in_assistant}
              onChange={(v) => set("chat_substitute_in_assistant", v)}
            />
          </div>
        )}

        {tab === "enter" && (
          <div className="flex flex-col gap-1.5">
            <h2 className="mb-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              Enter 发送模式
            </h2>
            <div className="mb-2">
              <SegBtn
                options={[
                  ["", "自动（PC）"],
                  ["send", "始终 Enter 发送"],
                  ["newline", "Enter 换行（Ctrl+Enter 发送）"],
                ]}
                value={form.chat_enter_mode}
                onChange={(v) => set("chat_enter_mode", v)}
              />
            </div>
            <p className="text-[11px] text-neutral-400">
              快速编辑：开启「单击编辑消息」后，点击消息内容即可编辑，自动保存。
            </p>
          </div>
        )}

        {tab === "auto" && (
          <div className="flex flex-col gap-1.5">
            <h2 className="mb-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              自动化
            </h2>
            <Toggle
              label="自动加载上次聊天"
              hint="启动时恢复上次打开的对话"
              checked={form.chat_auto_load_last}
              onChange={(v) => set("chat_auto_load_last", v)}
            />
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={() => save(form)}
            className="rounded-md bg-neutral-800 px-5 py-2 text-xs text-white hover:bg-neutral-700 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
