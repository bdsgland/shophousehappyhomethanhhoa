import { ComingSoon } from "@/components/ComingSoon";

export default function SettingsPage() {
  return (
    <ComingSoon
      title="Cấu hình"
      description="Cấu hình site, khoá tích hợp và nhật ký kiểm toán."
      bullets={[
        "Cấu hình thông tin site & branding",
        "Quản lý khoá tích hợp (Chatwoot, Zalo, n8n…)",
        "Audit log thao tác quản trị",
        "Bật/tắt tính năng theo môi trường",
      ]}
    />
  );
}
