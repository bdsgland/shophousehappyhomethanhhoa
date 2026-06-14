/**
 * Markdown → HTML tối giản, AN TOÀN (escape HTML trước rồi tự thêm thẻ).
 *
 * Hỗ trợ: tiêu đề (#..######), in đậm **, in nghiêng *, link [text](url),
 * danh sách - / *, đoạn văn. Nội dung do admin/AI soạn (tin cậy) nhưng vẫn
 * escape để tránh chèn HTML/script ngoài ý muốn. Nếu nội dung đã là HTML
 * (bắt đầu bằng thẻ <…>) thì trả nguyên (admin chủ động dùng HTML).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  let out = escapeHtml(s);
  // Link [text](url) — chỉ cho http(s) hoặc đường dẫn nội bộ bắt đầu bằng /.
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,
    '<a href="$2" class="text-brand-600 underline">$1</a>',
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return out;
}

export function renderMarkdown(md: string): string {
  const text = (md || "").trim();
  if (!text) return "";
  // Nếu trông như HTML thì giữ nguyên (admin chủ động nhập HTML).
  if (/^<\w+[\s>]/.test(text)) return text;

  const lines = text.split(/\r?\n/);
  const html: string[] = [];
  let inList = false;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      html.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      closeList();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      closeList();
      const level = h[1].length;
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    para.push(line);
  }
  flushPara();
  closeList();
  return html.join("\n");
}
