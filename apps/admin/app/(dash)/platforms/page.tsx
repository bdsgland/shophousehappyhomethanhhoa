"use client";

import { PageHeader } from "@/components/PageHeader";
import { PlatformsPanel } from "@/components/platforms/PlatformsPanel";

export default function PlatformsPage() {
  return (
    <div>
      <PageHeader
        title="Nền tảng"
        description="Sức khoẻ & truy cập nhanh các nền tảng của hệ thống ELC."
      />
      <PlatformsPanel />
    </div>
  );
}
