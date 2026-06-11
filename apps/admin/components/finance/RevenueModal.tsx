"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { createManualRevenue, updateManualRevenue } from "@/lib/api";
import type {
  FinanceManualRevenue,
  FinanceManualRevenueInput,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function RevenueModal({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: FinanceManualRevenue | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FinanceManualRevenueInput>({
    name: "",
    amount: 0,
    date: todayStr(),
    source: "khác",
    note: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setForm({
        name: editing.name,
        amount: editing.amount,
        date: editing.date,
        source: editing.source ?? "khác",
        note: editing.note ?? "",
      });
    } else {
      setForm({
        name: "",
        amount: 0,
        date: todayStr(),
        source: "khác",
        note: "",
      });
    }
  }, [open, editing]);

  const mut = useMutation({
    mutationFn: (payload: FinanceManualRevenueInput) =>
      editing
        ? updateManualRevenue(editing.id, payload)
        : createManualRevenue(payload),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });

  function submit() {
    if (!form.name.trim()) {
      setError("Vui lòng nhập tên khoản doanh thu.");
      return;
    }
    if (!(form.amount >= 0)) {
      setError("Số tiền không hợp lệ.");
      return;
    }
    setError(null);
    mut.mutate({ ...form, name: form.name.trim() });
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader
        title={editing ? "Sửa doanh thu thủ công" : "Thêm doanh thu thủ công"}
        description="Khoản doanh thu ngoài hoa hồng tự động (VD: phí dịch vụ, khác)."
        onClose={onClose}
      />
      <DialogBody>
        {error && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Tên khoản thu</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="VD: Phí tư vấn dự án"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Số tiền (VND)</Label>
            <Input
              type="number"
              min={0}
              value={form.amount}
              onChange={(e) =>
                setForm({ ...form, amount: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ngày ghi nhận</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Nguồn</Label>
          <Input
            value={form.source ?? ""}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            placeholder="VD: phí dịch vụ"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Ghi chú</Label>
          <Textarea
            value={form.note ?? ""}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Tùy chọn"
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
          Hủy
        </Button>
        <Button onClick={submit} disabled={mut.isPending}>
          {mut.isPending ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Thêm"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
