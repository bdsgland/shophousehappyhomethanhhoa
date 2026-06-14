import {
  LayoutDashboard,
  Users,
  UserSquare2,
  BadgeDollarSign,
  FolderKanban,
  Radio,
  Settings,
  Workflow,
  Command,
  Wallet,
  UserCog,
  Megaphone,
  Bot,
  UserSearch,
  Store,
  Newspaper,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  phase2?: boolean; // chức năng làm ở phase 2 (hiển thị nhãn "sắp ra mắt")
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/manager", label: "Điều hành", icon: Command },
  { href: "/live", label: "Live Match", icon: Radio },
  { href: "/customers", label: "Khách hàng", icon: UserSquare2 },
  { href: "/customer-360", label: "Customer 360", icon: UserSearch },
  { href: "/users", label: "Người dùng", icon: Users },
  { href: "/agencies", label: "Đại lý F2", icon: Store },
  { href: "/hr", label: "Nhân sự", icon: UserCog },
  { href: "/sales", label: "Sale & Hoa hồng", icon: BadgeDollarSign },
  { href: "/finance", label: "Tài chính", icon: Wallet },
  // "Dự án" gộp Quỹ căn + Mặt bằng + Tài liệu RAG + Chính sách vào sub-tab.
  // Route cũ /inventory và /kb GIỮ NGUYÊN (không vỡ build / link cũ) — chỉ bỏ khỏi nav.
  { href: "/projects", label: "Dự án", icon: FolderKanban },
  { href: "/marketing", label: "AI Marketing", icon: Megaphone },
  { href: "/seo", label: "SEO & Tin tức", icon: Newspaper },
  { href: "/crew", label: "Đội Sale AI", icon: Bot },
  { href: "/automation", label: "Automation", icon: Workflow },
  { href: "/settings", label: "Cấu hình", icon: Settings },
];
