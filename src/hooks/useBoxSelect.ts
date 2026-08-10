import { useRef, useState } from "react";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function intersect(a: Rect, b: DOMRect): boolean {
  return a.x < b.right && a.x + a.w > b.left && a.y < b.bottom && a.y + a.h > b.top;
}

// 鼠标框选：在容器空白区域按住拖拽出选框，松手时把与选框相交的项回调给调用方。
// 点击项本身不会触发框选（与点击/拖拽排序自然分离）。
export function useBoxSelect(options: {
  containerRef: React.RefObject<HTMLElement | null>;
  itemCount: number;
  /** 第 i 项的元素（用于相交计算） */
  getItemEl: (i: number) => HTMLElement | null;
  onSelectRange: (indices: number[]) => void;
}) {
  const [box, setBox] = useState<Rect | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    // 仅空白区域（容器本身）触发；点击列表项不触发
    if (e.target !== options.containerRef.current) return;
    if (e.button !== 0) return;
    e.preventDefault();
    startRef.current = { x: e.clientX, y: e.clientY };

    const onMove = (ev: MouseEvent) => {
      const s = startRef.current;
      if (!s) return;
      setBox({
        x: Math.min(s.x, ev.clientX),
        y: Math.min(s.y, ev.clientY),
        w: Math.abs(ev.clientX - s.x),
        h: Math.abs(ev.clientY - s.y),
      });
    };
    const onUp = (ev: MouseEvent) => {
      const s = startRef.current;
      if (s) {
        const rect: Rect = {
          x: Math.min(s.x, ev.clientX),
          y: Math.min(s.y, ev.clientY),
          w: Math.abs(ev.clientX - s.x),
          h: Math.abs(ev.clientY - s.y),
        };
        if (rect.w > 4 || rect.h > 4) {
          const indices: number[] = [];
          for (let i = 0; i < options.itemCount; i++) {
            const el = options.getItemEl(i);
            if (el && intersect(rect, el.getBoundingClientRect())) {
              indices.push(i);
            }
          }
          if (indices.length > 0) options.onSelectRange(indices);
        }
      }
      setBox(null);
      startRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return { box, onMouseDown };
}
