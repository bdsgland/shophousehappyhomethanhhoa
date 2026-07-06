"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  RotateCcw,
  Sheet,
} from "lucide-react";
import { useState } from "react";

import {
  getInventorySyncHistory,
  listInventoryBackups,
  restoreInventory,
  syncInventory,
} from "@/lib/api";
import type { InventorySyncResult } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Link bảng hàng Happy Home chủ đầu tư share (prefill — admin có thể dán link khác).
const DEFAULT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1M3NYPPWPmbt6xCiPcaULxc_19_I7m1WCVrfjZ2FeFec/edit?usp=sharing";

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Section "Đồng bộ bảng hàng từ Google Sheets" — đặt đầu trang quỹ căn.
 * Dán link Sheets → sync → cập nhật inventory (persist + auto-backup ở backend).
 * Kèm lịch sử sync + khôi phục từ backup.
 */
export function InventorySyncCard({ onSynced }: { onSynced?: () => void }) {
  const qc = useQueryClient();
  const [sheetUrl, setSheetUrl] = useState(DEFAULT_SHEET_URL);
  const [replaceAll, setReplaceAll] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [result, setResult] = useState<InventorySyncResult | null>(null);

  const historyQuery = useQuery({
    queryKey: ["inventory-sync-history"],
    queryFn: () => getInventorySyncHistory(10),
  });
  const backupsQuery = useQuery({
    queryKey: ["inventory-backups"],
    queryFn: () => listInventoryBackups(),
    enabled: showHistory,
  });

  const lastSync = historyQuery.data?.history?.[0] ?? null;

  const syncMut = useMutation({
    mutationFn: () =>
      syncInventory({ sheet_url: sheetUrl.trim(), replace_all: replaceAll }),
    onSuccess: (res) => {
      setResult(res);
      qc.invalidateQueries({ queryKey: ["admin-inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-sync-history"] });
      qc.invalidateQueries({ queryKey: ["inventory-backups"] });
      onSynced?.();
    },
  });

  const restoreMut = useMutation({
    mutationFn: (ts: string) => restoreInventory(ts),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-backups"] });
    },
  });

  const syncing = syncMut.isPending;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sheet className="h-5 w-5 text-primary" />
          Đồng bộ bảng hàng từ Google Sheets
        </CardTitle>
        <CardDescription>
          Dán link Google Sheets chủ đầu tư chia sẻ (đặt quyền “Bất kỳ ai có liên
          kết → Người xem”) rồi bấm Đồng bộ. Hệ thống tự backup dữ liệu cũ trước
          khi ghi đè.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            disabled={syncing}
          />
          <Button
            onClick={() => syncMut.mutate()}
            disabled={syncing || !sheetUrl.trim()}
            className="shrink-0"
          >
            {syncing ? "Đang đồng bộ…" : "Đồng bộ ngay"}
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            checked={replaceAll}
            onChange={setReplaceAll}
            disabled={syncing}
          />
          <Label className="cursor-default">
            Thay thế hoàn toàn (ẩn các căn không còn trong sheet — vẫn giữ backup)
          </Label>
        </div>

        {/* Thông tin lần sync gần nhất */}
        {lastSync && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Sync gần nhất: <b>{formatDateTime(lastSync.synced_at)}</b>
            {lastSync.synced_by_name ? ` bởi ${lastSync.synced_by_name}` : ""} —{" "}
            {lastSync.total_units} căn ({lastSync.created} mới,{" "}
            {lastSync.updated} cập nhật
            {lastSync.deleted ? `, ${lastSync.deleted} ẩn` : ""})
          </div>
        )}

        {/* Lỗi mạng / fetch (mutation error) */}
        {syncMut.isError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Không gọi được API đồng bộ:{" "}
              {(syncMut.error as Error)?.message ?? "lỗi không xác định"}
            </span>
          </div>
        )}

        {/* Kết quả sync */}
        {result &&
          (result.success ? (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
              <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Đồng bộ xong: {result.created} mới, {result.updated} cập nhật
                {result.deleted ? `, ${result.deleted} ẩn` : ""} (tổng{" "}
                {result.total_units} căn)
              </div>
              {result.errors.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-amber-600">
                    {result.errors.length} cảnh báo dòng (bấm xem)
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                    {result.errors.join("\n")}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Đồng bộ thất bại
              </div>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs">
                {result.errors.join("\n") || "Không rõ nguyên nhân."}
              </pre>
            </div>
          ))}

        {/* Lịch sử sync + khôi phục */}
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory((v) => !v)}
          >
            <History className="h-4 w-4" />
            {showHistory ? "Ẩn lịch sử" : "Lịch sử & khôi phục"}
          </Button>

          {showHistory && (
            <div className="mt-3 space-y-4">
              <HistoryTable history={historyQuery.data?.history ?? []} />
              <BackupTable
                backups={backupsQuery.data?.backups ?? []}
                onRestore={(ts) => restoreMut.mutate(ts)}
                restoring={restoreMut.isPending}
              />
              {restoreMut.isSuccess && (
                <p className="text-sm text-emerald-600">
                  Đã khôi phục {restoreMut.data?.restored_units} căn từ backup.
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryTable({ history }: { history: InventorySyncResult[] }) {
  if (history.length === 0)
    return (
      <p className="text-sm text-muted-foreground">Chưa có lần đồng bộ nào.</p>
    );
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
        Lịch sử đồng bộ
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Thời gian</th>
              <th className="px-3 py-2 font-medium">Người sync</th>
              <th className="px-3 py-2 font-medium">Tổng</th>
              <th className="px-3 py-2 font-medium">Mới / Cập nhật / Ẩn</th>
              <th className="px-3 py-2 font-medium">Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-2">{formatDateTime(h.synced_at)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {h.synced_by_name ?? "—"}
                </td>
                <td className="px-3 py-2">{h.total_units}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {h.created} / {h.updated} / {h.deleted}
                </td>
                <td className="px-3 py-2">
                  {h.success ? (
                    <span className="text-emerald-600">Thành công</span>
                  ) : (
                    <span className="text-destructive">Lỗi</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BackupTable({
  backups,
  onRestore,
  restoring,
}: {
  backups: { timestamp: string; filename: string; unit_count: number }[];
  onRestore: (ts: string) => void;
  restoring: boolean;
}) {
  if (backups.length === 0)
    return <p className="text-sm text-muted-foreground">Chưa có backup.</p>;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
        Bản backup (mới nhất trước)
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Bản backup</th>
              <th className="px-3 py-2 font-medium">Số căn</th>
              <th className="px-3 py-2 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.filename} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{b.timestamp}</td>
                <td className="px-3 py-2">{b.unit_count}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restoring}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Khôi phục quỹ căn về bản ${b.timestamp}? Hiện trạng sẽ được backup trước.`,
                        )
                      )
                        onRestore(b.timestamp);
                    }}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Khôi phục
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
