"use client";

import { useMutation } from "@tanstack/react-query";
import { FileUp, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";

import { ApiError, uploadLearningDocument } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "policy", label: "Chính sách" },
  { value: "pricing", label: "Bảng giá" },
  { value: "contract", label: "Hợp đồng / Pháp lý" },
  { value: "brochure", label: "Tài liệu giới thiệu" },
  { value: "training", label: "Đào tạo" },
];

const MAX_SIZE = 25 * 1024 * 1024; // 25MB

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function UploadZone({ onUploaded }: { onUploaded: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("policy");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadMut = useMutation({
    mutationFn: (f: File) => uploadLearningDocument(f, title.trim(), category),
    onSuccess: () => {
      setFile(null);
      setTitle("");
      setError(null);
      if (fileRef.current) fileRef.current.value = "";
      onUploaded();
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : "Tải lên thất bại.");
    },
  });

  function pickFile(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (f.size > MAX_SIZE) {
      setError(`File vượt quá 25MB (${formatSize(f.size)}).`);
      return;
    }
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  function handleUpload() {
    setError(null);
    if (!file) {
      setError("Hãy chọn một file để tải lên.");
      return;
    }
    uploadMut.mutate(file);
  }

  return (
    <Card className="mb-4 p-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/40",
          )}
        >
          <UploadCloud className="mb-2 h-8 w-8 text-muted-foreground" />
          {file ? (
            <div className="flex items-center gap-2 text-sm">
              <FileUp className="h-4 w-4 text-primary" />
              <span className="font-medium">{file.name}</span>
              <span className="text-muted-foreground">
                ({formatSize(file.size)})
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="rounded-md p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Bỏ chọn file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Kéo-thả file vào đây hoặc <span className="text-primary">bấm để chọn</span>
              <br />
              <span className="text-xs">
                PDF, DOCX, XLSX, PNG… tối đa 25MB
              </span>
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt,.md"
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
            }}
          />
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tiêu đề (tuỳ chọn)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tên tài liệu hiển thị"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nhóm tài liệu</Label>
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <Button
            className="w-full"
            onClick={handleUpload}
            disabled={uploadMut.isPending || !file}
          >
            <UploadCloud className="h-4 w-4" />
            {uploadMut.isPending ? "Đang tải lên…" : "Tải lên"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
