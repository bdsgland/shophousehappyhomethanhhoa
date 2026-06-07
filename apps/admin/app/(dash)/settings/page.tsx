"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  HardDriveDownload,
  Save,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  getSettings,
  listBackups,
  triggerBackup,
  updateSettings,
} from "@/lib/api";
import type { SystemConfig } from "@/lib/types";
import { shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { AuditLogTable } from "@/components/settings/AuditLogTable";
import { IntegrationsList } from "@/components/settings/IntegrationsList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";

const TABS = [
  { key: "general", label: "Chung", icon: <Settings2 className="h-4 w-4" /> },
  { key: "integrations", label: "Tích hợp", icon: <Database className="h-4 w-4" /> },
  { key: "notifications", label: "Thông báo", icon: <ShieldCheck className="h-4 w-4" /> },
  { key: "audit", label: "Nhật ký", icon: <ShieldCheck className="h-4 w-4" /> },
  { key: "backup", label: "Sao lưu", icon: <HardDriveDownload className="h-4 w-4" /> },
];

const NOTIF_LABELS: { key: keyof SystemConfig["notifications"]; label: string; desc: string }[] = [
  {
    key: "email_on_hot_lead",
    label: "Email khi có lead nóng",
    desc: "Gửi email cho admin/sale khi AI chấm một lead đạt ngưỡng nóng.",
  },
  {
    key: "telegram_on_hot_lead",
    label: "Telegram khi có lead nóng",
    desc: "Bắn cảnh báo Telegram cho sale phụ trách.",
  },
  {
    key: "notify_sale_on_assignment",
    label: "Báo sale khi được gán lead",
    desc: "Thông báo cho sale ngay khi một lead được gán.",
  },
  {
    key: "daily_briefing",
    label: "Bản tin sáng hằng ngày",
    desc: "n8n gửi tổng hợp lead cần follow-up mỗi sáng.",
  },
];

export default function SettingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("general");
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  return (
    <div>
      <PageHeader
        title="Cấu hình"
        description="Thông tin site, tích hợp, thông báo, nhật ký kiểm toán và sao lưu."
      />

      <Tabs tabs={TABS} value={tab} onChange={setTab} className="mb-5" />

      {tab === "general" && (
        <GeneralTab config={data?.config} loading={isLoading} onSaved={() => qc.invalidateQueries({ queryKey: ["settings"] })} />
      )}

      {tab === "integrations" && (
        <div>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <IntegrationsList items={data?.integrations ?? []} />
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Trạng thái kết nối đọc trực tiếp từ biến môi trường của backend. Để đổi
            khoá tích hợp (token Chatwoot, Telegram, n8n…), cập nhật biến môi trường
            trên Railway rồi tải lại trang.
          </p>
        </div>
      )}

      {tab === "notifications" && (
        <NotificationsTab config={data?.config} loading={isLoading} onSaved={() => qc.invalidateQueries({ queryKey: ["settings"] })} />
      )}

      {tab === "audit" && <AuditLogTable />}

      {tab === "backup" && <BackupTab />}
    </div>
  );
}

// --------------------------------------------------------------------------
// Tab Chung
// --------------------------------------------------------------------------

function GeneralTab({
  config,
  loading,
  onSaved,
}: {
  config?: SystemConfig;
  loading: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<SystemConfig["general"] | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) setForm(config.general);
  }, [config]);

  const mut = useMutation({
    mutationFn: (g: SystemConfig["general"]) => updateSettings({ general: g }),
    onSuccess: () => {
      onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (loading || !form) return <Skeleton className="h-64 w-full" />;

  const fields: { key: keyof SystemConfig["general"]; label: string; placeholder: string }[] = [
    { key: "site_name", label: "Tên hệ thống", placeholder: "Eurowindow Light City" },
    { key: "logo_url", label: "URL logo", placeholder: "https://…/logo.png" },
    { key: "contact_email", label: "Email liên hệ", placeholder: "info@…" },
    { key: "contact_phone", label: "Hotline", placeholder: "1900 0000" },
    { key: "working_hours", label: "Giờ làm việc", placeholder: "08:00 - 18:00" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông tin chung</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Input
                value={form[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => mut.mutate(form)} disabled={mut.isPending}>
            <Save className="h-4 w-4" />
            {mut.isPending ? "Đang lưu…" : "Lưu cấu hình"}
          </Button>
          {saved && <Badge variant="success">Đã lưu</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------------
// Tab Thông báo
// --------------------------------------------------------------------------

function NotificationsTab({
  config,
  loading,
  onSaved,
}: {
  config?: SystemConfig;
  loading: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<SystemConfig["notifications"] | null>(null);

  useEffect(() => {
    if (config) setForm(config.notifications);
  }, [config]);

  const mut = useMutation({
    mutationFn: (n: SystemConfig["notifications"]) => updateSettings({ notifications: n }),
    onSuccess: onSaved,
  });

  if (loading || !form) return <Skeleton className="h-64 w-full" />;

  function toggle(key: keyof SystemConfig["notifications"]) {
    if (!form) return;
    const next = { ...form, [key]: !form[key] };
    setForm(next);
    mut.mutate(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quy tắc thông báo</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {NOTIF_LABELS.map((n) => (
          <div key={n.key} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
            <div>
              <p className="text-sm font-medium">{n.label}</p>
              <p className="text-xs text-muted-foreground">{n.desc}</p>
            </div>
            <Switch checked={form[n.key]} onChange={() => toggle(n.key)} disabled={mut.isPending} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------------
// Tab Sao lưu
// --------------------------------------------------------------------------

function BackupTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["backups"],
    queryFn: listBackups,
  });
  const mut = useMutation({
    mutationFn: () => triggerBackup(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backups"] }),
  });
  const backups = data?.backups ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Sao lưu thủ công</p>
            <p className="text-sm text-muted-foreground">
              Ghi nhận yêu cầu sao lưu. Bản sao lưu thật (pg_dump / export JSON)
              chạy qua cron trên Railway.
            </p>
          </div>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            <HardDriveDownload className="h-4 w-4" />
            {mut.isPending ? "Đang chạy…" : "Sao lưu ngay"}
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Thời gian</th>
                <th className="px-4 py-3 font-medium">Người thực hiện</th>
                <th className="px-4 py-3 font-medium">Số user</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr className="border-b border-border">
                  <td className="px-4 py-3" colSpan={4}>
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-muted-foreground" colSpan={4}>
                    Chưa có lịch sử sao lưu.
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr key={b.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-muted-foreground">
                      {shortDate(b.created_at)}
                    </td>
                    <td className="px-4 py-3">{b.triggered_by ?? "—"}</td>
                    <td className="px-4 py-3">{b.users}</td>
                    <td className="px-4 py-3">
                      <Badge variant="muted">{b.status}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
