"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plug,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import {
  deleteIntegration,
  listIntegrations,
  saveIntegration,
  testIntegration,
} from "@/lib/api";
import type {
  IntegrationFieldView,
  IntegrationServiceView,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

/**
 * TRUNG TÂM TÍCH HỢP & KẾT NỐI — quản lý đăng nhập/đồng bộ mọi kênh & dịch vụ.
 * Nhập credential ngay trên UI → có hiệu lực NGAY (backend store-first-then-env),
 * không cần set lại env trên Railway. Secret KHÔNG bao giờ hiển thị full (chỉ
 * 4 ký tự cuối); để trống khi lưu = giữ nguyên giá trị cũ.
 */
export function IntegrationsManager() {
  const { data, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: listIntegrations,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const groups = data?.groups ?? [];
  const services = (data?.services ?? []).filter((s) => !s.managed);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Khoá nhập tại đây được lưu an toàn trên máy chủ (volume bền, gitignored) và
        có hiệu lực ngay — không cần đặt lại biến môi trường Railway. Bí mật chỉ
        hiển thị 4 ký tự cuối; để trống khi lưu nghĩa là giữ nguyên giá trị cũ.
      </p>

      {groups.map((g) => {
        const items = services.filter((s) => s.group === g.key);
        if (items.length === 0) return null;
        return (
          <section key={g.key} className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Plug className="h-4 w-4 text-primary" />
              {g.label}
            </h3>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {items.map((svc) => (
                <IntegrationCard key={svc.key} svc={svc} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function sourceLabel(source: string): string {
  if (source === "store") return "Đã lưu tại đây";
  if (source === "env") return "Từ biến môi trường";
  return "Chưa cấu hình";
}

function IntegrationCard({ svc }: { svc: IntegrationServiceView }) {
  const qc = useQueryClient();
  // form chỉ giữ field người dùng GÕ. Non-secret khởi tạo theo value hiện có để
  // sửa trực tiếp; secret khởi tạo rỗng (placeholder hiện masked).
  const [form, setForm] = useState<Record<string, string | boolean>>(() => {
    const init: Record<string, string | boolean> = {};
    for (const f of svc.fields) {
      if (f.type === "bool") init[f.key] = Boolean(f.value);
      else if (!f.secret) init[f.key] = (f.value ?? "") as string;
      else init[f.key] = "";
    }
    return init;
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: Record<string, string | number | boolean> = {};
      for (const f of svc.fields) {
        const v = form[f.key];
        if (f.type === "bool") {
          payload[f.key] = Boolean(v);
        } else if (typeof v === "string" && v.trim() !== "") {
          payload[f.key] = f.type === "number" ? Number(v) : v;
        }
      }
      return saveIntegration(svc.key, payload);
    },
    onSuccess: () => {
      setMsg({ ok: true, text: "Đã lưu cấu hình." });
      // Xoá ô secret sau khi lưu (không giữ lại trong state trình duyệt).
      setForm((prev) => {
        const next = { ...prev };
        for (const f of svc.fields) if (f.secret) next[f.key] = "";
        return next;
      });
      qc.invalidateQueries({ queryKey: ["integrations"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => setMsg({ ok: false, text: e?.message ?? "Lỗi lưu." }),
  });

  const testMut = useMutation({
    mutationFn: () => testIntegration(svc.key),
    onSuccess: (r) => setMsg({ ok: r.ok, text: r.detail }),
    onError: (e: Error) => setMsg({ ok: false, text: e?.message ?? "Lỗi kiểm tra." }),
  });

  const delMut = useMutation({
    mutationFn: () => deleteIntegration(svc.key),
    onSuccess: () => {
      setMsg({ ok: true, text: "Đã xoá khoá khỏi máy chủ (quay về env nếu có)." });
      qc.invalidateQueries({ queryKey: ["integrations"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const busy = saveMut.isPending || testMut.isPending || delMut.isPending;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span>{svc.name}</span>
          {svc.connected ? (
            <Badge variant="success">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Đã kết nối
            </Badge>
          ) : (
            <Badge variant="muted">
              <XCircle className="mr-1 h-3.5 w-3.5" /> Chưa kết nối
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{sourceLabel(svc.source)}</p>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {svc.fields.map((f) => (
            <Field
              key={f.key}
              field={f}
              value={form[f.key]}
              onChange={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
            />
          ))}
        </div>

        {svc.guide && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {svc.guide}
            {svc.guide_url && (
              <a
                href={svc.guide_url}
                target="_blank"
                rel="noreferrer"
                className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                Hướng dẫn <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </p>
        )}

        {msg && (
          <div
            className={`rounded-md border px-3 py-2 text-xs ${
              msg.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {msg.text}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={() => { setMsg(null); saveMut.mutate(); }} disabled={busy}>
            {saveMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Lưu
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setMsg(null); testMut.mutate(); }}
            disabled={busy}
          >
            {testMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plug className="h-4 w-4" />
            )}
            Kiểm tra kết nối
          </Button>
          {svc.source === "store" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm(`Xoá khoá ${svc.name} khỏi máy chủ?`)) {
                  setMsg(null);
                  delMut.mutate();
                }
              }}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" />
              Xoá
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: IntegrationFieldView;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
}) {
  if (field.type === "bool") {
    return (
      <div className="flex items-center justify-between gap-2 sm:col-span-2">
        <Label className="text-sm">{field.label}</Label>
        <Switch checked={Boolean(value)} onChange={(c) => onChange(c)} />
      </div>
    );
  }

  // Secret đã có giá trị → placeholder hiển thị masked (vd ••••1234).
  const placeholder = field.secret
    ? field.present
      ? field.masked || "••••••••"
      : field.placeholder || "Nhập khoá bí mật"
    : field.placeholder;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{field.label}</Label>
      <Input
        type={field.secret ? "password" : field.type === "number" ? "number" : "text"}
        autoComplete={field.secret ? "new-password" : "off"}
        value={typeof value === "string" ? value : ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
