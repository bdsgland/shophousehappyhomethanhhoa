"use client";

import { useMutation } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";
import { useState } from "react";

import { aiEditProjectSection } from "@/lib/api";
import type { AIEditOut, ProjectSection } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

/**
 * Hộp "Sửa bằng AI" cho 1 section.
 * - Gửi yêu cầu + nội dung hiện tại → backend đề xuất (POST /ai-edit).
 * - CHỈ hiển thị đề xuất; admin bấm "Áp dụng" thì set vào ô soạn (CHƯA lưu),
 *   rồi tự bấm "Lưu" ở editor mới ghi. Đúng yêu cầu an toàn.
 */
export function AiEditBox<T>({
  slug,
  section,
  current,
  onApply,
}: {
  slug: string;
  section: ProjectSection;
  current: T;
  onApply: (suggestion: T) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<AIEditOut | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      aiEditProjectSection(slug, section, instruction, current),
    onSuccess: (res) => setPreview(res),
  });

  function applyAI() {
    if (preview?.suggestion) onApply(preview.suggestion as T);
    setPreview(null);
  }

  return (
    <Card className="space-y-3 border-dashed bg-muted/10 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" />
        Sửa bằng AI
        <span className="text-xs font-normal text-muted-foreground">
          (chỉ đề xuất — bạn tự bấm Lưu mới ghi)
        </span>
      </div>

      <Textarea
        rows={2}
        value={instruction}
        placeholder="VD: viết lại hấp dẫn hơn, tóm tắt, thêm USP, chuẩn hoá đơn vị…"
        onChange={(e) => setInstruction(e.target.value)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={mut.isPending || !instruction.trim()}
          onClick={() => mut.mutate()}
        >
          <Sparkles className="h-4 w-4" />
          {mut.isPending ? "Đang tạo đề xuất…" : "Tạo đề xuất"}
        </Button>
        {mut.isError && (
          <span className="text-sm text-danger">
            {(mut.error as Error).message || "AI lỗi — thử lại sau."}
          </span>
        )}
      </div>

      {preview && (
        <div className="space-y-2 rounded-md border border-border bg-card p-3">
          {preview.note && (
            <p className="text-xs text-muted-foreground">{preview.note}</p>
          )}
          {!preview.used_llm && (
            <p className="text-xs text-warning">
              AI chưa cấu hình (thiếu API key) — đề xuất có thể là mẫu/giữ nguyên.
            </p>
          )}
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs">
            {JSON.stringify(
              preview.suggestion ?? preview.suggestion_text,
              null,
              2,
            )}
          </pre>
          <div className="flex flex-wrap gap-2">
            {preview.suggestion && (
              <Button type="button" size="sm" onClick={applyAI}>
                <Check className="h-4 w-4" />
                Áp dụng vào ô soạn (chưa lưu)
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPreview(null)}
            >
              Bỏ qua
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
