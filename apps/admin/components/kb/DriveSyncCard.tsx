"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CloudDownload, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getDriveSyncConfig,
  getDriveSyncJob,
  startDriveSync,
} from "@/lib/api";
import type { DriveSyncJob } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const STATUS_LABEL: Record<DriveSyncJob["status"], string> = {
  queued: "Đang chờ",
  listing: "Đang quét folder",
  downloading: "Đang tải file",
  indexing: "Đang index RAG",
  completed: "Hoàn tất",
  failed: "Thất bại",
};

export function DriveSyncCard({ onSynced }: { onSynced: () => void }) {
  const [folderUrl, setFolderUrl] = useState("");
  const [skipExisting, setSkipExisting] = useState(true);
  const [reindexRag, setReindexRag] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ["drive-sync-config"],
    queryFn: getDriveSyncConfig,
  });

  // Gợi ý folder mặc định của chủ đầu tư khi chưa nhập.
  useEffect(() => {
    if (!folderUrl && configQuery.data?.default_folder_url) {
      setFolderUrl(configQuery.data.default_folder_url);
    }
  }, [configQuery.data, folderUrl]);

  const jobQuery = useQuery({
    queryKey: ["drive-sync-job", jobId],
    queryFn: () => getDriveSyncJob(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "completed" || s === "failed" ? false : 1500;
    },
  });

  // Khi job xong → làm mới danh sách tài liệu/thống kê.
  const status = jobQuery.data?.status;
  useEffect(() => {
    if (status === "completed") onSynced();
  }, [status, onSynced]);

  const startMut = useMutation({
    mutationFn: () =>
      startDriveSync({
        folder_url: folderUrl,
        skip_existing: skipExisting,
        reindex_rag: reindexRag,
      }),
    onSuccess: (res) => setJobId(res.job_id),
  });

  const job = jobQuery.data;
  const running =
    Boolean(jobId) && status !== "completed" && status !== "failed";
  const notConfigured = configQuery.data?.google_configured === false;

  return (
    <Card className="mb-4 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <CloudDownload className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">
            Đồng bộ tài liệu từ Google Drive
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Dán link folder Drive chính thống của chủ đầu tư — hệ thống tải toàn
            bộ file (kể cả subfolder), phân loại tự động và index vào RAG cho
            chatbot tư vấn.
          </p>
        </div>
      </div>

      {notConfigured && (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          ⚠️ Chưa cấu hình Google Workspace (refresh token). Sync sẽ báo lỗi cho
          tới khi đặt biến môi trường <code>GOOGLE_WORKSPACE_REFRESH_TOKEN</code>{" "}
          kèm scope <code>drive.readonly</code>.
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="https://drive.google.com/drive/folders/..."
          value={folderUrl}
          onChange={(e) => setFolderUrl(e.target.value)}
          disabled={running}
        />
        <Button
          onClick={() => startMut.mutate()}
          disabled={running || startMut.isPending || !folderUrl.trim()}
        >
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang sync {job?.progress ?? 0}%
            </>
          ) : (
            <>
              <CloudDownload className="h-4 w-4" />
              Đồng bộ ngay
            </>
          )}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={skipExisting}
            onChange={(e) => setSkipExisting(e.target.checked)}
            disabled={running}
            className="h-4 w-4 rounded border-border"
          />
          Bỏ qua file đã tồn tại (theo nội dung)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={reindexRag}
            onChange={(e) => setReindexRag(e.target.checked)}
            disabled={running}
            className="h-4 w-4 rounded border-border"
          />
          Index lại RAG (cho chatbot)
        </label>
      </div>

      {startMut.isError && (
        <p className="mt-3 text-sm text-danger">
          Không khởi chạy được: {(startMut.error as Error).message}
        </p>
      )}

      {/* Tiến độ */}
      {job && (
        <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{STATUS_LABEL[job.status]}</span>
            <span className="text-muted-foreground">
              {job.processed}/{job.total_files || "?"}
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border">
            <div
              className={
                job.status === "failed"
                  ? "h-full bg-danger transition-all"
                  : "h-full bg-primary transition-all"
              }
              style={{ width: `${job.progress}%` }}
            />
          </div>
          {job.current_file && running && (
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {job.current_file}
            </p>
          )}

          {job.status === "completed" && (
            <ul className="mt-3 space-y-0.5 text-sm">
              <li>✅ {job.uploaded} file mới đã thêm</li>
              <li>↩️ {job.skipped} file bỏ qua (đã tồn tại)</li>
              {job.failed > 0 && <li>⚠️ {job.failed} file lỗi/không hỗ trợ</li>}
              {job.result && (
                <li>📚 {job.result.rag_chunks_added} đoạn (chunks) vào RAG</li>
              )}
            </ul>
          )}

          {job.status === "failed" && (
            <p className="mt-2 text-sm text-danger">{job.error}</p>
          )}
        </div>
      )}
    </Card>
  );
}
