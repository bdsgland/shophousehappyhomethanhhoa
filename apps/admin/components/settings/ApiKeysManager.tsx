"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api";
import type { ApiKey, ApiKeyCreated } from "@/lib/types";
import { shortDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * API KEYS — quản lý khoá truy cập API/MCP TOÀN QUYỀN cho công cụ ngoài.
 *
 * Mỗi khoá có quyền tương đương admin: dùng để gọi REST API (/docs → Authorize)
 * hoặc MCP server (/mcp) cho OpenClaw / script. Secret CHỈ hiện 1 lần lúc tạo —
 * backend chỉ lưu hash. Danh sách chỉ hiển thị prefix + 4 ký tự cuối.
 */
export function ApiKeysManager() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: listApiKeys,
  });

  const [showCreate, setShowCreate] = useState(false);
  // Key vừa tạo (chứa plaintext) — hiển thị modal "chỉ hiện 1 lần".
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);

  const keys = data?.keys ?? [];

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                API Keys — Quyền truy cập API
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Tạo khoá để công cụ ngoài (OpenClaw, script, tích hợp) điều khiển
                hệ thống. Mỗi khoá là <b>TOÀN QUYỀN</b> (tương đương admin).
              </p>
            </div>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Tạo key mới
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Khoá có quyền <b>điều khiển toàn bộ admin</b>. Giữ tuyệt mật, không
              dán vào nơi công khai. Bị lộ thì <b>thu hồi ngay</b>. Secret chỉ hiển
              thị đúng <b>một lần</b> khi tạo — sau đó không xem lại được.
            </span>
          </div>

          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : keys.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Chưa có API key nào. Bấm “Tạo key mới” để bắt đầu.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Tên</th>
                    <th className="px-3 py-2.5 font-medium">Khoá</th>
                    <th className="px-3 py-2.5 font-medium">Quyền</th>
                    <th className="px-3 py-2.5 font-medium">Tạo lúc</th>
                    <th className="px-3 py-2.5 font-medium">Dùng lần cuối</th>
                    <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <KeyRow
                      key={k.id}
                      apiKey={k}
                      onRevoke={() => {
                        if (
                          confirm(
                            `Thu hồi khoá “${k.name}”? Mọi công cụ đang dùng khoá này sẽ mất quyền ngay lập tức.`,
                          )
                        ) {
                          revokeMut.mutate(k.id);
                        }
                      }}
                      revoking={revokeMut.isPending}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <UsageGuide />

      {showCreate && (
        <CreateKeyModal
          onClose={() => setShowCreate(false)}
          onCreated={(c) => {
            setShowCreate(false);
            setCreated(c);
            qc.invalidateQueries({ queryKey: ["api-keys"] });
          }}
        />
      )}

      {created && (
        <ShowSecretModal apiKey={created} onClose={() => setCreated(null)} />
      )}
    </div>
  );
}

function KeyRow({
  apiKey,
  onRevoke,
  revoking,
}: {
  apiKey: ApiKey;
  onRevoke: () => void;
  revoking: boolean;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2.5 font-medium">{apiKey.name}</td>
      <td className="px-3 py-2.5">
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {apiKey.masked}
        </code>
      </td>
      <td className="px-3 py-2.5 text-muted-foreground">{apiKey.scope}</td>
      <td className="px-3 py-2.5 text-muted-foreground">
        {apiKey.created_at ? shortDate(apiKey.created_at) : "—"}
      </td>
      <td className="px-3 py-2.5 text-muted-foreground">
        {apiKey.last_used_at ? shortDate(apiKey.last_used_at) : "Chưa dùng"}
      </td>
      <td className="px-3 py-2.5">
        {apiKey.revoked ? (
          <Badge variant="danger">Đã thu hồi</Badge>
        ) : (
          <Badge variant="success">Hoạt động</Badge>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        {!apiKey.revoked && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRevoke}
            disabled={revoking}
          >
            <Trash2 className="h-4 w-4" /> Thu hồi
          </Button>
        )}
      </td>
    </tr>
  );
}

function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: ApiKeyCreated) => void;
}) {
  const [name, setName] = useState("");
  const mut = useMutation({
    mutationFn: () => createApiKey(name.trim(), "admin_full"),
    onSuccess: onCreated,
  });

  return (
    <Overlay onClose={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Tạo API key mới</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tên gợi nhớ</Label>
            <Input
              autoFocus
              value={name}
              placeholder="VD: OpenClaw CEO bot"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) mut.mutate();
              }}
            />
            <p className="text-xs text-muted-foreground">
              Quyền: <b>admin_full</b> (toàn quyền). Đặt tên rõ để dễ thu hồi đúng khoá sau này.
            </p>
          </div>
          {mut.isError && (
            <p className="text-xs text-red-600">
              {(mut.error as Error)?.message ?? "Lỗi tạo khoá."}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              Huỷ
            </Button>
            <Button
              size="sm"
              onClick={() => mut.mutate()}
              disabled={!name.trim() || mut.isPending}
            >
              {mut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Tạo khoá
            </Button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function ShowSecretModal({
  apiKey,
  onClose,
}: {
  apiKey: ApiKeyCreated;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(apiKey.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard có thể bị chặn — user copy thủ công */
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Khoá “{apiKey.name}” đã tạo</h3>
        </div>

        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Đây là <b>lần duy nhất</b> khoá hiển thị đầy đủ. Hãy sao chép và lưu vào
            nơi an toàn ngay bây giờ — đóng cửa sổ này thì không xem lại được nữa.
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <code className="flex-1 break-all text-sm">{apiKey.plaintext}</code>
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Đã copy" : "Copy"}
          </Button>
        </div>

        <div className="mt-5 flex justify-end">
          <Button size="sm" onClick={onClose}>
            Tôi đã lưu khoá an toàn
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function UsageGuide() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cách dùng API key</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div>
          <p className="font-medium text-foreground">
            1. Trên trang tài liệu API (/docs)
          </p>
          <p>
            Mở{" "}
            <a
              href="https://api.eurowindowlightcity.net/docs"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              api.eurowindowlightcity.net/docs
            </a>{" "}
            → bấm nút <b>Authorize</b> → dán khoá <code className="rounded bg-muted px-1">elc_sk_...</code>{" "}
            vào ô Bearer → Authorize. Sau đó gọi thử endpoint{" "}
            <code className="rounded bg-muted px-1">GET /admin/api-keys/whoami</code> để kiểm tra.
          </p>
        </div>
        <div>
          <p className="font-medium text-foreground">2. Làm header cho MCP (OpenClaw)</p>
          <p>
            Trỏ công cụ MCP tới <code className="rounded bg-muted px-1">https://api.eurowindowlightcity.net/mcp</code>{" "}
            và đặt một trong hai header:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground">
{`X-Api-Key: elc_sk_xxxxxxxx
# hoặc
Authorization: Bearer elc_sk_xxxxxxxx`}
          </pre>
          <p className="mt-1">
            MCP cung cấp các tool đọc (lead, bảng hàng, KPI, pipeline marketing,
            audit…) và ghi (tạo/sửa lead, cập nhật bảng hàng, gửi thông báo…). Mọi
            hành động ghi đều được lưu nhật ký kiểm toán.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
