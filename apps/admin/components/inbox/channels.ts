// Nhãn + bộ lọc kênh dùng chung cho Hộp thư đa kênh.

export const CHANNEL_LABELS: Record<string, string> = {
  all: "Tất cả",
  web: "Chat web",
  facebook: "Facebook",
  zalo: "Zalo",
  email: "Email",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
  sms: "SMS",
  line: "LINE",
  api: "API",
  chatwoot: "Chatwoot",
};

export function channelLabel(channel?: string | null): string {
  if (!channel) return "Khác";
  return CHANNEL_LABELS[channel] ?? channel;
}

// Bộ lọc kênh hiển thị ở đầu danh sách (theo yêu cầu: tất cả/web/FB/Zalo/email).
export const CHANNEL_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "web", label: "Web" },
  { value: "facebook", label: "Facebook" },
  { value: "zalo", label: "Zalo" },
  { value: "email", label: "Email" },
];
