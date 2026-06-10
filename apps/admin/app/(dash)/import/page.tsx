"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  FileSpreadsheet,
  Link2,
  Settings,
  Sheet,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import {
  ApiError,
  getImportWorkspaceStatus,
  parseImportFile,
  parseImportGoogleSheet,
} from "@/lib/api";
import type { ImportParsePreview } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { ImportMappingPanel } from "@/components/import/ImportMappingPanel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";

type TabKey = "google_sheet" | "file_upload";

export default function ImportPage() {
  const [tab, setTab] = useState<TabKey>("google_sheet");

  return (
    <div>
      <PageHeader
        title="Nhập dữ liệu khách hàng"
        description="Nhập khách hàng hàng loạt từ Google Trang tính hoặc file CSV/XLSX — xem trước, ghép cột rồi nhập."
      />

      <div className="mb-5">
        <Tabs
          tabs={[
            {
              key: "google_sheet",
              label: "Google Trang tính",
              icon: <Sheet className="h-4 w-4" />,
            },
            {
              key: "file_upload",
              label: "Tải file",
              icon: <FileSpreadsheet className="h-4 w-4" />,
            },
          ]}
          value={tab}
          onChange={(k) => setTab(k as TabKey)}
        />
      </div>

      {tab === "google_sheet" ? <GoogleSheetTab /> : <FileTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Google Trang tính
// ---------------------------------------------------------------------------

function GoogleSheetTab() {
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetName, setSheetName] = useState<string>("");
  const [preview, setPreview] = useState<ImportParsePreview | null>(null);
  const [scopeError, setScopeError] = useState(false);

  const statusQ = useQuery({
    queryKey: ["import-workspace-status"],
    queryFn: getImportWorkspaceStatus,
  });

  const parseMut = useMutation({
    mutationFn: (name?: string) =>
      parseImportGoogleSheet({
        sheet_url: sheetUrl.trim(),
        sheet_name: name ?? sheetName ?? null,
      }),
    onSuccess: (res) => {
      setPreview(res);
      setScopeError(false);
      // Đồng bộ tab đang chọn (lần parse đầu mặc định tab đầu tiên).
      if (!sheetName && res.sheet_names?.length) setSheetName(res.sheet_names[0]);
    },
    onError: (e) => {
      setPreview(null);
      setScopeError(e instanceof ApiError && (e.status === 403 || e.status === 409));
    },
  });

  const sheetsReady = statusQ.data?.sheets_ready ?? true;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Dán link Google Trang tính
          </CardTitle>
          <CardDescription>
            Dán link Sheet (đặt quyền “Bất kỳ ai có liên kết → Người xem” hoặc đã
            chia sẻ cho tài khoản Workspace đã kết nối).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
            />
            <Button
              onClick={() => {
                setSheetName("");
                parseMut.mutate(undefined);
              }}
              disabled={parseMut.isPending || !sheetUrl.trim()}
              className="shrink-0"
            >
              {parseMut.isPending ? "Đang đọc…" : "Đọc trang tính"}
            </Button>
          </div>

          {/* Cảnh báo chưa kết nối / thiếu scope (từ workspace-status) */}
          {statusQ.data && !sheetsReady && (
            <WorkspaceScopeNotice />
          )}

          {/* Lỗi 403/409 khi parse (thiếu scope / chưa connect) */}
          {scopeError && <WorkspaceScopeNotice error={parseMut.error as Error} />}

          {/* Lỗi khác */}
          {parseMut.isError && !scopeError && (
            <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{(parseMut.error as Error)?.message ?? "Lỗi đọc trang tính."}</span>
            </div>
          )}

          {/* Chọn tab trong workbook */}
          {preview?.sheet_names && preview.sheet_names.length > 0 && (
            <div className="space-y-1.5 sm:max-w-xs">
              <Label>Tab (sheet) trong workbook</Label>
              <Select
                value={sheetName}
                onChange={(e) => {
                  const name = e.target.value;
                  setSheetName(name);
                  parseMut.mutate(name);
                }}
                disabled={parseMut.isPending}
              >
                {preview.sheet_names.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardContent className="pt-5">
            <ImportMappingPanel
              key={`gs-${sheetName}`}
              preview={preview}
              source="google_sheet"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WorkspaceScopeNotice({ error }: { error?: Error }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
      <Settings className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div>
        <p className="font-medium">Chưa đủ quyền đọc Google Trang tính.</p>
        <p className="mt-0.5 text-muted-foreground">
          {error?.message ??
            "Tài khoản Google Workspace chưa kết nối hoặc thiếu quyền Sheets."}{" "}
          Vào{" "}
          <Link href="/settings" className="font-medium text-primary underline">
            Tích hợp → Kết nối Google Workspace
          </Link>{" "}
          để cấp lại quyền rồi thử lại.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Tải file CSV/XLSX
// ---------------------------------------------------------------------------

function FileTab() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<ImportParsePreview | null>(null);

  const parseMut = useMutation({
    mutationFn: (file: File) => parseImportFile(file),
    onSuccess: (res) => setPreview(res),
    onError: () => setPreview(null),
  });

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    parseMut.mutate(file);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Tải lên file CSV / XLSX
          </CardTitle>
          <CardDescription>
            Hỗ trợ file .csv, .xlsx (tối đa 10MB). Dòng đầu là tiêu đề cột.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={onPick}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={parseMut.isPending}
            >
              <Upload className="h-4 w-4" />
              Chọn file
            </Button>
            <span className="text-sm text-muted-foreground">
              {parseMut.isPending
                ? "Đang đọc file…"
                : fileName || "Chưa chọn file nào."}
            </span>
          </div>

          {parseMut.isError && (
            <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{(parseMut.error as Error)?.message ?? "Không đọc được file."}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardContent className="pt-5">
            <ImportMappingPanel
              key={`file-${fileName}`}
              preview={preview}
              source="file_upload"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
