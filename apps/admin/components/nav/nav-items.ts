import {
  LayoutDashboard,
  Users,
  UserSquare2,
  BadgeDollarSign,
  Building2,
  BookOpen,
  KanbanSquare,
  Inbox,
  Medal,
  Radio,
  Settings,
  Workflow,
  Command,
  Wallet,
  UserCog,
  Megaphone,
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
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/customers/performance", label: "Hiệu suất Sale", icon: Medal },
  { href: "/users", label: "Người dùng", icon: Users },
  { href: "/hr", label: "Nhân sự", icon: UserCog },
  { href: "/sales", label: "Sale & Hoa hồng", icon: BadgeDollarSign },
  { href: "/finance", label: "Tài chính", icon: Wallet },
  { href: "/inventory", label: "Quỹ căn", icon: Building2 },
  { href: "/kb", label: "Tài liệu RAG", icon: BookOpen },
  { href: "/inbox", label: "Hộp thư đa kênh", icon: Inbox },
  { href: "/marketing", label: "AI Marketing", icon: Megaphone },
  { href: "/automation", label: "Automation", icon: Workflow },
  { href: "/settings", label: "Cấu hình", icon: Settings },
];
