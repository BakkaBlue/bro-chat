import { useState } from "react";

// HTML5 拖拽排序：拖动项时实时重排本地数组，松手时持久化。
// 用法：
//   const { dragIndex, itemProps } = useDragSort(items, setItemsLocally, (ids) => api.reorder(ids));
//   {items.map((it, i) => <div {...itemProps(i)} className={dragIndex === i ? "opacity-40" : ""}>)}
export function useDragSort<T extends { id: string }>(
  items: T[],
  onLocalReorder: (newItems: T[]) => void,
  onCommit: (ids: string[]) => void,
) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const itemProps = (index: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = "move";
      // Firefox 需要设置数据才能启动拖拽
      e.dataTransfer.setData("text/plain", String(index));
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index) return;
      // 实时重排：把拖拽中的项插入到当前悬停位置
      const arr = [...items];
      const [moved] = arr.splice(dragIndex, 1);
      arr.splice(index, 0, moved);
      onLocalReorder(arr);
      setDragIndex(index);
    },
    onDragEnd: () => {
      if (dragIndex !== null) {
        // 闭包里的 items 已是重排后的最新列表
        onCommit(items.map((x) => x.id));
      }
      setDragIndex(null);
    },
  });

  return { dragIndex, itemProps };
}
