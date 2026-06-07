"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  KeyRound,
  Lock,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Unlock,
  Upload,
  UserPlus,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  bulkImportUsers,
  deleteUser,
  listUsers,
  resetUserPassword,
  updateUser,
} from "@/lib/api";
import type { User, UserRole } from "@/lib/types";
import { cn, shortDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { UserForm } from "@/components/users/UserForm";
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
import { Skeleton } from "@/components/ui/skeleton";

const ROLE_LABEL: Record<string, string> = {
  admin: "Quản trị",
  sale: "Sale",
  client: "Khách hàng",
};

const FILTERS: { key: "all" | UserRole; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "admin", label: "Quản trị" },
  { key: "sale", label: "Sale" },
  { key: "client", label: "Khách hàng" },
];

const PAGE_SIZE = 20;

export default function UsersPage() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
  });

  const [role, setRole] = useState<"all" | UserRole>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<User | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });

  const resetMut = useMutation({
    mutationFn: (id: string) => resetUserPassword(id),
    onSuccess: (res) => setTempPw(res.temp_password),
  });
  const toggleMut = useMutation({
    mutationFn: (u: User) => updateUser(u.id, { is_active: !u.is_active }),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      invalidate();
      setConfirmUser(null);
    },
  });
  const importMut = useMutation({
    mutationFn: (file: File) => bulkImportUsers(file),
    onSuccess: (res) => {
      invalidate();
      setBanner(
        `Import xong: tạo ${res.created}, bỏ qua ${res.skipped}.` +
          (res.errors.length ? ` Lỗi: ${res.errors.join("; ")}` : ""),
      );
    },
    onError: () => setBanner("Import thất bại — kiểm tra định dạng CSV."),
  });

  const filtered = useMemo(() => {
    let list = data ?? [];
    if (role !== "all") list = list.filter((u) => u.role === role);
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (u) =>
          u.full_name.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query) ||
          (u.phone ?? "").includes(query),
      );
    }
    return list;
  }, [data, role, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function exportCsv() {
    const header =
      "full_name,email,phone,role,region,referral_code,is_active,created_at";
    const lines = filtered.map((u) =>
      [
        u.full_name,
        u.email,
        u.phone ?? "",
        u.role,
        u.region ?? "",
        u.referral_code ?? "",
        u.is_active ? "active" : "disabled",
        u.created_at,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Người dùng"
        description="Quản lý tài khoản admin / sale / khách hàng."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Làm mới
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Xuất CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={importMut.isPending}
            >
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importMut.mutate(f);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <UserPlus className="h-4 w-4" />
              Thêm user
            </Button>
          </div>
        }
      />

      {banner && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-2.5 text-sm">
          <span>{banner}</span>
          <button
            onClick={() => setBanner(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setRole(f.key);
                setPage(1);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                role === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo tên, email, SĐT…"
            className="pl-9"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Họ tên</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">SĐT</th>
                <th className="px-4 py-3 font-medium">Vai trò</th>
                <th className="px-4 py-3 font-medium">Mã GT</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Ngày tạo</th>
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
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-muted-foreground"
                    colSpan={8}
                  >
                    Không có người dùng phù hợp.
                  </td>
                </tr>
              ) : (
                rows.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">{u.full_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === "admin" ? "default" : "muted"}>
                        {ROLE_LABEL[u.role] ?? u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.referral_code ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {u.is_active ? (
                        <Badge variant="success">Hoạt động</Badge>
                      ) : (
                        <Badge variant="danger">Đã khoá</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {shortDate(u.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn
                          title="Sửa"
                          onClick={() => {
                            setEditing(u);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          title="Reset mật khẩu"
                          onClick={() => resetMut.mutate(u.id)}
                        >
                          <KeyRound className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          title={u.is_active ? "Khoá" : "Mở khoá"}
                          onClick={() => toggleMut.mutate(u)}
                        >
                          {u.is_active ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <Unlock className="h-4 w-4" />
                          )}
                        </IconBtn>
                        <IconBtn
                          title="Khoá tài khoản (xoá mềm)"
                          danger
                          onClick={() => setConfirmUser(u)}
                        >
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

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Hiển thị {rows.length}/{filtered.length} người dùng (trang {safePage}/
          {totalPages}).
        </span>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Trước
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </Button>
        </div>
      </div>

      <UserForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={invalidate}
        editing={editing}
      />

      <Dialog open={Boolean(tempPw)} onClose={() => setTempPw(null)}>
        <DialogHeader
          title="Mật khẩu tạm thời"
          description="Sao chép và gửi cho người dùng. Mật khẩu này chỉ hiện một lần."
          onClose={() => setTempPw(null)}
        />
        <DialogBody>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-4 py-3">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <code className="text-base font-semibold">{tempPw}</code>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => tempPw && navigator.clipboard?.writeText(tempPw)}
            >
              Sao chép
            </Button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => setTempPw(null)}>Đã hiểu</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={Boolean(confirmUser)} onClose={() => setConfirmUser(null)}>
        <DialogHeader
          title="Khoá tài khoản?"
          description="Tài khoản sẽ bị vô hiệu hoá (xoá mềm) — KHÔNG xoá dữ liệu. Có thể mở lại sau."
          onClose={() => setConfirmUser(null)}
        />
        <DialogBody>
          <p className="text-sm">
            Bạn chắc chắn muốn khoá <b>{confirmUser?.full_name}</b> (
            {confirmUser?.email})?
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmUser(null)}>
            Huỷ
          </Button>
          <Button
            variant="danger"
            disabled={deleteMut.isPending}
            onClick={() => confirmUser && deleteMut.mutate(confirmUser.id)}
          >
            {deleteMut.isPending ? "Đang khoá…" : "Khoá tài khoản"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
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
