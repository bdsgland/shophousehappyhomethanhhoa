// Metadata tĩnh của 5 nền tảng — dùng cho trang /platforms (logo, mô tả, link mở).
// Trạng thái sức khoẻ lấy động từ API /admin/platforms/health (xem lib/api.ts).

export interface PlatformMeta {
  key: string;
  name: string;
  description: string;
  url: string;
  embeddable: boolean; // có thể nhúng iframe trong tab không
  warning?: string;
}

const CHATWOOT =
  process.env.NEXT_PUBLIC_CHATWOOT_URL || "https://chat.eurowindowlightcity.net";

export const PLATFORMS: PlatformMeta[] = [
  {
    key: "api",
    name: "Agent Engine (API)",
    description: "Backend FastAPI: auth, leads, inventory, chat AI.",
    url: "https://api.eurowindowlightcity.net/docs",
    embeddable: false,
  },
  {
    key: "n8n",
    name: "n8n Automation",
    description: "Workflow tự động hoá: webhook, đồng bộ lead, gửi thông báo.",
    url: "https://n8n.eurowindowlightcity.net",
    embeddable: false,
  },
  {
    key: "note",
    name: "Open Notebook",
    description: "Knowledge base & nghiên cứu tài liệu dự án.",
    url: "https://note.eurowindowlightcity.net",
    embeddable: false,
  },
  {
    key: "bot",
    name: "OpenClaw",
    description: "Agent đa năng (browser automation).",
    url: "https://bot.eurowindowlightcity.net",
    embeddable: false,
    warning: "Login UI lỗi — chờ fix",
  },
  {
    key: "chat",
    name: "Chatwoot",
    description: "Tổng đài chăm sóc khách hàng đa kênh.",
    url: CHATWOOT,
    embeddable: true,
  },
];
