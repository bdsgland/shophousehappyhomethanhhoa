"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  ChevronLeft,
  Download,
  FileText,
  Trash2,
  Upload,
} from "@/components/dashboard/icons";
import type { AuthUser } from "@/lib/api";
import { readToken, readUserFromCookie } from "@/lib/auth";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  deleteDocument,
  downloadFile,
  fetchDocuments,
  formatBytes,
  uploadDocument,
  type DocumentCategory,
  type LearningDocument,
} from "@/lib/learning";

type Row = {
  name: string;
  status: "pending" | "uploading" | "done" | "error";
  message?: string;
  chunks?: number;
};

export function LearningUpload() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [category, setCategory] = useState<DocumentCategory>("policy");
  const [rows, setRows] = useState<Row[]>([]);
  const [docs, setDocs] = useState<LearningDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setToken(readToken());
    setUser(readUserFromCookie());
  }, []);

  function refresh(tk: string) {
    setLoading(true);
    fetchDocuments(tk)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (token) refresh(token);
  }, [token]);

  async function onUpload(files: FileList | null) {
    if (!files || !token) return;
    const list = Array.from(files);
    setRows(list.map((f) => ({ name: f.name, status: "pending" })));
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      setRows((r) =>
        r.map((row, idx) => (idx === i ? { ...row, status: "uploading" } : row)),
      );
      try {
        const res = await uploadDocument(
          token,
          file,
          file.name.replace(/\.[^.]+$/, ""),
          category,
        );
        setRows((r) =>
          r.map((row, idx) =>
            idx === i ? { ...row, status: "done", chunks: res.chunks } : row,
          ),
        );
      } catch (e) {
        setRows((r) =>
          r.map((row, idx) =>
            idx === i
              ? { ...row, status: "error", message: (e as Error).message }
              : row,
          ),
        );
      }
    }
    if (fileRef.current) fileRef.current.value = "";
    refresh(token);
  }

  async function onDelete(id: string) {
    if (!token) return;
    await deleteDocument(token, id).catch(() => undefined);
    refresh(token);
  }

  if (user && user.role !== "admin") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
        Trang này chỉ dành cho Quản trị viên.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/project/happy-home-thanh-hoa"
        className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-orange-700"
      >
        <ChevronLeft size={16} /> Về dashboard
      </Link>

      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-900">
          <Upload size={24} className="text-orange-500" /> Tải tài liệu vào Kho học tập
        </h1>
        <p className="text-sm text-brand-700">
          File được lưu và index vào RAG để sale tra cứu &amp; hỏi AI. Hỗ trợ PDF,
          DOCX, XLSX, PNG/JPG (≤ 25MB).
        </p>
      </header>

      <div className="space-y-4 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="text-xs font-medium text-brand-600">Nhóm tài liệu</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as DocumentCategory)}
              className="block rounded-lg border border-brand-100 px-3 py-2 text-sm outline-none focus:border-orange-400"
            >
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            <Upload size={16} /> Chọn file để tải lên
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg"
            onChange={(e) => onUpload(e.target.files)}
            className="hidden"
          />
        </div>

        {rows.length > 0 && (
          <ul className="space-y-1.5">
            {rows.map((r, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm"
              >
                <span className="truncate text-brand-800">{r.name}</span>
                <span className="ml-3 shrink-0 text-xs">
                  {r.status === "uploading" && (
                    <span className="text-amber-600">⏳ đang xử lý…</span>
                  )}
                  {r.status === "done" && (
                    <span className="text-emerald-600">
                      ✓ đã index ({r.chunks ?? 0} đoạn)
                    </span>
                  )}
                  {r.status === "error" && (
                    <span className="text-red-600">✕ {r.message}</span>
                  )}
                  {r.status === "pending" && <span className="text-brand-400">chờ…</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-brand-900">
          Tài liệu đã có ({docs.length})
        </h2>
        {loading ? (
          <div className="h-24 animate-pulse rounded-xl border border-brand-100 bg-brand-50" />
        ) : docs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-brand-200 bg-white p-8 text-center text-sm text-brand-500">
            Chưa có tài liệu nào.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-brand-100 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-left text-xs text-brand-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Tài liệu</th>
                  <th className="px-4 py-2 font-medium">Nhóm</th>
                  <th className="px-4 py-2 font-medium">Index</th>
                  <th className="px-4 py-2 text-right font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {docs.map((d) => (
                  <tr key={d.id} className="hover:bg-brand-50/40">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="shrink-0 text-orange-500" />
                        <span className="truncate text-brand-900">{d.title}</span>
                        <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] uppercase text-brand-500">
                          {d.type}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-brand-600">
                      {CATEGORY_LABELS[d.category]}
                    </td>
                    <td className="px-4 py-2.5">
                      {d.indexed ? (
                        <span className="text-xs text-emerald-600">
                          ● {d.chunks} đoạn
                        </span>
                      ) : (
                        <span className="text-xs text-brand-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            token &&
                            downloadFile(token, d.download_url, `${d.title}.${d.type}`)
                          }
                          className="rounded-lg border border-brand-100 p-1.5 text-brand-600 hover:border-orange-300 hover:text-orange-700"
                          aria-label="Tải"
                          title="Tải xuống"
                        >
                          <Download size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(d.id)}
                          className="rounded-lg border border-red-100 p-1.5 text-red-500 hover:bg-red-50"
                          aria-label="Xoá"
                          title="Xoá tài liệu"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-brand-400">
          {formatBytes(docs.reduce((s, d) => s + d.size, 0))} tổng dung lượng.
        </p>
      </section>
    </div>
  );
}
