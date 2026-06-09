"use client";

import { useState } from "react";

import {
  ApiError,
  createUnit,
  updateUnit,
  type UpdateUnitPayload,
} from "@/lib/api";
import type { InventoryUnit } from "@/lib/types";
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

export const PHAN_KHU_OPTIONS = [
  "Bình Minh",
  "Mặt Trời",
  "Cầu Vồng",
  "Ánh Sao",
  "Ánh Trăng",
  "Ánh Sáng",
  "Hừng Đông",
] as const;

export const LOAI_OPTIONS = ["Liền kề", "Shophouse", "Biệt thự"] as const;

export const TRANG_THAI_OPTIONS = ["Còn hàng", "Đặt cọc", "Đã bán"] as const;

// Phân loại quỹ (key gửi backend, label hiển thị).
export const QUY_OPTIONS: { value: string; label: string }[] = [
  { value: "exclusive", label: "Quỹ độc quyền" },
  { value: "bonus", label: "Quỹ thưởng" },
  { value: "agency_f1", label: "Quỹ liên kết đại lý F1" },
  { value: "mid", label: "Quỹ trung" },
  { value: "not_open", label: "Quỹ chưa mở bán" },
];

export function UnitEditModal({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: InventoryUnit | null;
}) {
  const isEdit = Boolean(editing);
  const [id, setId] = useState(editing?.id ?? "");
  const [phanKhu, setPhanKhu] = useState<string>(
    editing?.phan_khu ?? PHAN_KHU_OPTIONS[0],
  );
  const [loai, setLoai] = useState<string>(editing?.loai ?? LOAI_OPTIONS[0]);
  const [dienTich, setDienTich] = useState(
    editing ? String(editing.dien_tich) : "",
  );
  const [matTien, setMatTien] = useState(
    editing ? String(editing.mat_tien) : "",
  );
  const [giaTri, setGiaTri] = useState(
    editing ? String(editing.gia_tri) : "",
  );
  const [trangThai, setTrangThai] = useState<string>(
    editing?.trang_thai ?? TRANG_THAI_OPTIONS[0],
  );
  const [quy, setQuy] = useState<string>(editing?.quy ?? QUY_OPTIONS[4].value);
  const [giaNY, setGiaNY] = useState(
    editing?.gia_ny_gom_vat_kpbt ? String(editing.gia_ny_gom_vat_kpbt) : "",
  );
  const [vat, setVat] = useState(editing?.vat_hdmb ? String(editing.vat_hdmb) : "");
  const [kpbt, setKpbt] = useState(editing?.kpbt ? String(editing.kpbt) : "");
  const [gtXay, setGtXay] = useState(
    editing?.gt_xay_ny ? String(editing.gt_xay_ny) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form mỗi khi mở với căn khác (pattern giống UserForm).
  const formKey = editing?.id ?? "new";
  const [activeKey, setActiveKey] = useState(formKey);
  if (activeKey !== formKey) {
    setActiveKey(formKey);
    setId(editing?.id ?? "");
    setPhanKhu(editing?.phan_khu ?? PHAN_KHU_OPTIONS[0]);
    setLoai(editing?.loai ?? LOAI_OPTIONS[0]);
    setDienTich(editing ? String(editing.dien_tich) : "");
    setMatTien(editing ? String(editing.mat_tien) : "");
    setGiaTri(editing ? String(editing.gia_tri) : "");
    setTrangThai(editing?.trang_thai ?? TRANG_THAI_OPTIONS[0]);
    setQuy(editing?.quy ?? QUY_OPTIONS[4].value);
    setGiaNY(editing?.gia_ny_gom_vat_kpbt ? String(editing.gia_ny_gom_vat_kpbt) : "");
    setVat(editing?.vat_hdmb ? String(editing.vat_hdmb) : "");
    setKpbt(editing?.kpbt ? String(editing.kpbt) : "");
    setGtXay(editing?.gt_xay_ny ? String(editing.gt_xay_ny) : "");
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    if (!isEdit && !id.trim()) {
      setError("Mã căn là bắt buộc.");
      return;
    }
    const payload: UpdateUnitPayload = {
      phan_khu: phanKhu,
      loai,
      dien_tich: dienTich.trim() ? Number(dienTich) : undefined,
      mat_tien: matTien.trim() ? Number(matTien) : undefined,
      gia_tri: giaTri.trim() ? Number(giaTri) : undefined,
      trang_thai: trangThai,
      quy,
      gia_ny_gom_vat_kpbt: giaNY.trim() ? Number(giaNY) : undefined,
      vat_hdmb: vat.trim() ? Number(vat) : undefined,
      kpbt: kpbt.trim() ? Number(kpbt) : undefined,
      gt_xay_ny: gtXay.trim() ? Number(gtXay) : undefined,
    };
    setSaving(true);
    try {
      if (isEdit && editing) {
        await updateUnit(editing.id, payload);
      } else {
        await createUnit({ id: id.trim(), ...payload });
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
        title={isEdit ? "Sửa căn" : "Thêm căn"}
        description={
          isEdit
            ? "Cập nhật thông tin, giá trị & trạng thái căn."
            : "Tạo căn mới trong quỹ căn."
        }
        onClose={onClose}
      />
      <DialogBody>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Mã căn {isEdit ? "" : "*"}</Label>
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={isEdit}
              placeholder="VD: BM-LK-01"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phân khu</Label>
            <Select
              value={phanKhu}
              onChange={(e) => setPhanKhu(e.target.value)}
            >
              {PHAN_KHU_OPTIONS.map((pk) => (
                <option key={pk} value={pk}>
                  {pk}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Loại</Label>
            <Select value={loai} onChange={(e) => setLoai(e.target.value)}>
              {LOAI_OPTIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Diện tích (m²)</Label>
            <Input
              type="number"
              value={dienTich}
              onChange={(e) => setDienTich(e.target.value)}
              placeholder="VD: 90"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mặt tiền (m)</Label>
            <Input
              type="number"
              value={matTien}
              onChange={(e) => setMatTien(e.target.value)}
              placeholder="VD: 6"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Giá trị (tỷ)</Label>
            <Input
              type="number"
              value={giaTri}
              onChange={(e) => setGiaTri(e.target.value)}
              placeholder="VD: 2.5"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Trạng thái</Label>
            <Select
              value={trangThai}
              onChange={(e) => setTrangThai(e.target.value)}
            >
              {TRANG_THAI_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quỹ</Label>
            <Select value={quy} onChange={(e) => setQuy(e.target.value)}>
              {QUY_OPTIONS.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Giá chi tiết (cho phiếu tính giá) — đơn vị VND
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>TGT niêm yết (gồm VAT, KPBT)</Label>
            <Input
              type="number"
              value={giaNY}
              onChange={(e) => setGiaNY(e.target.value)}
              placeholder="VD: 7264177517"
            />
          </div>
          <div className="space-y-1.5">
            <Label>VAT (số tiền)</Label>
            <Input
              type="number"
              value={vat}
              onChange={(e) => setVat(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phí bảo trì KPBT (số tiền)</Label>
            <Input
              type="number"
              value={kpbt}
              onChange={(e) => setKpbt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Giá trị xây NY (số tiền)</Label>
            <Input
              type="number"
              value={gtXay}
              onChange={(e) => setGtXay(e.target.value)}
            />
          </div>
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
          {saving ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Tạo căn"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
