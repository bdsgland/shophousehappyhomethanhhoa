import {
  LayoutDashboard,
  Users,
  BadgeDollarSign,
  Building2,
  BookOpen,
  MessagesSquare,
  Server,
  Settings,
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
  { href: "/users", label: "Người dùng", icon: Users },
  { href: "/sales", label: "Sale & Hoa hồng", icon: BadgeDollarSign },
  { href: "/inventory", label: "Quỹ căn", icon: Building2 },
  { href: "/kb", label: "Tài liệu RAG", icon: BookOpen },
  { href: "/conversations", label: "Hội thoại", icon: MessagesSquare },
  { href: "/platforms", label: "Nền tảng", icon: Server },
  { href: "/settings", label: "Cấu hình", icon: Settings },
];
