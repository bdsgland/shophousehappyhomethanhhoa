import type { HRRole, KPIMetric } from "@/lib/types";

export const HR_ROLE_LABEL: Record<string, string> = {
  admin: "Quản trị",
  manager: "Quản lý",
  sale: "Sale",
  marketing: "Marketing",
  accountant: "Kế toán",
  support: "Hỗ trợ / CSKH",
  client: "Khách hàng",
};

/** Vai trò gán được cho nhân sự (loại 'client' — khách hàng không phải nhân sự). */
export const HR_STAFF_ROLES: { value: HRRole; label: string }[] = [
  { value: "sale", label: "Sale" },
  { value: "manager", label: "Quản lý" },
  { value: "marketing", label: "Marketing" },
  { value: "accountant", label: "Kế toán" },
  { value: "support", label: "Hỗ trợ / CSKH" },
  { value: "admin", label: "Quản trị" },
];

export const KPI_METRIC_LABEL: Record<KPIMetric, string> = {
  revenue: "Doanh số",
  commission: "Hoa hồng",
  deals: "Số deal",
  leads: "Lead mới",
  contacts: "Cuộc gọi",
  meetings: "Cuộc hẹn",
};

export const KPI_METRICS: { value: KPIMetric; label: string }[] = [
  { value: "revenue", label: "Doanh số (VND)" },
  { value: "commission", label: "Hoa hồng (VND)" },
  { value: "deals", label: "Số deal đóng" },
  { value: "leads", label: "Số lead thêm mới" },
  { value: "contacts", label: "Số cuộc gọi/liên hệ" },
  { value: "meetings", label: "Số cuộc hẹn" },
];

const VND = new Intl.NumberFormat("vi-VN");

/** Format giá trị chỉ số: revenue/commission kèm 'đ', còn lại là số thường. */
export function formatMetricValue(metric: string, value: number): string {
  if (metric === "revenue" || metric === "commission") {
    return `${VND.format(Math.round(value))} đ`;
  }
  return VND.format(Math.round(value));
}
