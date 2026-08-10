import { listen } from "@tauri-apps/api/event";

export interface ChunkPayload {
  requestId: string;
  delta: string;
}
export interface DonePayload {
  requestId: string;
  messageId: string;
}
export interface ErrorPayload {
  requestId: string;
  message: string;
  partialSaved: boolean;
}
export interface CancelledPayload {
  requestId: string;
  partialSaved: boolean;
}

export interface ChatEventHandlers {
  onChunk: (p: ChunkPayload) => void;
  onDone: (p: DonePayload) => void;
  onError: (p: ErrorPayload) => void;
  onCancelled: (p: CancelledPayload) => void;
}

/** 注册 chat:* 事件监听，返回解绑函数 */
export function onChatEvents(h: ChatEventHandlers): () => void {
  const unlisten: Promise<() => void>[] = [
    listen<ChunkPayload>("chat:chunk", (e) => h.onChunk(e.payload)),
    listen<DonePayload>("chat:done", (e) => h.onDone(e.payload)),
    listen<ErrorPayload>("chat:error", (e) => h.onError(e.payload)),
    listen<CancelledPayload>("chat:cancelled", (e) => h.onCancelled(e.payload)),
  ];
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    unlisten.forEach((p) => p.then((f) => f()));
  };
}
