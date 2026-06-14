"use client";

/**
 * Phiếu TÍNH GIÁ TỰ ĐỘNG cho khu QUẢN TRỊ SÀN F2.
 *
 * TÁI DÙNG đúng component `PolicyQuoteTab` mà SALE đang dùng (LearningCenter) —
 * chọn căn → tính giá theo chính sách CĐT (chiết khấu, VAT, KPBT, tiến độ thanh
 * toán). Gọi cùng backend /learning/policy-quote (đã mở quyền cho role agency).
 *
 * AN TOÀN: phiếu chỉ TÍNH/HIỂN THỊ trên quỹ căn dùng chung + chính sách CĐT,
 * không có side-effect chéo sàn. Token/user đọc từ cookie như các trang khác.
 */

import { useEffect, useState } from "react";

import { AgencyHeader } from "@/components/agency/AgencyKit";
import { PolicyQuoteTab } from "@/components/agent/LearningCenter";
import type { AuthUser } from "@/lib/api";
import { readToken, readUserFromCookie } from "@/lib/auth";

export default function AgencyAdminQuotePage() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setToken(readToken());
    setUser(readUserFromCookie());
  }, []);

  return (
    <div className="space-y-5">
      <AgencyHeader
        title="Lập phiếu tính giá tự động"
        subtitle="Chọn căn → tính giá theo chính sách CĐT (chiết khấu, VAT, KPBT, tiến độ thanh toán)"
      />

      {token ? (
        <PolicyQuoteTab token={token} user={user} />
      ) : (
        <div className="rounded-2xl border border-brand-100 bg-white p-8 text-center text-sm text-brand-600">
          Đang tải phiên đăng nhập…
        </div>
      )}
    </div>
  );
}
