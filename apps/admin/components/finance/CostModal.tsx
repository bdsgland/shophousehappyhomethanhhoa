"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { createFinanceCost, updateFinanceCost } from "@/lib/api";
import type { FinanceCost, FinanceCostInput } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = ["nền tảng", "marketing", "nhân sự", "vận hành", "khác"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function CostModal({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: FinanceCost | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FinanceCostInput>({
    category: "nền tảng",
    name: "",
    amount: 0,
    recurring: "monthly",
    date: todayStr(),
    note: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setForm({
        category: editing.category,
        name: editing.name,
        amount: editing.amount,
        recurring: editing.recurring,
        date: editing.date,
        note: editing.note ?? "",
      });
    } else {
      setForm({
        category: "nền tảng",
        name: "",
        amount: 0,
        recurring: "monthly",
        date: todayStr(),
        note: "",
      });
    }
  }, [open, editing]);

  const mut = useMutation({
    mutationFn: (payload: FinanceCostInput) =>
      editing
        ? updateFinanceCost(editing.id, payload)
        : createFinanceCost(payload),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });

  function submit() {
    if (!form.name.trim()) {
      setError("Vui lòng nhập tên khoản chi phí.");
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
        title={editing ? "Sửa khoản chi phí" : "Thêm khoản chi phí"}
        description="Chi phí dùng để tính lợi nhuận theo kỳ."
        onClose={onClose}
      />
      <DialogBody>
        {error && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Hạng mục</Label>
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Loại</Label>
            <Select
              value={form.recurring}
              onChange={(e) => setForm({ ...form, recurring: e.target.value })}
            >
              <option value="monthly">Hàng tháng</option>
              <option value="one_off">Một lần</option>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Tên khoản chi</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="VD: Quảng cáo Facebook"
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
            <Label>{form.recurring === "monthly" ? "Bắt đầu từ" : "Ngày phát sinh"}</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
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
