"use client";

import { useMutation } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useState } from "react";

import { updateProjectSection } from "@/lib/api";
import type {
  ProjectContent,
  ProjectDoc,
  ProjectGallery360Content,
  ProjectLocationContent,
  ProjectNewsContent,
  ProjectOverviewContent,
  ProjectPolicyContent,
  ProjectSection,
  ProjectSubzonesContent,
  ProjectTimelineContent,
  ProjectTrainingContent,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { AiEditBox } from "@/components/projects/AiEditBox";
import {
  ArrayEditor,
  BoolField,
  NumberField,
  StringListField,
  TextAreaField,
  TextField,
} from "@/components/projects/fields";

/**
 * Khung chung 1 tab nội dung tự do: giữ state cục bộ, render body (render-prop),
 * kèm hộp AI (chỉ đề xuất) + nút Lưu (PATCH /sections/{section}).
 */
function SectionShell<T>({
  slug,
  section,
  value,
  onSaved,
  children,
}: {
  slug: string;
  section: ProjectSection;
  value: T;
  onSaved?: (doc: ProjectDoc) => void;
  children: (data: T, setData: (v: T) => void) => React.ReactNode;
}) {
  const [data, setData] = useState<T>(value);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => updateProjectSection(slug, section, data),
    onSuccess: (doc) => {
      setSavedAt(new Date().toLocaleTimeString("vi-VN"));
      onSaved?.(doc);
    },
  });

  return (
    <div className="space-y-5">
      {children(data, setData)}

      <AiEditBox<T>
        slug={slug}
        section={section}
        current={data}
        onApply={setData}
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          <Save className="h-4 w-4" />
          {mut.isPending ? "Đang lưu…" : "Lưu"}
        </Button>
        {mut.isError && (
          <span className="text-sm text-danger">
            {(mut.error as Error).message || "Lưu thất bại — thử lại sau."}
          </span>
        )}
        {savedAt && !mut.isPending && !mut.isError && (
          <span className="text-sm text-success">Đã lưu lúc {savedAt}.</span>
        )}
      </div>
    </div>
  );
}

