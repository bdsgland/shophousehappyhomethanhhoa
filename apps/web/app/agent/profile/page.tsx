"use client";

import { useEffect, useState } from "react";

import { Copy } from "@/components/dashboard/icons";
import {
  changeAgentPassword,
  fetchAgentMe,
  updateAgentProfile,
  type AuthUser,
} from "@/lib/api";
import { readToken, readUserFromCookie, setUserCookie } from "@/lib/auth";

const REGIONS = ["Thanh Hoá", "Hà Nội", "TP HCM", "Khác"];

export default function ProfilePage() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // form fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [region, setRegion] = useState("Thanh Hoá");
  const [avatar, setAvatar] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  // password form
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const t = readToken();
    setToken(t);
    if (!t) {
      setLoading(false);
      return;
    }
    fetchAgentMe(t)
      .then((u) => {
        setMe(u);
        setFullName(u.full_name ?? "");
        setPhone(u.phone ?? "");
        setDob(u.dob ?? "");
        setRegion(u.region ?? "Thanh Hoá");
      })
      .catch(() => {
        // fallback từ cookie nếu API lỗi
        const cu = readUserFromCookie();
        if (cu) {
          setMe(cu);
          setFullName(cu.full_name ?? "");
          setPhone(cu.phone ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setProfileMsg(null);
    try {
      const updated = await updateAgentProfile(token, {
        full_name: fullName,
        phone,
        dob,
        region,
      });
      setMe(updated);
      // đồng bộ lại cookie để AuthBar/Sidebar hiển thị tên mới
      setUserCookie(updated, 60 * 60 * 24);
      setProfileMsg({ ok: true, text: "Đã lưu thay đổi." });
    } catch (err) {
      setProfileMsg({
        ok: false,
        text: err instanceof Error ? err.message : "Lưu thất bại.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setPwMsg(null);
    if (newPw !== confirmPw) {
      setPwMsg({ ok: false, text: "Xác nhận mật khẩu không khớp." });
      return;
    }
    setPwSaving(true);
    try {
      await changeAgentPassword(token, {
        old_password: oldPw,
        new_password: newPw,
      });
      setPwMsg({ ok: true, text: "Đã cập nhật mật khẩu." });
      setOldPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      setPwMsg({
        ok: false,
        text: err instanceof Error ? err.message : "Đổi mật khẩu thất bại.",
      });
    } finally {
      setPwSaving(false);
    }
  }

  function copyCode() {
    if (!me?.referral_code) return;
    navigator.clipboard?.writeText(me.referral_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (loading) {
    return <div className="text-sm text-brand-700">Đang tải hồ sơ…</div>;
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm text-brand-900 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300";
  const labelCls = "block text-sm font-medium text-brand-800";
  const readonlyCls =
    "mt-1 w-full rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-600";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-brand-900">Thông tin cá nhân</h1>
        <p className="text-sm text-brand-700">
          Cập nhật hồ sơ và quản lý tài khoản chuyên viên kinh doanh.
        </p>
      </header>

      {/* Form hồ sơ */}
      <form
        onSubmit={saveProfile}
        className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-5 border-b border-brand-100 pb-5">
          <div className="h-20 w-20 overflow-hidden rounded-full bg-gradient-to-br from-amber-400 to-orange-500">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl font-bold text-white">
                {(me?.full_name ?? "?").trim().charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <label className="cursor-pointer rounded-lg border border-brand-100 px-3 py-2 text-sm font-medium text-brand-800 hover:border-orange-400">
              Đổi ảnh đại diện
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatarChange}
              />
            </label>
            <p className="mt-1.5 text-xs text-brand-500">
              PNG/JPG. Ảnh chỉ lưu tạm trên trình duyệt (bản xem trước).
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Họ và tên</label>
            <input
              className={inputCls}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
            />
          </div>
          <div>
            <label className={labelCls}>Email (tên đăng nhập)</label>
            <input className={readonlyCls} value={me?.email ?? ""} readOnly />
          </div>
          <div>
            <label className={labelCls}>Ngày sinh</label>
            <input
              type="date"
              className={inputCls}
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>SĐT liên hệ</label>
            <input
              className={inputCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09xx xxx xxx"
            />
          </div>
          <div>
            <label className={labelCls}>Khu vực hoạt động</label>
            <select
              className={inputCls}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>SĐT người giới thiệu (upline)</label>
            <input
              className={readonlyCls}
              value={me?.upline_email ?? "— Bạn là gốc cây —"}
              readOnly
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Mã giới thiệu cá nhân</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                className={`${readonlyCls} mt-0 flex-1 font-mono font-semibold tracking-wide text-orange-700`}
                value={me?.referral_code ?? "—"}
                readOnly
              />
              <button
                type="button"
                onClick={copyCode}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-100 px-3 py-2 text-sm font-medium text-brand-800 hover:border-orange-400"
              >
                <Copy size={16} />
                {copied ? "Đã copy" : "Copy"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-60"
          >
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
          {profileMsg && (
            <span
              className={`text-sm ${
                profileMsg.ok ? "text-emerald-700" : "text-rose-600"
              }`}
            >
              {profileMsg.text}
            </span>
          )}
        </div>
      </form>

      {/* Đổi mật khẩu */}
      <form
        onSubmit={savePassword}
        className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm"
      >
        <h2 className="text-sm font-bold uppercase tracking-wide text-brand-900">
          Đổi mật khẩu
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Mật khẩu hiện tại</label>
            <input
              type="password"
              className={inputCls}
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Mật khẩu mới</label>
            <input
              type="password"
              className={inputCls}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Tối thiểu 8 ký tự, có chữ và số"
            />
          </div>
          <div>
            <label className={labelCls}>Xác nhận mật khẩu mới</label>
            <input
              type="password"
              className={inputCls}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={pwSaving}
            className="rounded-lg bg-brand-900 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pwSaving ? "Đang cập nhật…" : "Cập nhật mật khẩu"}
          </button>
          {pwMsg && (
            <span
              className={`text-sm ${pwMsg.ok ? "text-emerald-700" : "text-rose-600"}`}
            >
              {pwMsg.text}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
