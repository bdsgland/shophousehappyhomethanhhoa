"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Coins,
  Database,
  HardDriveDownload,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Tag,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  getCommissionConfig,
  getCommissionConfigHistory,
  getSettings,
  listBackups,
  previewCommission,
  resetCommissionConfig,
  restoreCommissionConfig,
  triggerBackup,
  updateCommissionConfig,
  updateSettings,
} from "@/lib/api";
import type {
  CommissionBreakdown,
  CommissionConfig,
  FrontlineKPITier,
  SystemConfig,
} from "@/lib/types";
import { shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { AuditLogTable } from "@/components/settings/AuditLogTable";
import { GoogleWorkspaceCard } from "@/components/settings/GoogleWorkspaceCard";
import { IntegrationsList } from "@/components/settings/IntegrationsList";
import { SalesPolicyTab } from "@/components/settings/SalesPolicyTab";
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
  { key: "commission", label: "Cơ chế hoa hồng", icon: <Coins className="h-4 w-4" /> },
  { key: "sales-policy", label: "Chính sách bán hàng", icon: <Tag className="h-4 w-4" /> },
  { key: "integrations", label: "Tích hợp", icon: <Database className="h-4 w-4" /> },
  { key: "notifications", label: "Thông báo", icon: <ShieldCheck className="h-4 w-4" /> },
  { key: "audit", label: "Nhật ký", icon: <ShieldCheck className="h-4 w-4" /> },
  { key: "backup", label: "Sao lưu", icon: <HardDriveDownload className="h-4 w-4" /> },
];

function vnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";
}

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

      {tab === "commission" && <CommissionTab />}

      {tab === "sales-policy" && <SalesPolicyTab />}

      {tab === "integrations" && (
        <div className="space-y-4">
          <GoogleWorkspaceCard />
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

// --------------------------------------------------------------------------
// Tab Cơ chế hoa hồng
// --------------------------------------------------------------------------

function CommissionTab() {
  const qc = useQueryClient();
  const { data: serverCfg, isLoading } = useQuery({
    queryKey: ["commission-config"],
    queryFn: getCommissionConfig,
  });
  const [cfg, setCfg] = useState<CommissionConfig | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (serverCfg) setCfg(structuredClone(serverCfg));
  }, [serverCfg]);

  const saveMut = useMutation({
    mutationFn: (c: CommissionConfig) => updateCommissionConfig(c),
    onSuccess: (c) => {
      qc.setQueryData(["commission-config"], c);
      setCfg(structuredClone(c));
      setMsg({ type: "ok", text: `Đã lưu cấu hình (phiên bản ${c.version}).` });
    },
    onError: (e: Error) =>
      setMsg({ type: "err", text: e?.message ?? "Lỗi lưu cấu hình" }),
  });

  const resetMut = useMutation({
    mutationFn: () => resetCommissionConfig(),
    onSuccess: (c) => {
      qc.setQueryData(["commission-config"], c);
      setCfg(structuredClone(c));
      setMsg({ type: "ok", text: "Đã khôi phục cấu hình mặc định." });
    },
  });

  if (isLoading || !cfg) return <Skeleton className="h-96 w-full" />;

  const tiersTotal = cfg.tiers.reduce((s, t) => s + (Number(t.percentage) || 0), 0);
  const tiersBalanced = Math.abs(tiersTotal - 100) < 0.01;

  function patchTier(i: number, key: "label_vi" | "percentage", value: string) {
    if (!cfg) return;
    const tiers = cfg.tiers.map((t, idx) =>
      idx === i ? { ...t, [key]: key === "percentage" ? Number(value) : value } : t,
    );
    setCfg({ ...cfg, tiers });
  }

  function patchKpi(i: number, key: keyof FrontlineKPITier, value: string) {
    if (!cfg) return;
    const numKeys = [
      "min_monthly_volume",
      "max_monthly_volume",
      "frontline_percentage",
      "ekip_bonus_percentage",
    ];
    const kpi = cfg.frontline_kpi_tiers.map((t, idx) => {
      if (idx !== i) return t;
      let v: string | number | null = value;
      if (numKeys.includes(key as string)) {
        v = value.trim() === "" ? (key === "max_monthly_volume" ? null : 0) : Number(value);
      }
      return { ...t, [key]: v };
    });
    setCfg({ ...cfg, frontline_kpi_tiers: kpi });
  }

  function addKpi() {
    if (!cfg) return;
    const last = cfg.frontline_kpi_tiers[cfg.frontline_kpi_tiers.length - 1];
    const newTier: FrontlineKPITier = {
      tier_id: (last?.tier_id ?? 0) + 1,
      name: `Bậc ${(last?.tier_id ?? 0) + 1}`,
      min_monthly_volume: last?.max_monthly_volume ?? last?.min_monthly_volume ?? 0,
      max_monthly_volume: null,
      frontline_percentage: last?.frontline_percentage ?? 50,
      ekip_bonus_percentage: 0,
      description_vi: "",
    };
    // bậc cũ (đang là cuối, max=null) cần đặt max để liên tục — gợi ý = min mới
    const kpi = cfg.frontline_kpi_tiers.map((t, idx) =>
      idx === cfg.frontline_kpi_tiers.length - 1 && t.max_monthly_volume === null
        ? { ...t, max_monthly_volume: newTier.min_monthly_volume }
        : t,
    );
    setCfg({ ...cfg, frontline_kpi_tiers: [...kpi, newTier] });
  }

  function removeKpi(i: number) {
    if (!cfg) return;
    const kpi = cfg.frontline_kpi_tiers.filter((_, idx) => idx !== i);
    // đảm bảo bậc cuối có max = null
    if (kpi.length) kpi[kpi.length - 1] = { ...kpi[kpi.length - 1], max_monthly_volume: null };
    setCfg({ ...cfg, frontline_kpi_tiers: kpi });
  }

  return (
    <div className="space-y-5">
      {msg && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            msg.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Section A + B — Pool + 5 bậc */}
      <Card>
        <CardHeader>
          <CardTitle>Cơ chế hoa hồng đa tầng</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="max-w-xs space-y-1.5">
            <Label>Tổng pool hoa hồng (% giá deal)</Label>
            <Input
              type="number"
              step="0.1"
              value={cfg.total_pool_percentage}
              onChange={(e) =>
                setCfg({ ...cfg, total_pool_percentage: Number(e.target.value) })
              }
            />
            <p className="text-xs text-muted-foreground">
              Ví dụ 4% của 1 deal 5 tỷ = pool 200 triệu, chia cho 5 bậc bên dưới.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">5 bậc phân chia pool</h3>
              <Badge variant={tiersBalanced ? "success" : "danger"}>
                Tổng: {tiersTotal.toFixed(1)}%
              </Badge>
            </div>
            {cfg.tiers.map((t, i) => (
              <div key={t.role} className="flex items-center gap-2">
                <Badge variant="muted">{i + 1}</Badge>
                <Input
                  className="flex-1"
                  value={t.label_vi}
                  onChange={(e) => patchTier(i, "label_vi", e.target.value)}
                />
                <div className="flex w-28 items-center gap-1">
                  <Input
                    type="number"
                    step="0.1"
                    value={t.percentage}
                    onChange={(e) => patchTier(i, "percentage", e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                {t.is_progressive && <Badge variant="warning">Lũy tiến</Badge>}
              </div>
            ))}
            {!tiersBalanced && (
              <p className="text-xs text-red-600">
                Tổng 5 bậc phải đúng 100% mới lưu được.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section C — KPI lũy tiến frontline */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Bậc KPI lũy tiến (Sale Frontline)</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Bậc</th>
                  <th className="px-3 py-2.5 font-medium">Tên</th>
                  <th className="px-3 py-2.5 font-medium">Doanh số/tháng từ</th>
                  <th className="px-3 py-2.5 font-medium">Đến (trống = ∞)</th>
                  <th className="px-3 py-2.5 font-medium">% Frontline</th>
                  <th className="px-3 py-2.5 font-medium">% Ekip bonus</th>
                  <th className="px-3 py-2.5 font-medium">Mô tả</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {cfg.frontline_kpi_tiers.map((t, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{t.tier_id}</td>
                    <td className="px-3 py-2">
                      <Input
                        value={t.name}
                        onChange={(e) => patchKpi(i, "name", e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        value={t.min_monthly_volume}
                        onChange={(e) => patchKpi(i, "min_monthly_volume", e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        value={t.max_monthly_volume ?? ""}
                        placeholder="∞"
                        onChange={(e) => patchKpi(i, "max_monthly_volume", e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2 w-24">
                      <Input
                        type="number"
                        step="0.1"
                        value={t.frontline_percentage}
                        onChange={(e) => patchKpi(i, "frontline_percentage", e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2 w-24">
                      <Input
                        type="number"
                        step="0.1"
                        value={t.ekip_bonus_percentage}
                        onChange={(e) => patchKpi(i, "ekip_bonus_percentage", e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={t.description_vi}
                        onChange={(e) => patchKpi(i, "description_vi", e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeKpi(i)}
                        disabled={cfg.frontline_kpi_tiers.length <= 1}
                      >
                        ×
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3">
            <Button variant="outline" size="sm" onClick={addKpi}>
              + Thêm bậc
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section D — Hoa hồng giới thiệu */}
      <Card>
        <CardHeader>
          <CardTitle>Hoa hồng giới thiệu khách</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Bật hoa hồng giới thiệu</p>
              <p className="text-xs text-muted-foreground">
                Người mang khách (data) về nhận % của tổng hoa hồng (cắt từ phần frontline).
              </p>
            </div>
            <Switch
              checked={cfg.referral_bonus.enabled}
              onChange={() =>
                setCfg({
                  ...cfg,
                  referral_bonus: {
                    ...cfg.referral_bonus,
                    enabled: !cfg.referral_bonus.enabled,
                  },
                })
              }
            />
          </div>
          <div className="flex w-40 items-center gap-1">
            <Input
              type="number"
              step="0.1"
              value={cfg.referral_bonus.percentage_of_commission}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  referral_bonus: {
                    ...cfg.referral_bonus,
                    percentage_of_commission: Number(e.target.value),
                  },
                })
              }
            />
            <span className="text-sm text-muted-foreground">% hoa hồng</span>
          </div>
        </CardContent>
      </Card>

      {/* Section E — Preview */}
      <CommissionPreview cfg={cfg} />

      {/* Save bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            setMsg(null);
            saveMut.mutate(cfg);
          }}
          disabled={saveMut.isPending || !tiersBalanced}
        >
          <Save className="h-4 w-4" />
          {saveMut.isPending ? "Đang lưu…" : "Lưu cấu hình"}
        </Button>
        <Button variant="outline" onClick={() => setShowHistory((v) => !v)}>
          Lịch sử thay đổi
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setMsg(null);
            resetMut.mutate();
          }}
          disabled={resetMut.isPending}
        >
          <RotateCcw className="h-4 w-4" />
          Khôi phục mặc định
        </Button>
        <Badge variant="muted">Phiên bản hiện tại: {cfg.version}</Badge>
      </div>

      {showHistory && (
        <CommissionHistory
          onRestored={(c) => {
            qc.setQueryData(["commission-config"], c);
            setCfg(structuredClone(c));
            setMsg({
              type: "ok",
              text: `Đã khôi phục dữ liệu phiên bản cũ (nay là v${c.version}).`,
            });
          }}
        />
      )}
    </div>
  );
}

function CommissionPreview({ cfg }: { cfg: CommissionConfig }) {
  const [dealAmount, setDealAmount] = useState("5000000000");
  const [saleVolume, setSaleVolume] = useState("3000000000");
  const [withReferrer, setWithReferrer] = useState(false);
  const [result, setResult] = useState<CommissionBreakdown | null>(null);
  const mut = useMutation({
    mutationFn: () =>
      previewCommission({
        deal_amount: Number(dealAmount) || 0,
        sale_monthly_volume_before_deal: Number(saleVolume) || 0,
        with_referrer: withReferrer,
        config: cfg,
      }),
    onSuccess: setResult,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tính thử (chưa lưu)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Giá deal (VNĐ)</Label>
            <Input type="number" value={dealAmount} onChange={(e) => setDealAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Doanh số tháng (trước deal)</Label>
            <Input type="number" value={saleVolume} onChange={(e) => setSaleVolume(e.target.value)} />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <Switch checked={withReferrer} onChange={() => setWithReferrer((v) => !v)} />
            <span className="text-sm text-muted-foreground">Có người giới thiệu</span>
          </div>
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? "Đang tính…" : "Tính"}
        </Button>

        {result && (
          <div className="space-y-2 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                Pool: <b>{vnd(result.total_pool)}</b> ({result.total_pool_percentage}%)
              </span>
              <Badge variant="muted">Bậc áp dụng: {result.frontline_tier_applied}</Badge>
              <Badge variant={result.is_balanced ? "success" : "warning"}>
                Tổng chia: {result.total_distributed_percentage}%
              </Badge>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Vai trò</th>
                  <th className="py-2">%</th>
                  <th className="py-2 text-right">Số tiền</th>
                </tr>
              </thead>
              <tbody>
                {result.recipients.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="py-2">{r.label_vi}</td>
                    <td className="py-2 text-muted-foreground">{r.percentage}%</td>
                    <td className="py-2 text-right font-medium">{vnd(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!result.is_balanced && (
              <p className="text-xs text-amber-600">
                ⚠️ Tổng chia ≠ 100% pool do cấu hình ekip bonus cộng thêm. Cân chỉnh
                nếu muốn chia đúng pool.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CommissionHistory({ onRestored }: { onRestored: (c: CommissionConfig) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["commission-config-history"],
    queryFn: getCommissionConfigHistory,
  });
  const restoreMut = useMutation({
    mutationFn: (version: number) => restoreCommissionConfig(version),
    onSuccess: onRestored,
  });
  const versions = data?.versions ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Lịch sử thay đổi (10 gần nhất)</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Phiên bản</th>
                <th className="px-4 py-2.5 font-medium">Cập nhật lúc</th>
                <th className="px-4 py-2.5 font-medium">Bởi</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="px-4 py-3" colSpan={4}>
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ) : (
                versions.map((v, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      v{v.version} {v.is_current && <Badge variant="success">hiện tại</Badge>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {v.last_updated_at ? shortDate(v.last_updated_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {v.last_updated_by ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!v.is_current && v.version != null && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => restoreMut.mutate(v.version as number)}
                          disabled={restoreMut.isPending}
                        >
                          Khôi phục
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
