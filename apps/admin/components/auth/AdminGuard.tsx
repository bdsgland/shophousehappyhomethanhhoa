"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { getMe } from "@/lib/api";
import { cacheUser, clearToken, getCachedUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";

// Bọc toàn bộ khu vực admin: xác thực token + đảm bảo role=admin.
// Middleware đã chặn người chưa có token; ở đây ta kiểm tra role thực sự.
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    initialData: () => getCachedUser() ?? undefined,
    retry: false,
  });

  useEffect(() => {
    if (data) cacheUser(data);
  }, [data]);

  useEffect(() => {
    if (isError) {
      clearToken();
      router.replace("/login");
    }
  }, [isError, router]);

  if (isLoading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (data && data.role !== "admin") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <ShieldAlert className="h-12 w-12 text-danger" />
        <div>
          <h1 className="text-lg font-semibold">Không có quyền truy cập</h1>
          <p className="text-sm text-muted-foreground">
            Tài khoản <b>{data.email}</b> (vai trò: {data.role}) không phải quản
            trị viên.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            clearToken();
            router.replace("/login");
          }}
        >
          Đăng nhập tài khoản khác
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
