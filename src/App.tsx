// 三栏布局外壳：角色列表 | 对话列表 | 聊天区
// Stage 1 为空壳，各栏内容随功能阶段接入。
export default function App() {
  return (
    <div className="grid h-screen grid-cols-[288px_260px_1fr] bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <aside className="flex flex-col border-r border-neutral-200 dark:border-neutral-700">
        <header className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold dark:border-neutral-700">
          角色
        </header>
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-neutral-400">
          Stage 2 接入角色库
        </div>
      </aside>

      <aside className="flex flex-col border-r border-neutral-200 dark:border-neutral-700">
        <header className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold dark:border-neutral-700">
          对话
        </header>
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-neutral-400">
          Stage 3 接入对话列表
        </div>
      </aside>

      <main className="flex flex-col">
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-neutral-400">
          选择一个角色开始聊天
        </div>
      </main>
    </div>
  );
}
