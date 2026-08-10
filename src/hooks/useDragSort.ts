import { useRef, useState } from "react";

// 纯指针事件拖拽排序（不依赖 HTML5 DnD，WebView2 下可靠）：
// - mousedown 记录起点；移动超过阈值才激活拖拽（点击/按钮不受影响）
// - 拖动时按鼠标位置实时重排列表（被拖项半透明跟随移动）
// - mouseup 时持久化顺序；未激活（点击）则不动作
// 用法：
//   const { dragIndex, itemMouseDown } = useDragSort(listRef, items, (ids) => reorderLocally(ids), () => commitReorder(), disabled);
//   {items.map((it, i) => (
//     <div data-sortable onMouseDown={itemMouseDown(i)} className={dragIndex === i ? "opacity-40" : ""}>
export function useDragSort<T extends { id: string }>(
  listRef: React.RefObject<HTMLElement | null>,
  items: T[],
  onLocalReorder: (ids: string[]) => void,
  onCommit: () => void,
  disabled = false,
) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // 拖拽会话状态（不触发重渲染）
  const state = useRef<{ index: number; startY: number; active: boolean } | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const itemMouseDown = (index: number) => (e: React.MouseEvent) => {
    if (disabled || e.button !== 0) return;
    state.current = { index, startY: e.clientY, active: false };

    const onMove = (ev: MouseEvent) => {
      const st = state.current;
      if (!st) return;
      if (!st.active) {
        // 移动阈值内视为点击，不激活拖拽
        if (Math.abs(ev.clientY - st.startY) < 5) return;
        st.active = true;
        setDragIndex(st.index);
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
      }
      // 实时重排：找到鼠标当前所在的条目位置
      const listEl = listRef.current;
      if (!listEl) return;
      const els = listEl.querySelectorAll("[data-sortable]");
      let target = -1;
      els.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) {
          target = i;
        }
      });
      if (target >= 0 && target !== st.index) {
        const arr = [...itemsRef.current];
        const [moved] = arr.splice(st.index, 1);
        arr.splice(target, 0, moved);
        onLocalReorder(arr.map((x) => x.id));
        st.index = target; // 被拖项已移动到新位置
      }
    };

    const onUp = () => {
      const st = state.current;
      if (st?.active) {
        onCommit();
      }
      state.current = null;
      setDragIndex(null);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return { dragIndex, itemMouseDown };
}
