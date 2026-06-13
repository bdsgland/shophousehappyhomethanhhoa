"use client";

import { useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import DecisionCenter from "./DecisionCenter";
import SystemIntro from "./SystemIntro";

// ---------------------------------------------------------------------------
// Trang chính — 2 tab: Điều hành (Trung tâm quyết định) · Giới thiệu hệ thống
// ---------------------------------------------------------------------------
type ManagerTab = "dieu-hanh" | "gioi-thieu";

export default function ManagerPage() {
  const [tab, setTab] = useState<ManagerTab>("dieu-hanh");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trung tâm điều hành"
        description="Việc cần người điều hành quyết định và báo cáo tổng quan hệ thống."
      />

      {/* Tab điều hướng */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab("dieu-hanh")}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "dieu-hanh"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Điều hành
        </button>
        <button
          onClick={() => setTab("gioi-thieu")}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "gioi-thieu"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Giới thiệu hệ thống
        </button>
      </div>

      {tab === "dieu-hanh" && <DecisionCenter />}
      {tab === "gioi-thieu" && <SystemIntro />}
    </div>
  );
}
