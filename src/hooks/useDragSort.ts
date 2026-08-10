import { useState } from "react";

// HTML5 拖拽排序（插入指示线方案）：
// 拖拽期间不改变列表顺序（DOM 稳定，浏览器 DnD 可靠），
// 悬停时在目标位置显示指示线，松手（drop）时一次性重排并持久化。
// 用法：
//   const { dragIndex, overIndex, itemProps } = useDragSort(items, (arr) => {
//     reorderLocally(arr.map(x => x.id));
//     commitReorder();
//   });
//   {items.map((it, i) => (
//     <div {...itemProps(i)} className={overIndex === i ? "border-t-2 border-indigo-400" : ""}>
//       ...
//     </div>
//   ))}
export function useDragSort<T extends { id: string }>(
  items: T[],
  onCommitOrder: (reordered: T[]) => void,
) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const itemProps = (index: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragIndex(index);
      setOverIndex(null);
      e.dataTransfer.effectAllowed = "move";
      // Chromium/WebView2 需要 setData 才稳定启动拖拽
      e.dataTransfer.setData("text/plain", String(index));
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault(); // 允许 drop
      if (dragIndex === null) return;
      // 指针在元素上半部 → 插到它前面，下半部 → 后面
      const rect = e.currentTarget.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const target = before ? index : index + 1;
      if (target !== overIndex) setOverIndex(target);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragIndex === null) return;
      // 一次性重排：把拖拽项移动到指示线位置
      const arr = [...items];
      const [moved] = arr.splice(dragIndex, 1);
      const insertAt =
        overIndex === null
          ? dragIndex
          : overIndex > dragIndex
            ? overIndex - 1
            : overIndex;
      arr.splice(insertAt, 0, moved);
      onCommitOrder(arr);
      setDragIndex(null);
      setOverIndex(null);
    },
    onDragEnd: () => {
      // 拖到列表外释放：放弃本次拖拽
      setDragIndex(null);
      setOverIndex(null);
    },
  });

  return { dragIndex, overIndex, itemProps };
}
