"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Pencil, RefreshCw, Unlock, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

import {
  ApiError,
  createHRStaff,
  listHRStaff,
  setHRStaffStatus,
  updateHRStaff,
} from "@/lib/api";
import type { HRRole, HRStaff } from "@/lib/types";
import { cn, shortDate } from "@/lib/utils";
import { HR_ROLE_LABEL, HR_STAFF_ROLES } from "@/components/hr/hr-constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export function StaffTab() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["hr-staff"],
    queryFn: () => listHRStaff(false),
  });

  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HRStaff | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["hr-staff"] });
    qc.invalidateQueries({ queryKey: ["hr-overview"] });
  };

  const toggleMut = useMutation({
    mutationFn: (s: HRStaff) => setHRStaffStatus(s.id, !s.is_active),
    onSuccess: invalidate,
  });

  const rows = useMemo(() => {
    let list = data?.staff ?? [];
    if (roleFilter !== "all") list = list.filter((s) => s.role === roleFilter);
    return list;
  }, [data, roleFilter]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <FilterBtn active={roleFilter === "all"} onClick={() => setRoleFilter("all")}>
            Tất cả
          </FilterBtn>
          {HR_STAFF_ROLES.map((r) => (
            <FilterBtn
              key={r.value}
              active={roleFilter === r.value}
              onClick={() => setRoleFilter(r.value)}
            >
              {r.label}
            </FilterBtn>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Làm mới
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" />
            Thêm nhân sự
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Họ tên</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Vai trò</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">% Mục tiêu</th>
                <th className="px-4 py-3 font-medium">Ngày tạo</th>
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3" colSpan={7}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-muted-foreground" colSpan={7}>
                    Chưa có nhân sự phù hợp.
                  </td>
                </tr>
              ) : (
                rows.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">{s.full_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={s.role === "admin" ? "default" : "muted"}>
                        {HR_ROLE_LABEL[s.role] ?? s.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {s.is_active ? (
                        <Badge variant="success">Hoạt động</Badge>
                      ) : (
                        <Badge variant="danger">Đã khoá</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ProgressBar pct={s.objective_completion_pct} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {shortDate(s.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn
                          title="Sửa"
                          onClick={() => {
                            setEditing(s);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          title={s.is_active ? "Khoá" : "Mở khoá"}
                          onClick={() => toggleMut.mutate(s)}
                        >
                          {s.is_active ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <Unlock className="h-4 w-4" />
                          )}
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

      <StaffForm
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={invalidate}
      />
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color =
    pct >= 100 ? "bg-success" : pct >= 60 ? "bg-primary" : "bg-warning";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function StaffForm({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: HRStaff | null;
}) {
  const isEdit = Boolean(editing);
  const [fullName, setFullName] = useState(editing?.full_name ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [role, setRole] = useState<HRRole>((editing?.role as HRRole) ?? "sale");
  const [region, setRegion] = useState(editing?.region ?? "");
  const [upline, setUpline] = useState(editing?.upline_email ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form khi mở với nhân sự khác.
  const formKey = editing?.id ?? "new";
  const [activeKey, setActiveKey] = useState(formKey);
  if (activeKey !== formKey) {
    setActiveKey(formKey);
    setFullName(editing?.full_name ?? "");
    setEmail(editing?.email ?? "");
    setPhone(editing?.phone ?? "");
    setRole((editing?.role as HRRole) ?? "sale");
    setRegion(editing?.region ?? "");
    setUpline(editing?.upline_email ?? "");
    setPassword("");
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    if (!fullName.trim() || !email.trim()) {
      setError("Họ tên và email là bắt buộc.");
      return;
    }
    setSaving(true);
    try {
      if (isEdit && editing) {
        await updateHRStaff(editing.id, {
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone?.trim() || undefined,
          role,
          region: region?.trim() || undefined,
          upline_email: upline?.trim() || undefined,
        });
      } else {
        await createHRStaff({
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone?.trim() || undefined,
          role,
          region: region?.trim() || undefined,
          upline_email: upline?.trim() || undefined,
          password: password.trim() || undefined,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Lưu thất bại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader
        title={isEdit ? "Sửa nhân sự" : "Thêm nhân sự"}
        description={
          isEdit
            ? "Cập nhật thông tin & vai trò nhân sự."
            : "Tạo tài khoản nhân sự mới và gán vai trò."
        }
        onClose={onClose}
      />
      <DialogBody>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Họ tên *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" />
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Số điện thoại</Label>
            <Input value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxxx" />
          </div>
          <div className="space-y-1.5">
            <Label>Vai trò</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value as HRRole)}>
              {HR_STAFF_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Khu vực</Label>
            <Input value={region ?? ""} onChange={(e) => setRegion(e.target.value)} placeholder="Hà Nội" />
          </div>
          <div className="space-y-1.5">
            <Label>Email người quản lý (upline)</Label>
            <Input value={upline ?? ""} onChange={(e) => setUpline(e.target.value)} placeholder="upline@example.com" />
          </div>
          {!isEdit && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Mật khẩu (để trống sẽ tự sinh)</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tối thiểu 6 ký tự, có cả chữ và số" />
            </div>
          )}
        </div>
        {error && (
          <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Huỷ
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Tạo nhân sự"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
