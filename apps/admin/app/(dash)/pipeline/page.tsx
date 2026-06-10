"use client";

import { PageHeader } from "@/components/PageHeader";
import { PipelineBoard } from "@/components/crm/PipelineBoard";

export default function PipelinePage() {
  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Luồng chuyển đổi khách theo 9 giai đoạn — kanban đổi giai đoạn trực tiếp."
      />
      <PipelineBoard />
    </div>
  );
}
