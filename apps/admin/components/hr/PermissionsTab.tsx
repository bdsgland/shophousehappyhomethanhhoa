"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";

import {
  ApiError,
  getHRPermissions,
  resetHRPermissions,
  updateHRRolePermissions,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

export function PermissionsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["hr-permissions"],
    queryFn: getHRPermissions,
  });

  // Bản nháp cục bộ (role → permKey → bool) để chỉnh trước khi lưu.
  const [draft, setDraft] = useState<Record<string, Record<string, boolean>>>({});
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      const d: Record<string, Record<string, boolean>> = {};
      for (const r of data.roles) d[r.role] = { ...r.permissions };
      setDraft(d);
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!data) return;
      // Chỉ lưu vai trò có thay đổi (bỏ admin — luôn full quyền).
      const original: Record<string, Record<string, boolean>> = {};
      for (const r of data.roles) original[r.role] = r.permissions;
      const changed = data.roles
        .filter((r) => r.role !== "admin")
        .filter(
          (r) =>
            JSON.stringify(original[r.role]) !== JSON.stringify(draft[r.role]),
        );
      for (const r of changed) {
        await updateHRRolePermissions(r.role, draft[r.role]);
      }
      return changed.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["hr-permissions"] });
      setBanner(n ? `Đã lưu quyền cho ${n} vai trò.` : "Không có thay đổi nào.");
    },
    onError: (e) =>
      setBanner(e instanceof ApiError ? e.message : "Lưu thất bại."),
  });

  const resetMut = useMutation({
    mutationFn: resetHRPermissions,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-permissions"] });
      setBanner("Đã khôi phục ma trận quyền mặc định.");
    },
  });

  if (isLoading || !data) {
    return <Skeleton className="h-72 w-full" />;
  }

  function toggle(role: string, perm: string, value: boolean) {
    setDraft((prev) => ({
      ...prev,
      [role]: { ...prev[role], [perm]: value },
    }));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Bật/tắt quyền theo vai trò. Vai trò <b>Quản trị</b> luôn có toàn quyền.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetMut.mutate()}
            disabled={resetMut.isPending}
          >
            <RotateCcw className="h-4 w-4" />
            Mặc định
          </Button>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            <Save className="h-4 w-4" />
            {saveMut.isPending ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </div>
      </div>

      {banner && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-2.5 text-sm">
          <span>{banner}</span>
          <button onClick={() => setBanner(null)} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="sticky left-0 bg-muted/40 px-4 py-3 font-medium">Quyền</th>
                {data.roles.map((r) => (
                  <th key={r.role} className="px-4 py-3 text-center font-medium">
                    {r.label_vi}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.permissions_catalog.map((p) => (
                <tr key={p.key} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="sticky left-0 bg-card px-4 py-3 font-medium">{p.label_vi}</td>
                  {data.roles.map((r) => {
                    const isAdmin = r.role === "admin";
                    const checked = isAdmin
                      ? true
                      : Boolean(draft[r.role]?.[p.key]);
                    return (
                      <td key={r.role} className="px-4 py-3 text-center">
                        <div className="flex justify-center">
                          <Switch
                            checked={checked}
                            disabled={isAdmin}
                            onChange={(v) => toggle(r.role, p.key, v)}
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
