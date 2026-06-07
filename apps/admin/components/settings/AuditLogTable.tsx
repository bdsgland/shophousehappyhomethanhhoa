"use client";

import { useQuery } from "@tanstack/react-query";

import { getAuditLog } from "@/lib/api";
import type { AuditEvent } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// Map loại sự kiện admin.* sang nhãn tiếng Việt dễ đọc.
const ACTION_LABEL: Record<string, string> = {
  "admin.user.create": "Tạo người dùng",
  "admin.user.update": "Cập nhật người dùng",
  "admin.user.disable": "Khoá người dùng",
  "admin.user.reset_password": "Reset mật khẩu",
  "admin.user.bulk_import": "Import người dùng",
  "admin.commission.approve": "Duyệt hoa hồng",
  "admin.commission.mark_paid": "Chi trả hoa hồng",
  "admin.inventory.create": "Tạo căn",
  "admin.inventory.update": "Sửa căn",
  "admin.inventory.delete": "Xoá căn",
  "admin.kb.reindex": "Re-index tài liệu",
  "admin.settings.update": "Đổi cấu hình",
  "admin.backup.trigger": "Kích hoạt backup",
};

function actorOf(ev: AuditEvent): string {
  const p = ev.payload as Record<string, unknown>;
  return (p.actor_email as string) || (p.actor_name as string) || "—";
}

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN");
}

export function AuditLogTable() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-log"],
    queryFn: () => getAuditLog(100),
  });
  const events = data?.events ?? [];

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-3 font-medium">Thời gian</th>
              <th className="px-4 py-3 font-medium">Người thực hiện</th>
              <th className="px-4 py-3 font-medium">Hành động</th>
              <th className="px-4 py-3 font-medium">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="px-4 py-3" colSpan={4}>
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))
            ) : events.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-muted-foreground" colSpan={4}>
                  Chưa có thao tác quản trị nào được ghi nhận.
                </td>
              </tr>
            ) : (
              events.map((ev) => (
                <tr key={ev.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {fmt(ev.created_at)}
                  </td>
                  <td className="px-4 py-3">{actorOf(ev)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="muted">
                      {ACTION_LABEL[ev.event_type] ?? ev.event_type.replace("admin.", "")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{ev.detail || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
