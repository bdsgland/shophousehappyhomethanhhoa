"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  Globe,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  aiGenerateArticle,
  aiOptimizeSeo,
  createNews,
  deleteNews,
  getNews,
  getSeoSettings,
  listNews,
  publishNews,
  unpublishNews,
  updateNews,
  updateSeoSettings,
} from "@/lib/api";
import type {
  AIGenerateArticlePayload,
  ArticleSEO,
  NewsArticle,
  NewsListItem,
  NewsStatus,
  SeoSettings,
  SeoSettingsUpdate,
} from "@/lib/types";
import { API_URL } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { shortDate } from "@/lib/utils";

const STATUS_LABEL: Record<NewsStatus, string> = {
  draft: "Nháp",
  published: "Đã xuất bản",
};

const STATUS_VARIANT: Record<NewsStatus, "success" | "warning"> = {
  draft: "warning",
  published: "success",
};

type TabKey = "news" | "seo";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "news", label: "Tin tức", icon: <Newspaper className="h-4 w-4" /> },
  { key: "seo", label: "SEO", icon: <Globe className="h-4 w-4" /> },
];

export default function SeoNewsPage() {
  const [tab, setTab] = useState<TabKey>("news");
  const qc = useQueryClient();

  return (
    <div>
      <PageHeader
        title="SEO & Tin tức"
        description="Quản lý bài tin tức/blog (đồng bộ toàn hệ thống) + cấu hình SEO website bằng AI."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              qc.invalidateQueries({
                predicate: (q) =>
                  ["admin-news", "seo-settings"].includes(String(q.queryKey[0])),
              })
            }
          >
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </Button>
        }
      />

      <Tabs tabs={TABS} value={tab} onChange={(k) => setTab(k as TabKey)} className="mb-6" />

      {tab === "news" ? <NewsTab /> : <SeoTab />}
    </div>
  );
}

