"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Sparkles, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { commitImport, listSales } from "@/lib/api";
import type {
  ImportColumnMapping,
  ImportMappingField,
  ImportParsePreview,
  ImportResult,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

// Nhãn tiếng Việt cho từng trường map được. phone/email gắn dấu * (cần ≥1 để
// chống trùng — backend bắt buộc).
const FIELD_META: { key: ImportMappingField; label: string; required?: boolean }[] =
  [
    { key: "name", label: "Tên khách" },
    { key: "phone", label: "Số điện thoại *" },
    { key: "email", label: "Email *" },
    { key: "source", label: "Nguồn" },
    { key: "note", label: "Ghi chú" },
    { key: "demand", label: "Nhu cầu" },
  ];

const PREVIEW_ROWS = 8;

/**
 * Bảng xem trước + UI map cột + tuỳ chọn import + nút Nhập.
 * Dùng chung cho cả tab Google Trang tính & Tải file (nhận `preview` + `source`).
 */
export function ImportMappingPanel({
  preview,
  source,
  onImported,
}: {
  preview: ImportParsePreview;
  source: string; // "google_sheet" | "file_upload"
  onImported?: (result: ImportResult) => void;
}) {
  const salesQ = useQuery({ queryKey: ["sales"], queryFn: listSales });

  const [mapping, setMapping] = useState<ImportColumnMapping>(
    preview.suggested_mapping,
  );
  const [assignedSaleId, setAssignedSaleId] = useState<string>("");
  const [autoAssign, setAutoAssign] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [autoCare, setAutoCare] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);

  const hasContact = Boolean(mapping.phone || mapping.email);

  const commitMut = useMutation({
    mutationFn: () =>
      commitImport({
        rows: preview.rows,
        mapping,
        source,
        assigned_sale_id: assignedSaleId || null,
        auto_assign: autoAssign,
        skip_duplicates: skipDuplicates,
        auto_care: autoCare,
      }),
    onSuccess: (res) => {
      setResult(res);
      onImported?.(res);
    },
  });

  const previewRows = useMemo(
    () => preview.rows.slice(0, PREVIEW_ROWS),
    [preview.rows],
  );

  function setField(field: ImportMappingField, value: string) {
    setMapping((m) => ({ ...m, [field]: value || null }));
  }

  const sales = salesQ.data?.sales ?? [];
  const committing = commitMut.isPending;

  return (
    <div className="space-y-5">
      {/* Map cột */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Ghép cột dữ liệu</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Hệ thống đã tự nhận diện cột. Kiểm tra và chỉnh lại nếu cần. Cần map ít
          nhất <b>Số điện thoại</b> hoặc <b>Email</b> để chống trùng.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELD_META.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Select
                value={(mapping[f.key] as string) ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
              >
                <option value="">— Không map —</option>
                {preview.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </div>
        {!hasContact && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-danger">
            <AlertTriangle className="h-3.5 w-3.5" />
            Cần map ít nhất 1 cột SĐT hoặc Email.
          </p>
        )}
      </div>

      {/* Preview */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">
          Xem trước ({preview.total} dòng, hiển thị {previewRows.length})
        </h3>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                {preview.headers.map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {preview.headers.map((h) => (
                    <td
                      key={h}
                      className="max-w-[220px] truncate px-3 py-2 text-muted-foreground"
                    >
                      {String(row[h] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tuỳ chọn import */}
      <div className="grid gap-4 rounded-md border border-border bg-muted/20 p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Gán cho sale (tuỳ chọn)</Label>
          <Select
            value={assignedSaleId}
            onChange={(e) => setAssignedSaleId(e.target.value)}
            disabled={autoAssign}
          >
            <option value="">— Không gán cứng —</option>
            {sales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col justify-center gap-3">
          <label className="flex items-center gap-2.5 text-sm">
            <Switch checked={autoAssign} onChange={setAutoAssign} />
            <span>Tự chia đều cho sale đang hoạt động</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <Switch checked={skipDuplicates} onChange={setSkipDuplicates} />
            <span>Bỏ qua khách trùng (theo SĐT/Email)</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <Switch checked={autoCare} onChange={setAutoCare} />
            <span className="flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-warning" /> Chấm điểm AI ngay
              sau khi nhập
            </span>
          </label>
        </div>
      </div>

      {/* Nút nhập */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => commitMut.mutate()}
          disabled={committing || !hasContact}
        >
          <Upload className="h-4 w-4" />
          {committing ? "Đang nhập…" : `Nhập ${preview.total} dòng`}
        </Button>
        {commitMut.isError && (
          <span className="flex items-center gap-1.5 text-sm text-danger">
            <AlertTriangle className="h-4 w-4" />
            {(commitMut.error as Error)?.message ?? "Lỗi khi nhập."}
          </span>
        )}
      </div>

      {/* Kết quả */}
      {result && (
        <div className="rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 font-medium text-success">
            <CheckCircle2 className="h-4 w-4" />
            Hoàn tất: đã nhập {result.imported} · trùng {result.skipped} · lỗi{" "}
            {result.errors.length}
            {result.ai_scored > 0 && (
              <Badge variant="warning">
                <Sparkles className="h-3 w-3" /> AI chấm {result.ai_scored}
              </Badge>
            )}
          </div>
          {result.duplicates.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-muted-foreground">
                {result.duplicates.length} dòng trùng (bấm xem)
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                {JSON.stringify(result.duplicates, null, 2)}
              </pre>
            </details>
          )}
          {result.errors.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-amber-600">
                {result.errors.length} dòng lỗi (bấm xem)
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                {JSON.stringify(result.errors, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
