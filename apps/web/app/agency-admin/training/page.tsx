"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AgencyHeader,
  AgencyLoading,
  Card,
  EmptyState,
} from "@/components/agency/AgencyKit";
import {
  downloadProjectDocument,
  fetchProjectDocuments,
  type ProjectDocument,
} from "@/lib/api";
import { readToken } from "@/lib/auth";

const PROJECT_SLUG = "eurowindow-light-city";

export default function AgencyAdminTrainingPage() {
  const [docs, setDocs] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const token = readToken();
    setLoading(true);
    fetchProjectDocuments(PROJECT_SLUG, token ?? undefined)
      .then((d) => setDocs(d))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function download(doc: ProjectDocument) {
    const token = readToken();
    try {
      await downloadProjectDocument(doc, token ?? undefined);
    } catch {
      // bỏ qua — UI giữ nguyên
    }
  }

  return (
    <div className="space-y-5">
      <AgencyHeader
        title="Đào tạo"
        subtitle="Tài liệu dự án & bán hàng (dùng chung)"
        onRefresh={load}
        refreshing={loading}
      />

      {loading ? <AgencyLoading /> : null}

      {!loading ? (
        <Card title="Tài liệu dự án">
          {docs.length === 0 ? (
            <EmptyState text="Chưa có tài liệu đào tạo." />
          ) : (
            <ul className="space-y-2">
              {docs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-brand-100 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-brand-900">
                      {d.title}
                    </div>
                    <div className="text-xs text-brand-500">
                      {d.category}
                      {d.group ? ` · ${d.group}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => download(d)}
                    className="shrink-0 rounded-lg border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
                  >
                    Tải về
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
