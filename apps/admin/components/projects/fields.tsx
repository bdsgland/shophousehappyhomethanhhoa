"use client";

import { Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/** Ô text 1 dòng có nhãn. */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Ô nhập số (cho phép rỗng → null). */
export function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
      />
    </div>
  );
}

/** Vùng văn bản nhiều dòng có nhãn. */
export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Công tắc bật/tắt có nhãn (cho field boolean như "ready"/"open"). */
export function BoolField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <Label className="cursor-default">{label}</Label>
      <Switch checked={value} onChange={onChange} />
    </div>
  );
}

/** Danh sách chuỗi (vd highlights) — mỗi dòng 1 ô + nút xoá. */
export function StringListField({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={v}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...values];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            aria-label="Xoá dòng"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...values, ""])}
      >
        <Plus className="h-4 w-4" />
        Thêm dòng
      </Button>
    </div>
  );
}

/**
 * Editor danh sách bản ghi (array of object). Render 1 thẻ cho mỗi phần tử,
 * cho phép sửa/ thêm/ xoá. `renderItem` nhận phần tử + hàm cập nhật từng field.
 */
export function ArrayEditor<T>({
  label,
  items,
  emptyItem,
  onChange,
  renderItem,
  itemTitle,
}: {
  label: string;
  items: T[];
  emptyItem: () => T;
  onChange: (items: T[]) => void;
  renderItem: (item: T, patch: (p: Partial<T>) => void) => React.ReactNode;
  itemTitle?: (item: T, index: number) => string;
}) {
  function patchAt(index: number, p: Partial<T>) {
    const next = items.map((it, i) => (i === index ? { ...it, ...p } : it));
    onChange(next);
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, emptyItem()])}
        >
          <Plus className="h-4 w-4" />
          Thêm mục
        </Button>
      </div>
      {items.length === 0 && (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Chưa có mục nào. Bấm “Thêm mục” để bắt đầu.
        </p>
      )}
      {items.map((item, i) => (
        <div
          key={i}
          className="space-y-3 rounded-md border border-border bg-muted/20 p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {itemTitle ? itemTitle(item, i) : `Mục #${i + 1}`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              aria-label="Xoá mục"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {renderItem(item, (p) => patchAt(i, p))}
        </div>
      ))}
    </div>
  );
}