/** Bộ chọn editor theo section. Parent truyền content + section. */
export function SectionEditor({
  slug,
  section,
  content,
  onSaved,
}: {
  slug: string;
  section: ProjectSection;
  content: ProjectContent;
  onSaved?: (doc: ProjectDoc) => void;
}) {
  switch (section) {
    case "overview":
      return (
        <SectionShell<ProjectOverviewContent>
          slug={slug}
          section="overview"
          value={content.overview}
          onSaved={onSaved}
        >
          {(d, set) => (
            <>
              <ArrayEditor
                label="Ảnh hero"
                items={d.hero_images}
                emptyItem={() => ({ src: "", caption: "" })}
                onChange={(hero_images) => set({ ...d, hero_images })}
                itemTitle={(it) => it.caption || it.src || "Ảnh"}
                renderItem={(it, patch) => (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField
                      label="URL ảnh (src)"
                      value={it.src}
                      onChange={(src) => patch({ src })}
                    />
                    <TextField
                      label="Chú thích"
                      value={it.caption}
                      onChange={(caption) => patch({ caption })}
                    />
                  </div>
                )}
              />
              <ArrayEditor
                label="Thông số (nhãn — giá trị)"
                items={d.rows}
                emptyItem={() => ({ label: "", value: "" })}
                onChange={(rows) => set({ ...d, rows })}
                itemTitle={(it) => it.label || "Thông số"}
                renderItem={(it, patch) => (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField
                      label="Nhãn"
                      value={it.label}
                      onChange={(label) => patch({ label })}
                    />
                    <TextField
                      label="Giá trị"
                      value={it.value}
                      onChange={(value) => patch({ value })}
                    />
                  </div>
                )}
              />
            </>
          )}
        </SectionShell>
      );

    case "location":
      return (
        <SectionShell<ProjectLocationContent>
          slug={slug}
          section="location"
          value={content.location}
          onSaved={onSaved}
        >
          {(d, set) => (
            <>
              <TextAreaField
                label="Mô tả vị trí"
                value={d.description}
                rows={5}
                onChange={(description) => set({ ...d, description })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  label="Vĩ độ (map_lat)"
                  value={d.map_lat}
                  onChange={(map_lat) => set({ ...d, map_lat })}
                />
                <NumberField
                  label="Kinh độ (map_lng)"
                  value={d.map_lng}
                  onChange={(map_lng) => set({ ...d, map_lng })}
                />
              </div>
              <ArrayEditor
                label="Kết nối (địa điểm — thời gian)"
                items={d.connections}
                emptyItem={() => ({ place: "", time: "" })}
                onChange={(connections) => set({ ...d, connections })}
                itemTitle={(it) => it.place || "Kết nối"}
                renderItem={(it, patch) => (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField
                      label="Địa điểm"
                      value={it.place}
                      onChange={(place) => patch({ place })}
                    />
                    <TextField
                      label="Thời gian"
                      value={it.time}
                      onChange={(time) => patch({ time })}
                    />
                  </div>
                )}
              />
            </>
          )}
        </SectionShell>
      );

    case "training":
      return (
        <SectionShell<ProjectTrainingContent>
          slug={slug}
          section="training"
          value={content.training}
          onSaved={onSaved}
        >
          {(d, set) => (
            <ArrayEditor
              label="Tài liệu đào tạo"
              items={d.items}
              emptyItem={() => ({
                title: "",
                size: "",
                date: "",
                href: "",
                ready: false,
              })}
              onChange={(items) => set({ ...d, items })}
              itemTitle={(it) => it.title || "Tài liệu"}
              renderItem={(it, patch) => (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Tiêu đề"
                    value={it.title}
                    onChange={(title) => patch({ title })}
                  />
                  <TextField
                    label="Dung lượng"
                    value={it.size}
                    onChange={(size) => patch({ size })}
                  />
                  <TextField
                    label="Ngày"
                    value={it.date}
                    onChange={(date) => patch({ date })}
                  />
                  <TextField
                    label="Liên kết (href)"
                    value={it.href}
                    onChange={(href) => patch({ href })}
                  />
                  <BoolField
                    label="Sẵn sàng"
                    value={it.ready}
                    onChange={(ready) => patch({ ready })}
                  />
                </div>
              )}
            />
          )}
        </SectionShell>
      );

    case "subzones":
      return (
        <SectionShell<ProjectSubzonesContent>
          slug={slug}
          section="subzones"
          value={content.subzones}
          onSaved={onSaved}
        >
          {(d, set) => (
            <ArrayEditor
              label="Phân khu"
              items={d.items}
              emptyItem={() => ({
                name: "",
                style: "",
                units: "",
                desc: "",
                img: "",
              })}
              onChange={(items) => set({ ...d, items })}
              itemTitle={(it) => it.name || "Phân khu"}
              renderItem={(it, patch) => (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Tên"
                    value={it.name}
                    onChange={(name) => patch({ name })}
                  />
                  <TextField
                    label="Phong cách"
                    value={it.style}
                    onChange={(style) => patch({ style })}
                  />
                  <TextField
                    label="Số căn"
                    value={it.units}
                    onChange={(units) => patch({ units })}
                  />
                  <TextField
                    label="URL ảnh"
                    value={it.img}
                    onChange={(img) => patch({ img })}
                  />
                  <div className="sm:col-span-2">
                    <TextAreaField
                      label="Mô tả"
                      value={it.desc}
                      onChange={(desc) => patch({ desc })}
                    />
                  </div>
                </div>
              )}
            />
          )}
        </SectionShell>
      );

    case "gallery360":
      return (
        <SectionShell<ProjectGallery360Content>
          slug={slug}
          section="gallery360"
          value={content.gallery360}
          onSaved={onSaved}
        >
          {(d, set) => (
            <ArrayEditor
              label="Tour ảnh 360°"
              items={d.items}
              emptyItem={() => ({ title: "", img: "", ready: false })}
              onChange={(items) => set({ ...d, items })}
              itemTitle={(it) => it.title || "Tour 360°"}
              renderItem={(it, patch) => (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Tiêu đề"
                    value={it.title}
                    onChange={(title) => patch({ title })}
                  />
                  <TextField
                    label="URL ảnh"
                    value={it.img}
                    onChange={(img) => patch({ img })}
                  />
                  <BoolField
                    label="Sẵn sàng"
                    value={it.ready}
                    onChange={(ready) => patch({ ready })}
                  />
                </div>
              )}
            />
          )}
        </SectionShell>
      );

    case "policy":
      return (
        <SectionShell<ProjectPolicyContent>
          slug={slug}
          section="policy"
          value={content.policy}
          onSaved={onSaved}
        >
          {(d, set) => (
            <>
              <ArrayEditor
                label="Chính sách (thẻ)"
                items={d.policies}
                emptyItem={() => ({
                  title: "",
                  date: "",
                  open: false,
                  summary: "",
                  highlights: [],
                })}
                onChange={(policies) => set({ ...d, policies })}
                itemTitle={(it) => it.title || "Chính sách"}
                renderItem={(it, patch) => (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField
                        label="Tiêu đề"
                        value={it.title}
                        onChange={(title) => patch({ title })}
                      />
                      <TextField
                        label="Ngày"
                        value={it.date}
                        onChange={(date) => patch({ date })}
                      />
                    </div>
                    <TextAreaField
                      label="Tóm tắt"
                      value={it.summary}
                      onChange={(summary) => patch({ summary })}
                    />
                    <StringListField
                      label="Điểm nổi bật"
                      values={it.highlights}
                      onChange={(highlights) => patch({ highlights })}
                    />
                    <BoolField
                      label="Mở (hiển thị mặc định)"
                      value={it.open}
                      onChange={(open) => patch({ open })}
                    />
                  </div>
                )}
              />
              <ArrayEditor
                label="Bảng giá"
                items={d.price_table}
                emptyItem={() => ({ product: "", area: "", from: "" })}
                onChange={(price_table) => set({ ...d, price_table })}
                itemTitle={(it) => it.product || "Sản phẩm"}
                renderItem={(it, patch) => (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <TextField
                      label="Sản phẩm"
                      value={it.product}
                      onChange={(product) => patch({ product })}
                    />
                    <TextField
                      label="Diện tích"
                      value={it.area}
                      onChange={(area) => patch({ area })}
                    />
                    <TextField
                      label="Giá từ"
                      value={it.from}
                      onChange={(from) => patch({ from })}
                    />
                  </div>
                )}
              />
              <TextAreaField
                label="Ghi chú hoa hồng"
                value={d.commission_note}
                onChange={(commission_note) => set({ ...d, commission_note })}
              />
            </>
          )}
        </SectionShell>
      );

    case "timeline":
      return (
        <SectionShell<ProjectTimelineContent>
          slug={slug}
          section="timeline"
          value={content.timeline}
          onSaved={onSaved}
        >
          {(d, set) => (
            <ArrayEditor
              label="Tiến độ"
              items={d.items}
              emptyItem={() => ({ period: "", title: "", desc: "", img: "" })}
              onChange={(items) => set({ ...d, items })}
              itemTitle={(it) => it.title || it.period || "Mốc"}
              renderItem={(it, patch) => (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Giai đoạn"
                    value={it.period}
                    onChange={(period) => patch({ period })}
                  />
                  <TextField
                    label="Tiêu đề"
                    value={it.title}
                    onChange={(title) => patch({ title })}
                  />
                  <TextField
                    label="URL ảnh"
                    value={it.img}
                    onChange={(img) => patch({ img })}
                  />
                  <div className="sm:col-span-2">
                    <TextAreaField
                      label="Mô tả"
                      value={it.desc}
                      onChange={(desc) => patch({ desc })}
                    />
                  </div>
                </div>
              )}
            />
          )}
        </SectionShell>
      );

    case "news":
      return (
        <SectionShell<ProjectNewsContent>
          slug={slug}
          section="news"
          value={content.news}
          onSaved={onSaved}
        >
          {(d, set) => (
            <ArrayEditor
              label="Tin tức"
              items={d.items}
              emptyItem={() => ({
                title: "",
                date: "",
                excerpt: "",
                img: "",
                url: "",
              })}
              onChange={(items) => set({ ...d, items })}
              itemTitle={(it) => it.title || "Tin"}
              renderItem={(it, patch) => (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Tiêu đề"
                    value={it.title}
                    onChange={(title) => patch({ title })}
                  />
                  <TextField
                    label="Ngày"
                    value={it.date}
                    onChange={(date) => patch({ date })}
                  />
                  <TextField
                    label="URL ảnh"
                    value={it.img}
                    onChange={(img) => patch({ img })}
                  />
                  <TextField
                    label="Liên kết (url)"
                    value={it.url}
                    onChange={(url) => patch({ url })}
                  />
                  <div className="sm:col-span-2">
                    <TextAreaField
                      label="Trích đoạn"
                      value={it.excerpt}
                      onChange={(excerpt) => patch({ excerpt })}
                    />
                  </div>
                </div>
              )}
            />
          )}
        </SectionShell>
      );

    default:
      return null;
  }
}
