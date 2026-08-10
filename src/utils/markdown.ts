import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });

/** CJK 感知的 token 估算（与 Rust 侧 estimate_tokens 一致） */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const c of text) {
    const code = c.codePointAt(0) ?? 0;
    if (
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x20000 && code <= 0x2a6df) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      cjk++;
    } else {
      other++;
    }
  }
  return cjk + Math.ceil(other / 4);
}

/** Markdown → 净化后的 HTML；blockExternal 时移除外部图片/媒体 */
export function renderMarkdown(text: string, blockExternal = false): string {
  const html = marked.parse(text, { async: false }) as string;
  let clean = DOMPurify.sanitize(html);
  if (blockExternal) {
    const doc = new DOMParser().parseFromString(clean, "text/html");
    doc.querySelectorAll("img, audio, video, iframe").forEach((el) => {
      const src = el.getAttribute("src") ?? "";
      if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("//")) {
        el.remove();
      }
    });
    clean = doc.body.innerHTML;
  }
  return clean;
}
