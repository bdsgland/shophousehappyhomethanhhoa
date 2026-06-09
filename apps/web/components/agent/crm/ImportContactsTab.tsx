"use client";

import { useRef, useState } from "react";

import { Download, Upload } from "@/components/dashboard/icons";
import { bulkImportLeads, type BulkImportResult, type LeadInput } from "@/lib/crm";

// Parse text danh bạ: mỗi dòng "Tên, SĐT, [email]" hoặc tách bằng tab.
function parseRaw(text: string): LeadInput[] {
  const out: LeadInput[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/[,\t;]/).map((p) => p.trim());
    // Bỏ qua dòng header phổ biến.
    if (/^(tên|name|họ tên)$/i.test(parts[0])) continue;
    const phone = parts.find((p) => /\d{8,}/.test(p.replace(/\D/g, "")));
    const email = parts.find((p) => /@/.test(p));
    const name = parts[0] && !/\d{8,}/.test(parts[0].replace(/\D/g, "")) ? parts[0] : "Khách";
    if (!phone) continue;
    out.push({ name, phone, email: email ?? null, source: "imported" });
  }
  return out;
}

export function ImportContactsTab({
  token,
  onImported,
}: {
  token: string;
  onImported: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<LeadInput[]>([]);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function buildPreview(text: string) {
    setRaw(text);
    setResult(null);
    setPreview(parseRaw(text));
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => buildPreview(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const blob = new Blob(["Tên,SĐT,Email\nNguyễn Văn A,0901234567,a@gmail.com\n"], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mau-danh-ba.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submit() {
    if (preview.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await bulkImportLeads(token, preview, true);
      setResult(res);
      setRaw("");
      setPreview([]);
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Upload CSV */}
        <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-brand-900">Tải lên file CSV</h3>
          <p className="mt-1 text-xs text-brand-600">
            Cột: Tên, SĐT, Email. Tải mẫu để đúng định dạng.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              <Upload size={16} /> Chọn file CSV
            </button>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 rounded-lg border border-brand-100 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              <Download size={16} /> Tải mẫu
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </div>

        {/* Paste raw */}
        <div className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-brand-900">Hoặc dán danh sách</h3>
          <p className="mt-1 text-xs text-brand-600">Mỗi dòng: Tên, SĐT, Email</p>
          <textarea
            value={raw}
            onChange={(e) => buildPreview(e.target.value)}
            rows={4}
            placeholder={"Nguyễn Văn A, 0901234567\nTrần Thị B, 0912345678, b@gmail.com"}
            className="mt-2 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm text-brand-900 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300"
          />
        </div>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-brand-100 bg-brand-50 px-5 py-3">
            <h3 className="text-sm font-bold text-brand-900">
              Xem trước ({preview.length} khách)
            </h3>
            <button
              onClick={submit}
              disabled={saving}
              className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {saving ? "Đang nhập…" : `Nhập ${preview.length} khách`}
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-brand-100 text-left text-xs uppercase text-brand-500">
                  <th className="px-4 py-2">Tên</th>
                  <th className="px-4 py-2">SĐT</th>
                  <th className="px-4 py-2">Email</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((l, i) => (
                  <tr key={i} className="border-b border-brand-50">
                    <td className="px-4 py-2 text-brand-900">{l.name}</td>
                    <td className="px-4 py-2 text-brand-700">{l.phone}</td>
                    <td className="px-4 py-2 text-brand-500">{l.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          ✅ Đã thêm <b>{result.imported}</b> khách, bỏ qua <b>{result.skipped}</b> trùng.
          {result.duplicates.length > 0 && (
            <span className="text-emerald-700">
              {" "}
              (Trùng: {result.duplicates.map((d) => d.phone).join(", ")})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
