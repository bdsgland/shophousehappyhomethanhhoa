"use client";

import { useState } from "react";

import {
  createUser,
  updateUser,
  type CreateUserPayload,
  type UpdateUserPayload,
} from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { User, UserRole } from "@/lib/types";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "sale", label: "Sale" },
  { value: "client", label: "Khách hàng" },
  { value: "admin", label: "Quản trị" },
];

export function UserForm({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: User | null;
}) {
  const isEdit = Boolean(editing);
  const [fullName, setFullName] = useState(editing?.full_name ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [role, setRole] = useState<UserRole>(editing?.role ?? "sale");
  const [region, setRegion] = useState(editing?.region ?? "");
  const [upline, setUpline] = useState(editing?.upline_email ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form mỗi khi mở với user khác.
  const formKey = editing?.id ?? "new";
  const [activeKey, setActiveKey] = useState(formKey);
  if (activeKey !== formKey) {
    setActiveKey(formKey);
    setFullName(editing?.full_name ?? "");
    setEmail(editing?.email ?? "");
    setPhone(editing?.phone ?? "");
    setRole(editing?.role ?? "sale");
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
        const payload: UpdateUserPayload = {
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone?.trim() || undefined,
          role,
          region: region?.trim() || undefined,
          upline_email: upline?.trim() || undefined,
        };
        await updateUser(editing.id, payload);
      } else {
        const payload: CreateUserPayload = {
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone?.trim() || undefined,
          role,
          region: region?.trim() || undefined,
          upline_email: upline?.trim() || undefined,
          password: password.trim() || undefined,
        };
        await createUser(payload);
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
        title={isEdit ? "Sửa người dùng" : "Thêm người dùng"}
        description={
          isEdit
            ? "Cập nhật thông tin & vai trò tài khoản."
            : "Tạo tài khoản mới (bỏ qua luồng đăng ký công khai)."
        }
        onClose={onClose}
      />
      <DialogBody>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Họ tên *</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Số điện thoại</Label>
            <Input
              value={phone ?? ""}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09xxxxxxxx"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Vai trò</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Khu vực</Label>
            <Input
              value={region ?? ""}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Hà Nội"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email người giới thiệu (upline)</Label>
            <Input
              value={upline ?? ""}
              onChange={(e) => setUpline(e.target.value)}
              placeholder="upline@example.com"
            />
          </div>
          {!isEdit && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Mật khẩu (để trống sẽ tự sinh)</Label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự, có cả chữ và số"
              />
            </div>
          )}
        </div>
        {error && (
          <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Huỷ
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Tạo tài khoản"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