// ===========================================================================
// Helper field
// ===========================================================================

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function parseTags(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ===========================================================================
// TAB TIN TỨC
// ===========================================================================

function NewsTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const listQ = useQuery({
    queryKey: ["admin-news", statusFilter],
    queryFn: () =>
      listNews({ status: statusFilter || undefined, page_size: 100 }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteNews(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-news"] }),
  });

  const pubMut = useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
      publish ? publishNews(id) : unpublishNews(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-news"] }),
  });

  const rows = listQ.data?.items ?? [];

  function openCreate() {
    setEditingId(null);
    setEditorOpen(true);
  }

  function openEdit(item: NewsListItem) {
    setEditingId(item.id);
    setEditorOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="w-40">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            <option value="published">Đã xuất bản</option>
            <option value="draft">Nháp</option>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAiOpen(true)}>
            <Wand2 className="h-4 w-4" />
            Viết bằng AI
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Tạo bài
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Tiêu đề</th>
                <th className="px-4 py-3 font-medium">Danh mục</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Cập nhật</th>
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-4 py-3" colSpan={5}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-muted-foreground" colSpan={5}>
                    Chưa có bài viết nào. Bấm “Tạo bài” hoặc “Viết bằng AI”.
                  </td>
                </tr>
              ) : (
                rows.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.title || "(chưa có tiêu đề)"}</div>
                      <div className="font-mono text-xs text-muted-foreground">/{item.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.category || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[item.status]}>
                        {STATUS_LABEL[item.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.updated_at ? shortDate(item.updated_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title={item.status === "published" ? "Gỡ xuất bản" : "Xuất bản"}
                          disabled={pubMut.isPending}
                          onClick={() =>
                            pubMut.mutate({
                              id: item.id,
                              publish: item.status !== "published",
                            })
                          }
                        >
                          {item.status === "published" ? "Gỡ" : "Xuất bản"}
                        </Button>
                        <Button variant="ghost" size="icon" title="Sửa" onClick={() => openEdit(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Xoá"
                          onClick={() => {
                            if (window.confirm(`Xoá bài "${item.title}"?`)) delMut.mutate(item.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editorOpen ? (
        <ArticleEditor
          articleId={editingId}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setEditorOpen(false);
            qc.invalidateQueries({ queryKey: ["admin-news"] });
          }}
        />
      ) : null}

      {aiOpen ? (
        <AiWriteDialog
          onClose={() => setAiOpen(false)}
          onUse={() => {
            setAiOpen(false);
            qc.invalidateQueries({ queryKey: ["admin-news"] });
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor 1 bài (tạo / sửa) — có nút Tối ưu SEO + Preview
// ---------------------------------------------------------------------------

type ArticleForm = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image: string;
  tags: string;
  category: string;
  project_slug: string;
  status: NewsStatus;
  meta_title: string;
  meta_description: string;
  keywords: string;
  og_image: string;
};

const EMPTY_ARTICLE: ArticleForm = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  cover_image: "",
  tags: "",
  category: "",
  project_slug: "",
  status: "draft",
  meta_title: "",
  meta_description: "",
  keywords: "",
  og_image: "",
};

function articleToForm(a: NewsArticle): ArticleForm {
  return {
    title: a.title,
    slug: a.slug,
    excerpt: a.excerpt,
    content: a.content,
    cover_image: a.cover_image,
    tags: (a.tags ?? []).join(", "),
    category: a.category,
    project_slug: a.project_slug ?? "",
    status: a.status,
    meta_title: a.seo?.meta_title ?? "",
    meta_description: a.seo?.meta_description ?? "",
    keywords: (a.seo?.keywords ?? []).join(", "),
    og_image: a.seo?.og_image ?? "",
  };
}

function ArticleEditor({
  articleId,
  onClose,
  onSaved,
}: {
  articleId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ArticleForm>(EMPTY_ARTICLE);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const detailQ = useQuery({
    queryKey: ["admin-news-detail", articleId],
    queryFn: () => getNews(articleId as string),
    enabled: Boolean(articleId),
  });

  useEffect(() => {
    if (detailQ.data) setForm(articleToForm(detailQ.data));
  }, [detailQ.data]);

  const optimizeMut = useMutation({
    mutationFn: () =>
      aiOptimizeSeo({
        title: form.title,
        excerpt: form.excerpt,
        content: form.content,
        keywords: parseTags(form.keywords),
      }),
    onSuccess: (res) => {
      setForm((f) => ({
        ...f,
        meta_title: res.seo.meta_title || f.meta_title,
        meta_description: res.seo.meta_description || f.meta_description,
        keywords: (res.seo.keywords ?? []).join(", ") || f.keywords,
        og_image: res.seo.og_image || f.og_image,
      }));
    },
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const seo: ArticleSEO = {
        meta_title: form.meta_title.trim(),
        meta_description: form.meta_description.trim(),
        keywords: parseTags(form.keywords),
        og_image: form.og_image.trim(),
      };
      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim() || undefined,
        excerpt: form.excerpt.trim(),
        content: form.content,
        cover_image: form.cover_image.trim(),
        tags: parseTags(form.tags),
        category: form.category.trim(),
        project_slug: form.project_slug.trim(),
        status: form.status,
        seo,
      };
      if (articleId) return updateNews(articleId, payload);
      return createNews(payload);
    },
    onSuccess: onSaved,
    onError: (e) => setError((e as Error).message),
  });

  const loading = Boolean(articleId) && detailQ.isLoading;

  return (
    <Dialog open onClose={onClose} className="max-w-3xl">
      <DialogHeader
        title={articleId ? "Sửa bài viết" : "Tạo bài viết"}
        onClose={onClose}
      />
      <DialogBody>
        {error ? (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</div>
        ) : null}

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <Field label="Tiêu đề">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="VD: Happy Home Thanh Hóa cập nhật tiến độ tháng 6"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Slug" hint="Để trống → tự sinh từ tiêu đề">
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="vd: cap-nhat-tien-do-thang-6"
                />
              </Field>
              <Field label="Danh mục">
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="VD: Tin dự án"
                />
              </Field>
            </div>
            <Field label="Tóm tắt (excerpt)">
              <Textarea
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                placeholder="1-2 câu mô tả ngắn (hiển thị ở danh sách + meta description)."
              />
            </Field>
            <Field label="Nội dung (Markdown / HTML)">
              {showPreview ? (
                <div className="prose-sm max-h-[320px] min-h-[160px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3 text-sm">
                  {form.content || "(chưa có nội dung)"}
                </div>
              ) : (
                <Textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  className="min-h-[200px]"
                  placeholder="Nội dung bài viết (hỗ trợ Markdown)…"
                />
              )}
            </Field>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowPreview((p) => !p)}>
                <Eye className="h-4 w-4" />
                {showPreview ? "Sửa nội dung" : "Xem trước"}
              </Button>
            </div>
            <Field
              label="Gắn dự án (slug)"
              hint="Để trống = tin chung (hiển thị mọi trang). Nhập slug dự án để bài chỉ vào tab Tin tức của dự án đó."
            >
              <Input
                value={form.project_slug}
                onChange={(e) => setForm({ ...form, project_slug: e.target.value })}
                placeholder="vd: happy-home-thanh-hoa"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ảnh bìa (URL)">
                <Input
                  value={form.cover_image}
                  onChange={(e) => setForm({ ...form, cover_image: e.target.value })}
                  placeholder="https://…"
                />
              </Field>
              <Field label="Trạng thái">
                <Select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as NewsStatus })}
                >
                  <option value="draft">Nháp</option>
                  <option value="published">Đã xuất bản</option>
                </Select>
              </Field>
            </div>
            <Field label="Thẻ (tags)" hint="Phân tách bằng dấu phẩy">
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="bất động sản, tiến độ, Thanh Hoá"
              />
            </Field>

            {/* ===== SEO ===== */}
            <div className="rounded-md border border-border p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Thẻ SEO
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => optimizeMut.mutate()}
                  disabled={optimizeMut.isPending}
                >
                  <Wand2 className={optimizeMut.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
                  {optimizeMut.isPending ? "Đang tối ưu…" : "Tối ưu SEO bằng AI"}
                </Button>
              </div>
              {optimizeMut.data?.message ? (
                <Badge variant="muted">{optimizeMut.data.message}</Badge>
              ) : null}
              {optimizeMut.data && optimizeMut.data.suggestions.length > 0 ? (
                <ul className="my-2 list-inside list-disc text-xs text-muted-foreground">
                  {optimizeMut.data.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              ) : null}
              <div className="space-y-3">
                <Field label="Meta title" hint={`${form.meta_title.length}/60 ký tự`}>
                  <Input
                    value={form.meta_title}
                    onChange={(e) => setForm({ ...form, meta_title: e.target.value })}
                  />
                </Field>
                <Field label="Meta description" hint={`${form.meta_description.length}/160 ký tự`}>
                  <Textarea
                    value={form.meta_description}
                    onChange={(e) => setForm({ ...form, meta_description: e.target.value })}
                  />
                </Field>
                <Field label="Keywords" hint="Phân tách bằng dấu phẩy">
                  <Input
                    value={form.keywords}
                    onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  />
                </Field>
                <Field label="OG image (URL)">
                  <Input
                    value={form.og_image}
                    onChange={(e) => setForm({ ...form, og_image: e.target.value })}
                    placeholder="Ảnh chia sẻ mạng xã hội (mặc định = ảnh bìa)"
                  />
                </Field>
              </div>
            </div>
          </>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Huỷ
        </Button>
        <Button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || loading || !form.title.trim()}
        >
          {saveMut.isPending ? "Đang lưu…" : "Lưu bài"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Dialog "Viết bằng AI" — nhập chủ đề/từ khoá → AI sinh bài → tạo nháp
// ---------------------------------------------------------------------------

function AiWriteDialog({
  onClose,
  onUse,
}: {
  onClose: () => void;
  onUse: (article: NewsArticle) => void;
}) {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("chuyên nghiệp, gần gũi");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [category, setCategory] = useState("");
  const [keywords, setKeywords] = useState("");

  const genMut = useMutation({
    mutationFn: () => {
      const payload: AIGenerateArticlePayload = {
        topic: topic.trim(),
        tone: tone.trim() || undefined,
        length,
        category: category.trim() || undefined,
        keywords: parseTags(keywords),
      };
      return aiGenerateArticle(payload);
    },
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const res = genMut.data!;
      return createNews({
        title: res.title,
        slug: res.slug || undefined,
        excerpt: res.excerpt,
        content: res.content,
        tags: res.tags,
        category: res.category,
        seo: res.seo,
        status: "draft",
      });
    },
    onSuccess: (a) => onUse(a),
  });

  const result = genMut.data;

  return (
    <Dialog open onClose={onClose} className="max-w-2xl">
      <DialogHeader
        title="Viết bài bằng AI"
        description="Nhập chủ đề/từ khoá, Claude sẽ soạn bài + thẻ SEO. Bài lưu ở dạng NHÁP."
        onClose={onClose}
      />
      <DialogBody>
        <Field label="Chủ đề / từ khoá chính">
          <Textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="VD: Tiềm năng đầu tư căn hộ Happy Home Thanh Hóa Thanh Hoá"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Độ dài">
            <Select value={length} onChange={(e) => setLength(e.target.value as typeof length)}>
              <option value="short">Ngắn</option>
              <option value="medium">Vừa</option>
              <option value="long">Chi tiết</option>
            </Select>
          </Field>
          <Field label="Danh mục">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Tin dự án" />
          </Field>
          <Field label="Tông giọng">
            <Input value={tone} onChange={(e) => setTone(e.target.value)} />
          </Field>
        </div>
        <Field label="Từ khoá SEO mục tiêu (tuỳ chọn)" hint="Phân tách bằng dấu phẩy">
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="căn hộ thanh hoá, happy home thanh hoa"
          />
        </Field>

        <Button
          onClick={() => genMut.mutate()}
          disabled={genMut.isPending || topic.trim().length < 3}
          className="w-full"
        >
          <Sparkles className={genMut.isPending ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
          {genMut.isPending ? "Đang viết bài…" : "Viết bài bằng AI"}
        </Button>

        {genMut.isError ? (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            Lỗi: {(genMut.error as Error).message}
          </div>
        ) : null}

        {result ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            {result.message ? (
              <Badge variant="muted">{result.message}</Badge>
            ) : (
              <Badge variant="success">Soạn bởi AI Claude</Badge>
            )}
            <h3 className="text-base font-semibold">{result.title}</h3>
            <p className="text-sm text-muted-foreground">{result.excerpt}</p>
            <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/20 p-2 text-xs">
              {result.content}
            </div>
            {result.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {result.tags.map((t) => (
                  <Badge key={t} variant="muted">
                    {t}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Đóng
        </Button>
        <Button
          onClick={() => saveMut.mutate()}
          disabled={!result || saveMut.isPending}
        >
          {saveMut.isPending ? "Đang lưu…" : "Lưu thành bài nháp"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ===========================================================================
// TAB SEO — cấu hình site-wide + per-page + trạng thái sitemap
// ===========================================================================

type SeoForm = {
  site_name: string;
  title_template: string;
  default_title: string;
  default_description: string;
  default_keywords: string;
  default_og_image: string;
  base_url: string;
  twitter_handle: string;
  robots: string;
};

function seoToForm(s: SeoSettings): SeoForm {
  return {
    site_name: s.site_name,
    title_template: s.title_template,
    default_title: s.default_title,
    default_description: s.default_description,
    default_keywords: (s.default_keywords ?? []).join(", "),
    default_og_image: s.default_og_image,
    base_url: s.base_url,
    twitter_handle: s.twitter_handle,
    robots: s.robots,
  };
}

const PAGE_KEYS: { key: string; label: string }[] = [
  { key: "home", label: "Trang chủ" },
  { key: "news", label: "Tin tức" },
  { key: "project", label: "Trang dự án" },
];

function SeoTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<SeoForm | null>(null);
  const [pages, setPages] = useState<SeoSettings["pages"]>({});
  const [saved, setSaved] = useState(false);

  const settingsQ = useQuery({ queryKey: ["seo-settings"], queryFn: getSeoSettings });

  useEffect(() => {
    if (settingsQ.data) {
      setForm(seoToForm(settingsQ.data));
      setPages(settingsQ.data.pages ?? {});
    }
  }, [settingsQ.data]);

  const saveMut = useMutation({
    mutationFn: () => {
      const f = form as SeoForm;
      const payload: SeoSettingsUpdate = {
        site_name: f.site_name.trim(),
        title_template: f.title_template.trim(),
        default_title: f.default_title.trim(),
        default_description: f.default_description.trim(),
        default_keywords: parseTags(f.default_keywords),
        default_og_image: f.default_og_image.trim(),
        base_url: f.base_url.trim(),
        twitter_handle: f.twitter_handle.trim(),
        robots: f.robots.trim(),
        pages,
      };
      return updateSeoSettings(payload);
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      qc.invalidateQueries({ queryKey: ["seo-settings"] });
    },
  });

  function setPageField(key: string, field: keyof SeoSettings["pages"][string], value: string) {
    setPages((prev) => {
      const cur = prev[key] ?? { title: "", description: "", keywords: [], og_image: "" };
      const next = { ...cur };
      if (field === "keywords") next.keywords = parseTags(value);
      else (next as Record<string, unknown>)[field] = value;
      return { ...prev, [key]: next };
    });
  }

  if (settingsQ.isLoading || !form) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const sitemapUrl = `${API_URL.replace(/\/$/, "")}`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Meta mặc định toàn site</CardTitle>
          <CardDescription>
            Áp cho mọi trang chính (web tự đọc qua API công khai). Trang con có thể override bên dưới.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tên site">
              <Input
                value={form.site_name}
                onChange={(e) => setForm({ ...form, site_name: e.target.value })}
              />
            </Field>
            <Field label="Title template" hint="%s = tiêu đề trang">
              <Input
                value={form.title_template}
                onChange={(e) => setForm({ ...form, title_template: e.target.value })}
                placeholder="%s | Happy Home Thanh Hóa"
              />
            </Field>
          </div>
          <Field label="Tiêu đề mặc định">
            <Input
              value={form.default_title}
              onChange={(e) => setForm({ ...form, default_title: e.target.value })}
            />
          </Field>
          <Field label="Mô tả mặc định">
            <Textarea
              value={form.default_description}
              onChange={(e) => setForm({ ...form, default_description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Keywords mặc định" hint="Phân tách bằng dấu phẩy">
              <Input
                value={form.default_keywords}
                onChange={(e) => setForm({ ...form, default_keywords: e.target.value })}
              />
            </Field>
            <Field label="Robots">
              <Select value={form.robots} onChange={(e) => setForm({ ...form, robots: e.target.value })}>
                <option value="index, follow">index, follow</option>
                <option value="noindex, follow">noindex, follow</option>
                <option value="index, nofollow">index, nofollow</option>
                <option value="noindex, nofollow">noindex, nofollow</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Base URL" hint="Dùng cho canonical + sitemap">
              <Input
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                placeholder="https://happyhomethanhhoa.bdsg.land"
              />
            </Field>
            <Field label="Twitter handle">
              <Input
                value={form.twitter_handle}
                onChange={(e) => setForm({ ...form, twitter_handle: e.target.value })}
                placeholder="@happyhome"
              />
            </Field>
          </div>
          <Field label="OG image mặc định (URL)">
            <Input
              value={form.default_og_image}
              onChange={(e) => setForm({ ...form, default_og_image: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Override theo trang</CardTitle>
          <CardDescription>Tuỳ biến meta cho từng trang chính (để trống = dùng mặc định).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {PAGE_KEYS.map((pk) => {
            const ov = pages[pk.key] ?? { title: "", description: "", keywords: [], og_image: "" };
            return (
              <div key={pk.key} className="rounded-md border border-border p-3">
                <div className="mb-2 text-sm font-semibold">{pk.label}</div>
                <div className="space-y-3">
                  <Field label="Tiêu đề">
                    <Input
                      value={ov.title}
                      onChange={(e) => setPageField(pk.key, "title", e.target.value)}
                    />
                  </Field>
                  <Field label="Mô tả">
                    <Textarea
                      value={ov.description}
                      onChange={(e) => setPageField(pk.key, "description", e.target.value)}
                    />
                  </Field>
                  <Field label="Keywords" hint="Phân tách bằng dấu phẩy">
                    <Input
                      value={(ov.keywords ?? []).join(", ")}
                      onChange={(e) => setPageField(pk.key, "keywords", e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Sitemap & robots
          </CardTitle>
          <CardDescription>Web tự sinh sitemap.xml + robots.txt từ tin tức + trang chính.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2 rounded-md bg-muted/30 p-2">
            <span className="text-muted-foreground">Nguồn dữ liệu bài viết (public API)</span>
            <code className="text-xs">{sitemapUrl}/news</code>
          </div>
          <p className="text-xs text-muted-foreground">
            Trên website: <code>/sitemap.xml</code> và <code>/robots.txt</code> tự liệt kê các bài đã
            xuất bản + trang chính. Đặt đúng <strong>Base URL</strong> ở trên để link tuyệt đối chuẩn.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {saved ? <span className="text-sm text-success">Đã lưu cấu hình SEO.</span> : null}
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? "Đang lưu…" : "Lưu cấu hình SEO"}
        </Button>
      </div>
    </div>
  );
}
