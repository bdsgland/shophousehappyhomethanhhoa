"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Calendar, LayoutGrid, Pencil, Phone, Sparkles, UserSquare2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { getCrmLead, listSales } from "@/lib/api";
import { shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AiInsightCard } from "@/components/crm/AiInsightCard";
import { Customer360 } from "@/components/crm/Customer360";
import { EditLeadModal } from "@/components/crm/EditLeadModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";

const STATUS_LABEL: Record<string, string> = {
  cold: "Lạnh",
  warm: "Ấm",
  hot: "Nóng",
  customer: "Khách hàng",
  lost: "Đã mất",
};
const SOURCE_LABEL: Record<string, string> = {
  imported: "Danh bạ",
  registered: "Tự đăng ký",
  referral: "Giới thiệu",
  fb_ads: "FB Ads",
  zalo: "Zalo",
  email: "Email",
  manual: "Nhập tay",
  google_sheet: "Google Sheet",
  file_upload: "Tải file",
};
const CHANNEL_LABEL: Record<string, string> = {
  call: "Gọi điện",
  sms: "SMS",
  zalo: "Zalo",
  facebook: "Facebook",
  email: "Email",
  inperson: "Gặp trực tiếp",
};
const OUTCOME_LABEL: Record<string, string> = {
  no_answer: "Không nghe máy",
  interested: "Quan tâm",
  not_interested: "Không quan tâm",
  callback: "Hẹn gọi lại",
  booked: "Đã đặt lịch",
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"overview" | "profile360">("overview");
  const [editOpen, setEditOpen] = useState(false);
  const leadQ = useQuery({ queryKey: ["crm-lead", id], queryFn: () => getCrmLead(id) });
  const salesQ = useQuery({ queryKey: ["sales"], queryFn: listSales });

  const lead = leadQ.data;
  // Guard: backend có thể không trả contact_logs → tránh `.length`/`.map` throw làm trắng trang.
  const contactLogs = lead?.contact_logs ?? [];
  const saleName = lead?.assigned_sale_id
    ? salesQ.data?.sales?.find((s) => s.id === lead.assigned_sale_id)?.full_name ?? lead.assigned_sale_id
    : "Chưa phân bổ";

  // AI scoring breakdown — phản chiếu rule ở backend compute_ai_score.
  const breakdown = lead
    ? [
        { label: "Đã đăng ký tài khoản web", pts: lead.registered ? 20 : 0, max: 20 },
        { label: "Có ít nhất 1 lịch hẹn", pts: lead.booking_count >= 1 ? 30 : 0, max: 30 },
        {
          label: "≥5 lượt liên hệ hiệu quả",
          pts: lead.contact_count >= 5 ? 10 : 0,
          max: 10,
        },
        {
          label: "Vừa liên hệ < 3 ngày",
          pts:
            lead.days_since_contact !== null && lead.days_since_contact < 3 ? 5 : 0,
          max: 5,
        },
        { label: "Ghi chú chi tiết (>50 ký tự)", pts: (lead.note?.length ?? 0) > 50 ? 5 : 0, max: 5 },
      ]
    : [];

  return (
    <div>
      <Link
        href="/customers"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>

      {leadQ.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : leadQ.isError ? (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-6 text-sm">
          <h2 className="mb-1 text-base font-semibold text-danger">
            Không tải được thông tin khách
          </h2>
          <p className="text-muted-foreground">
            {(leadQ.error as Error)?.message ?? "Đã xảy ra lỗi khi tải dữ liệu."}
          </p>
          <button
            onClick={() => leadQ.refetch()}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Thử lại
          </button>
        </div>
      ) : !lead ? (
        <div className="rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          Không tìm thấy khách hàng này.
        </div>
      ) : (
        <>
          <PageHeader
            title={lead.name}
            description={`${SOURCE_LABEL[lead.source] ?? lead.source} · phụ trách: ${saleName}`}
            action={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Sửa thông tin
                </Button>
                <Badge variant={lead.status === "hot" ? "danger" : lead.status === "customer" ? "success" : "muted"}>
                  {STATUS_LABEL[lead.status] ?? lead.status}
                </Badge>
              </div>
            }
          />

          <EditLeadModal
            lead={lead}
            sales={salesQ.data?.sales ?? []}
            open={editOpen}
            onClose={() => setEditOpen(false)}
            onSaved={() => {
              leadQ.refetch();
              qc.invalidateQueries({ queryKey: ["crm-360", id] });
              qc.invalidateQueries({ queryKey: ["crm-leads"] });
            }}
          />

          <Tabs
            className="mb-5"
            value={tab}
            onChange={(k) => setTab(k as "overview" | "profile360")}
            tabs={[
              { key: "overview", label: "Tổng quan", icon: <LayoutGrid className="h-4 w-4" /> },
              { key: "profile360", label: "Hồ sơ 360°", icon: <UserSquare2 className="h-4 w-4" /> },
            ]}
          />

          {tab === "profile360" ? (
            <ErrorBoundary>
              <Customer360 leadId={lead.id} />
            </ErrorBoundary>
          ) : (
          <ErrorBoundary>
          <>
          <div className="grid gap-5 lg:grid-cols-3">
            {/* Info + engagement */}
            <Card className="p-5 lg:col-span-1">
              <h3 className="mb-3 text-sm font-semibold">Thông tin</h3>
              <dl className="space-y-2 text-sm">
                <Row label="SĐT" value={<a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 text-primary"><Phone className="h-3.5 w-3.5" />{lead.phone}</a>} />
                <Row label="Email" value={lead.email ?? "—"} />
                <Row label="Nguồn" value={SOURCE_LABEL[lead.source] ?? lead.source} />
                <Row label="Đăng ký web" value={lead.registered ? "Có" : "Chưa"} />
                <Row label="Số lịch hẹn" value={String(lead.booking_count)} />
                <Row label="Số lượt liên hệ" value={String(lead.contact_count)} />
                <Row label="Liên hệ gần nhất" value={lead.last_contact_at ? shortDate(lead.last_contact_at) : "Chưa"} />
                <Row label="Ngày tạo" value={lead.created_at ? shortDate(lead.created_at) : "—"} />
              </dl>
              {lead.note && (
                <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Ghi chú</span>
                  <p className="mt-1">{lead.note}</p>
                </div>
              )}
            </Card>

            {/* AI scoring breakdown */}
            <Card className="p-5 lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-warning" /> Điểm quy tắc (tham khảo)
                </h3>
                <span className="text-2xl font-bold text-primary">{lead.ai_score}/100</span>
              </div>
              <ul className="space-y-2">
                {breakdown.map((b) => (
                  <li key={b.label} className="flex items-center justify-between text-sm">
                    <span className={b.pts > 0 ? "text-foreground" : "text-muted-foreground"}>
                      {b.pts > 0 ? "✅" : "⬜"} {b.label}
                    </span>
                    <span className={b.pts > 0 ? "font-medium text-success" : "text-muted-foreground"}>
                      +{b.pts}/{b.max}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Phân tích AI thật (điểm + tier + lý do + best time + next action) */}
          <div className="mt-5">
            <AiInsightCard leadId={lead.id} />
          </div>

          {/* Contact log timeline */}
          <Card className="mt-5 p-5">
            <h3 className="mb-3 text-sm font-semibold">Lịch sử liên hệ ({contactLogs.length})</h3>
            {contactLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có lượt liên hệ nào.</p>
            ) : (
              <ol className="relative border-l border-border pl-5">
                {contactLogs.map((log) => (
                  <li key={log.id} className="mb-4 last:mb-0">
                    <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-primary" />
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {CHANNEL_LABEL[log.channel] ?? log.channel} ·{" "}
                        <span className="text-muted-foreground">{OUTCOME_LABEL[log.outcome] ?? log.outcome}</span>
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {shortDate(log.created_at)}
                      </span>
                    </div>
                    {log.note && <p className="mt-1 text-sm text-muted-foreground">{log.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <p className="mt-4 text-xs text-muted-foreground">
            Lịch sử hội thoại (chatbot/Chatwoot) & audit log đầy đủ sẽ bổ sung ở Phase 2.
          </p>
          </>
          </ErrorBoundary>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
