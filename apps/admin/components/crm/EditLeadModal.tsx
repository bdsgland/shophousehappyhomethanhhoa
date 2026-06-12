"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { updateCrmLead } from "@/lib/api";
import type {
  CrmLead,
  CrmLeadDetail,
  CrmLeadSource,
  CrmLeadStatus,
  CrmLeadUpdate,
  SaleRow,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const SOURCES: { value: CrmLeadSource; label: string }[] = [
  { value: "imported", label: "Danh bạ" },
  { value: "registered", label: "Tự đăng ký" },
  { value: "referral", label: "Giới thiệu" },
  { value: "fb_ads", label: "FB Ads" },
  { value: "zalo", label: "Zalo" },
  { value: "email", label: "Email" },
  { value: "manual", label: "Nhập tay" },
  { value: "google_sheet", label: "Google Sheet" },
  { value: "file_upload", label: "Tải file" },
];

const STATUSES: { value: CrmLeadStatus; label: string }[] = [
  { value: "cold", label: "Lạnh" },
  { value: "warm", label: "Ấm" },
  { value: "hot", label: "Nóng" },
  { value: "customer", label: "Khách hàng" },
  { value: "lost", label: "Đã mất" },
];

/**
 * Modal "Sửa thông tin khách" (admin). Chỉnh name/phone/email/source/status/note
 * + người phụ trách → PATCH /admin/crm/leads/{id}. Khi lưu xong gọi onSaved để
 * trang chi tiết refetch hồ sơ + dòng thời gian (đã ghi mục "đã cập nhật").
 */
export function EditLeadModal({
  lead,
  sales,
  open,
  onClose,
  onSaved,
}: {
  lead: CrmLeadDetail | CrmLead;
  sales: SaleRow[];
  open: boolean;
  onClose: () => void;
  onSaved: (updated: CrmLead) => void;
}) {
  const [name, setName] = useState(lead.name ?? "");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [source, setSource] = useState<CrmLeadSource>(lead.source);
  const [status, setStatus] = useState<CrmLeadStatus>(lead.status);
  const [assigned, setAssigned] = useState(lead.assigned_sale_id ?? "");
  const [note, setNote] = useState(lead.note ?? "");
  // Trường phân loại / hồ sơ mở rộng (Customer 360).
  const [region, setRegion] = useState(lead.region ?? "");
  const [customerGroup, setCustomerGroup] = useState(lead.customer_group ?? "");
  const [productType, setProductType] = useState(lead.product_type ?? "");
  const [budget, setBudget] = useState(lead.budget ?? "");
  const [purpose, setPurpose] = useState(lead.purpose ?? "");
  const [project, setProject] = useState(lead.project ?? "");
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => {
      const body: CrmLeadUpdate = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        source,
        status,
        note: note.trim() || null,
        assigned_sale_id: assigned || null,
        region: region.trim() || null,
        customer_group: customerGroup.trim() || null,
        product_type: productType.trim() || null,
        budget: budget.trim() || null,
        purpose: purpose.trim() || null,
        project: project.trim() || null,
      };
      return updateCrmLead(lead.id, body);
    },
    onSuccess: (updated) => {
      setError(null);
      onSaved(updated);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  function submit() {
    if (!name.trim()) return setError("Tên không được để trống");
    if (!phone.trim()) return setError("SĐT không được để trống");
    mut.mutate();
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader
        title="Sửa thông tin khách"
        description={lead.name}
        onClose={onClose}
      />
      <DialogBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="el-name">Tên khách</Label>
            <Input id="el-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="el-phone">SĐT</Label>
            <Input id="el-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="el-email">Email</Label>
            <Input
              id="el-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="el-source">Nguồn</Label>
            <Select
              id="el-source"
              value={source}
              onChange={(e) => setSource(e.target.value as CrmLeadSource)}
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="el-status">Trạng thái</Label>
            <Select
              id="el-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as CrmLeadStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="el-assigned">Người phụ trách</Label>
            <Select
              id="el-assigned"
              value={assigned}
              onChange={(e) => setAssigned(e.target.value)}
            >
              <option value="">Chưa phân bổ</option>
              {sales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="el-region">Vùng miền / khu vực</Label>
            <Input id="el-region" value={region} onChange={(e) => setRegion(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="el-group">Tệp khách / nhóm khách</Label>
            <Input
              id="el-group"
              value={customerGroup}
              onChange={(e) => setCustomerGroup(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="el-product">Phân khúc / SP quan tâm</Label>
            <Input
              id="el-product"
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="el-budget">Ngân sách</Label>
            <Input id="el-budget" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="el-purpose">Mục đích (ở / đầu tư)</Label>
            <Input
              id="el-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="el-project">Dự án quan tâm</Label>
            <Input id="el-project" value={project} onChange={(e) => setProject(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="el-note">Ghi chú</Label>
            <Textarea
              id="el-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
          Huỷ
        </Button>
        <Button onClick={submit} disabled={mut.isPending}>
          {mut.isPending ? "Đang lưu…" : "Lưu thay đổi"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
