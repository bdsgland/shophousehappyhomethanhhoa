"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Circle, Star } from "lucide-react";

import { assignCareLead, getSaleSuggestions } from "@/lib/api";
import type { AssignCareInput, CrmContactChannel, SaleSuggestion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const CHANNELS: { value: CrmContactChannel; label: string }[] = [
  { value: "call", label: "Gọi điện" },
  { value: "zalo", label: "Zalo" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
  { value: "inperson", label: "Gặp mặt" },
];

const AVAIL_LABEL: Record<string, string> = {
  online: "Đang trực",
  busy: "Đang bận",
  away: "Tạm vắng",
  dnd: "Không làm phiền",
};

/**
 * Modal "Phân công / Giao chăm sóc". Bảng chọn sale GỢI Ý: badge online + điểm
 * hiệu suất (đã sort online + điểm cao lên trên từ backend). Chọn sale + kênh →
 * POST /admin/crm/leads/{id}/assign-care → onSaved (refresh + ghi feed timeline).
 */
export function AssignCareModal({
  leadId,
  currentSaleId,
  open,
  onClose,
  onSaved,
}: {
  leadId: string;
  currentSaleId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string>(currentSaleId ?? "");
  const [channel, setChannel] = useState<CrmContactChannel | "">("");
  const [error, setError] = useState<string | null>(null);

  const suggQ = useQuery({
    queryKey: ["sale-suggestions"],
    queryFn: getSaleSuggestions,
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: () => {
      const body: AssignCareInput = {
        sale_id: selected,
        channel: channel || null,
      };
      return assignCareLead(leadId, body);
    },
    onSuccess: () => {
      setError(null);
      onSaved();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  function submit() {
    if (!selected) return setError("Hãy chọn 1 sale để giao chăm sóc");
    mut.mutate();
  }

  const sales = suggQ.data ?? [];

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader
        title="Phân công chăm sóc"
        description="Chọn sale (ưu tiên đang trực + điểm cao) và kênh chăm sóc"
        onClose={onClose}
      />
      <DialogBody>
        <div>
          <Label>Chọn sale</Label>
          <div className="mt-1 max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {suggQ.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : sales.length === 0 ? (
              <p className="text-sm text-muted-foreground">Không có sale khả dụng.</p>
            ) : (
              sales.map((s: SaleSuggestion) => {
                const active = selected === s.sale_id;
                return (
                  <button
                    key={s.sale_id}
                    type="button"
                    onClick={() => setSelected(s.sale_id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Circle
                        className={`h-2.5 w-2.5 shrink-0 ${
                          s.online
                            ? "fill-success text-success"
                            : "fill-muted-foreground/40 text-muted-foreground/40"
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {s.sale_name}
                          {s.rank <= 3 && (
                            <Star className="ml-1 inline h-3.5 w-3.5 fill-warning text-warning" />
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {s.online
                            ? AVAIL_LABEL[s.availability ?? "online"] ?? "Đang trực"
                            : s.availability
                            ? AVAIL_LABEL[s.availability] ?? "Offline"
                            : "Offline"}
                          {s.active_calls > 0 ? ` · ${s.active_calls} cuộc` : ""}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold text-primary">
                        {Math.round(s.eligibility_score)}đ
                      </span>
                      <span className="block text-xs text-muted-foreground">#{s.rank}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="ac-channel">Kênh chăm sóc (tuỳ chọn)</Label>
          <Select
            id="ac-channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as CrmContactChannel | "")}
          >
            <option value="">— Không chỉ định —</option>
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
          Huỷ
        </Button>
        <Button onClick={submit} disabled={mut.isPending || !selected}>
          {mut.isPending ? "Đang giao…" : "Giao chăm sóc"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
