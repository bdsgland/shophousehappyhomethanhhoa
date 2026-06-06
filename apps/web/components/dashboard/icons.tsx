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
