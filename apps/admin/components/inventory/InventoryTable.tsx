"use client";

import { Pencil, Trash2 } from "lucide-react";

import type { InventoryUnit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function statusVariant(
  trangThai: string,
): "success" | "warning" | "muted" {
  if (trangThai === "Còn hàng") return "success";
  if (trangThai === "Đặt cọc") return "warning";
  return "muted";
}

export function InventoryTable({
  units,
  isLoading,
  onEdit,
  onDelete,
}: {
  units: InventoryUnit[];
  isLoading?: boolean;
  onEdit: (unit: InventoryUnit) => void;
  onDelete: (unit: InventoryUnit) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-3 font-medium">Mã căn</th>
              <th className="px-4 py-3 font-medium">Phân khu</th>
              <th className="px-4 py-3 font-medium">Loại</th>
              <th className="px-4 py-3 font-medium">Diện tích (m²)</th>
              <th className="px-4 py-3 font-medium">Mặt tiền (m)</th>
              <th className="px-4 py-3 font-medium">Giá</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="px-4 py-3" colSpan={8}>
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))
            ) : units.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-10 text-center text-muted-foreground"
                  colSpan={8}
                >
                  Không có căn phù hợp.
                </td>
              </tr>
            ) : (
              units.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium">{u.id}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.phan_khu}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.loai}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.dien_tich}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.mat_tien}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.gia}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(u.trang_thai)}>
                      {u.trang_thai}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <IconBtn title="Sửa" onClick={() => onEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn title="Xoá" danger onClick={() => onDelete(u)}>
                        <Trash2 className="h-4 w-4" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent",
        danger ? "hover:text-danger" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
