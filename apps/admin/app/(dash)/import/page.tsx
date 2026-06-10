"use client";

import { useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/components/PageHeader";
import { ImportPanel } from "@/components/import/ImportPanel";

/**
 * Route /import giữ lại để truy cập trực tiếp (không còn trong sidebar — chức
 * năng chính đã đặt trong modal ở trang Khách hàng). Tái dùng ImportPanel.
 */
export default function ImportPage() {
  const qc = useQueryClient();
  return (
    <div>
      <PageHeader
        title="Nhập dữ liệu khách hàng"
        description="Nhập khách hàng hàng loạt từ Google Trang tính hoặc file CSV/XLSX — xem trước, ghép cột rồi nhập."
      />
      <ImportPanel
        onImported={() => {
          qc.invalidateQueries({ queryKey: ["crm-leads"] });
          qc.invalidateQueries({ queryKey: ["crm-stats"] });
        }}
      />
    </div>
  );
}
