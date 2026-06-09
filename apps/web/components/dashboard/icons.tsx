"use client";

import type { SVGProps } from "react";

// Bộ icon inline theo phong cách lucide-react (stroke 2, 24x24) — tự chứa,
// không cần cài thêm package để bảo đảm `next build` luôn pass.
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function Home(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

export function MapPin(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function GraduationCap(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M22 9 12 5 2 9l10 4 10-4Z" />
      <path d="M6 11v5c0 1 2.5 3 6 3s6-2 6-3v-5" />
    </svg>
  );
}

export function Grid(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

export function Map(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m9 4 6 2 5-2v14l-5 2-6-2-5 2V6l5-2Z" />
      <path d="M9 4v14" />
      <path d="M15 6v14" />
    </svg>
  );
}

export function Database(p: IconProps) {
  return (
    <svg {...base(p)}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  );
}

export function Camera(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  );
}

export function FileText(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}

export function TrendingUp(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M17 7h4v4" />
    </svg>
  );
}

export function BookOpen(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 6C10.5 5 8 4.5 4 4.5V19c4 0 6.5.5 8 1.5" />
      <path d="M12 6c1.5-1 4-1.5 8-1.5V19c-4 0-6.5.5-8 1.5Z" />
    </svg>
  );
}

export function Newspaper(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 6h13v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
      <path d="M17 8h2a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2" />
      <path d="M7 9h7M7 13h7M7 17h4" />
    </svg>
  );
}

export function Share2(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

export function Download(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function Eye(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function ChevronLeft(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

export function ChevronRight(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

export function Check(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

export function ChevronRightSmall(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function User(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    </svg>
  );
}

export function Users(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 21c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M21 21c0-3.3-2.2-6-5-6" />
    </svg>
  );
}

export function DollarSign(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 2v20" />
      <path d="M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.8 7 7s2.2 3 5 3.5 5 1.3 5 3.5-2.2 3.5-5 3.5-5-1.1-5-3" />
    </svg>
  );
}

export function ShoppingBag(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 7h14l-1 13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1Z" />
      <path d="M9 7V6a3 3 0 0 1 6 0v1" />
    </svg>
  );
}

export function Calendar(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function Heart(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 20s-7-4.4-9.3-9C1.4 8.3 2.6 5 6 5c2 0 3.2 1.3 4 2.5C10.8 6.3 12 5 14 5c3.4 0 4.6 3.3 3.3 6-2.3 4.6-9.3 9-9.3 9Z" />
    </svg>
  );
}

export function Copy(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

export function LogOut(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l-5-5 5-5" />
      <path d="M5 12h12" />
    </svg>
  );
}

export function Award(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 14 7 22l5-3 5 3-1.5-8" />
    </svg>
  );
}

export function MessageCircle(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.2A8.4 8.4 0 0 1 21 11.5Z" />
    </svg>
  );
}

export function Calculator(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M8 6h8" />
      <path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </svg>
  );
}

export function GitCompare(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M6 15V9a3 3 0 0 1 3-3h6" />
      <path d="M18 9v6a3 3 0 0 1-3 3H9" />
    </svg>
  );
}

export function Send(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

export function Sparkles(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8Z" />
      <path d="M19 14l.7 1.8L21.5 16l-1.8.7L19 18.5l-.7-1.8L16.5 16l1.8-.7Z" />
    </svg>
  );
}

export function Search(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function Upload(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M12 4v12" />
    </svg>
  );
}

export function Trash2(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function X(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function Phone(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}

export function Target(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  );
}

export function Trophy(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M6 4h12v4a6 6 0 0 1-12 0V4Z" />
      <path d="M6 6H3v1a4 4 0 0 0 4 4M18 6h3v1a4 4 0 0 1-4 4" />
      <path d="M10 14v3M14 14v3M8 21h8M9 21v-1.5a3 3 0 0 1 6 0V21" />
    </svg>
  );
}

export function Flame(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 2c1 3-2 4-2 7a2 2 0 0 0 4 0c0-1 0-1 0-1 2 1.5 3 3.8 3 6a5 5 0 0 1-10 0c0-3.5 2.5-5 3-8 .4-1.8.8-3 2-4Z" />
    </svg>
  );
}

export function ClipboardList(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
      <path d="M8 11h8M8 15h6" />
    </svg>
  );
}

export function Video(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m22 8-6 4 6 4V8Z" />
    </svg>
  );
}

export function Radio(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="2" />
      <path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4" />
    </svg>
  );
}
