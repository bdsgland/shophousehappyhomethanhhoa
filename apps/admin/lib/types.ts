// Kiểu dữ liệu dùng chung — khớp với response của FastAPI agent-engine.

export type UserRole = "admin" | "sale" | "client";

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  role: UserRole;
  is_active: boolean;
  region?: string | null;
  referral_code?: string | null;
  upline_email?: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface DashboardKpi {
  lead_today: number;
  lead_total: number;
  users_total: number;
  users_by_role: Record<string, number>;
  orders_this_month: number;
  revenue_projection_ty: number;
  commission_rate?: number;
  inventory: {
    total: number;
    available: number;
    sold: number;
    reserved: number;
    is_demo?: boolean;
  };
  lead_trend: { date: string; count: number }[];
  top_sales: { name: string; commission_ty: number }[];
  generated_at: string;
}

export type PlatformStatus = "up" | "down";

export interface PlatformHealth {
  key: string;
  name: string;
  url: string;
  status: PlatformStatus;
  code: number | null;
  note?: string;
  error?: string;
}

export interface PlatformsHealthResponse {
  platforms: PlatformHealth[];
  checked_at: string;
}

// ---- Phase 2: Users ----

export interface ResetPasswordResult {
  user_id: string;
  temp_password: string;
}

export interface BulkImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

// ---- Phase 2: Sales & Commission ----

export interface SaleRow {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  referral_code?: string | null;
  is_active: boolean;
  downline_count: number;
  total_deals: number;
  total_commission: number;
}

export interface CommissionRow {
  deal_id: string;
  deal_amount: number;
  sale_name: string;
  tier_role: string;
  recipient: string;
  pct: number;
  commission_amount: number;
  status: "pending" | "approved" | "paid";
  approved_at?: string | null;
  paid_at?: string | null;
  saved_at?: string | null;
}

export interface ReferralNode {
  id: string;
  full_name: string;
  email: string;
  role?: string | null;
  referral_code?: string | null;
  children: ReferralNode[];
}

// ---- Phase 2: Inventory ----

export interface InventoryUnit {
  id: string;
  lo: string;
  phan_khu: string;
  loai: string;
  dien_tich: number;
  mat_tien: number;
  trang_thai: string;
  gia_tri: number;
  gia: string;
  quy?: string; // phân loại quỹ (key: exclusive|bonus|agency_f1|mid|not_open)
  // Giá chi tiết (VND) cho phiếu tính giá
  gia_ny_gom_vat_kpbt?: number; // N
  vat_hdmb?: number; // K
  kpbt?: number; // L
  gt_xay_ny?: number; // P
  position: { x: number; y: number };
  // ---- Mở rộng từ đồng bộ Google Sheets (optional, tương thích ngược) ----
  gia_min?: number; // VNĐ
  gia_max?: number; // VNĐ
  huong?: string;
  view?: string;
  duong?: string;
  vi_tri?: string;
  hinh_thuc?: string;
  dot?: string;
  notes?: string;
  source?: string;
  deleted?: boolean;
}

// ---- Đồng bộ quỹ căn từ Google Sheets ----

export interface InventorySyncResult {
  success: boolean;
  total_units: number;
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
  sheet_url: string;
  sheet_gid: number;
  synced_at: string;
  synced_by_user_id?: string | null;
  synced_by_name?: string | null;
  backup_file?: string | null;
}

export interface InventoryBackupInfo {
  timestamp: string;
  filename: string;
  size_bytes: number;
  unit_count: number;
}

// ---- Phase 2: KB ----

export interface LearningDocument {
  id: string;
  title: string;
  category: string;
  type: string;
  size: number;
  version: number;
  chunks: number;
  indexed: boolean;
  uploaded_by?: string | null;
  indexed_at?: string | null;
  download_url: string;
  group?: string | null;
  source?: string;
  project_slug?: string | null;
}

export type MilestoneKind =
  | "deposit_fixed"
  | "pct_f28"
  | "balance_100"
  | "balance_partial"
  | "five_pct_hdmb"
  | "bank_70";

export interface PolicyMilestoneCfg {
  label: string;
  kind: MilestoneKind;
  pct: number;
  days_offset?: number | null;
  deduct_deposit?: boolean;
}

export interface SalesBasePlan {
  key: string;
  label: string;
  payment_discount_pct: number;
  enabled: boolean;
  schedule: PolicyMilestoneCfg[];
}

export interface SalesPolicyAddon {
  key: string;
  label: string;
  pct: number;
  enabled: boolean;
}

export interface SalesPolicyConfig {
  base_plans: SalesBasePlan[];
  addons: SalesPolicyAddon[];
  deposit_amount: number;
  note: string;
  last_updated_by?: string | null;
  last_updated_at?: string | null;
  version: number;
}

export interface KbStats {
  total_documents: number;
  indexed_documents: number;
  total_chunks: number;
  last_indexed_at?: string | null;
  by_category: Record<string, number>;
}

// ---- Đồng bộ Google Drive ----

export interface DriveSyncFileResult {
  file_id: string;
  name: string;
  category: string;
  status: "uploaded" | "skipped" | "failed";
  error?: string | null;
  size_bytes: number;
  document_id?: string | null;
}

export interface DriveSyncResult {
  success: boolean;
  total_files: number;
  uploaded: number;
  skipped: number;
  failed: number;
  files: DriveSyncFileResult[];
  rag_chunks_added: number;
  synced_at: string;
  triggered_by_user_id?: string | null;
  duration_seconds: number;
  error?: string | null;
}

export interface DriveSyncJob {
  job_id: string;
  status:
    | "queued"
    | "listing"
    | "downloading"
    | "indexing"
    | "completed"
    | "failed";
  folder_url: string;
  total_files: number;
  processed: number;
  uploaded: number;
  skipped: number;
  failed: number;
  current_file: string;
  progress: number;
  error?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
  result?: DriveSyncResult | null;
}

export interface DriveSyncConfig {
  default_folder_url: string;
  google_configured: boolean;
}

// ---- Phase 2: Conversations ----

export interface ConversationSummary {
  id: string;
  channel: string;
  status: string;
  last_message: string;
  intent_score: number;
  is_hot: boolean;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
}

export interface ConversationDetail {
  id: string;
  channel: string;
  project_slug?: string | null;
  status: string;
  messages: ConversationMessage[];
  created_at: string;
  updated_at?: string;
  intent_score?: number;
  is_hot?: boolean;
}

export interface ChatwootConversation {
  id: number;
  contact: string;
  channel: string;
  status: string;
  last_message: string;
  assignee?: string | null;
  created_at?: number;
}

// ---- Omnichannel Inbox (Hộp thư đa kênh) ----

export interface InboxContact {
  name: string;
  phone?: string | null;
  email?: string | null;
}

export interface InboxConversation {
  id: string; // "cw:<id>" | "web:<id>"
  raw_id: number | string;
  source: "chatwoot" | "web";
  channel: string; // web | facebook | zalo | email | ...
  contact: InboxContact;
  last_message: string;
  last_at?: string | null;
  status: string;
  assignee?: string | null;
  crm_lead_id?: string | null;
  crm_lead_name?: string | null;
  is_hot?: boolean;
  intent_score?: number;
}

export interface InboxChatwootStatus {
  configured: boolean;
  error: boolean;
  detail?: string | null;
}

export interface InboxListResponse {
  conversations: InboxConversation[];
  count: number;
  chatwoot: InboxChatwootStatus;
}

export interface InboxMessage {
  role: "user" | "assistant";
  content: string;
  at?: string | null;
  sender?: string | null;
}

export interface InboxMessagesResponse {
  id: string;
  source: "chatwoot" | "web";
  configured: boolean;
  messages: InboxMessage[];
  status?: string;
  detail?: string;
}

// ---- Phase 2: Settings ----

export interface SystemConfig {
  general: {
    site_name: string;
    logo_url: string;
    contact_email: string;
    contact_phone: string;
    working_hours: string;
  };
  notifications: {
    email_on_hot_lead: boolean;
    telegram_on_hot_lead: boolean;
    notify_sale_on_assignment: boolean;
    daily_briefing: boolean;
  };
}

export interface IntegrationStatus {
  key: string;
  name: string;
  status: "connected" | "disconnected";
  detail: string;
}

export interface SettingsResponse {
  config: SystemConfig;
  integrations: IntegrationStatus[];
}

// ---- TRUNG TÂM TÍCH HỢP & KẾT NỐI ----

export interface IntegrationFieldView {
  key: string;
  label: string;
  secret: boolean;
  type: "text" | "number" | "bool";
  placeholder: string;
  present: boolean;
  masked?: string; // chỉ field secret — 4 ký tự cuối, KHÔNG full
  value?: string | number | boolean; // chỉ field non-secret
}

export interface IntegrationServiceView {
  key: string;
  name: string;
  group: string;
  managed: boolean;
  connected: boolean;
  source: "store" | "env" | "none";
  fields: IntegrationFieldView[];
  guide: string;
  guide_url: string;
  detail?: string;
}

export interface IntegrationsResponse {
  groups: { key: string; label: string }[];
  services: IntegrationServiceView[];
}

export interface IntegrationTestResult {
  service: string;
  ok: boolean;
  detail: string;
  info?: Record<string, unknown>;
}

// ---- API KEYS (khoá truy cập API/MCP toàn quyền) ----

export interface ApiKey {
  id: string;
  name: string;
  scope: string;
  prefix: string;
  masked: string;
  created_at: string;
  created_by: string | null;
  last_used_at: string | null;
  revoked: boolean;
  revoked_at: string | null;
}

export interface ApiKeysResponse {
  keys: ApiKey[];
}

// Trả về khi TẠO key — kèm `plaintext` chỉ hiện 1 lần duy nhất.
export interface ApiKeyCreated extends ApiKey {
  plaintext: string;
}

export interface AuditEvent {
  id: string;
  event_type: string;
  status: string;
  detail: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface BackupEntry {
  id: string;
  triggered_by?: string | null;
  created_at: string;
  users: number;
  status: string;
}

// ---------------------------------------------------------------------------
// Cơ chế hoa hồng (đồng bộ app/schemas/commission_config.py)
// ---------------------------------------------------------------------------

export interface CommissionTierCfg {
  role: string;
  label_vi: string;
  percentage: number;
  is_progressive: boolean;
}

export interface FrontlineKPITier {
  tier_id: number;
  name: string;
  min_monthly_volume: number;
  max_monthly_volume: number | null;
  frontline_percentage: number;
  ekip_bonus_percentage: number;
  description_vi: string;
}

export interface ReferralBonusCfg {
  enabled: boolean;
  percentage_of_commission: number;
}

export interface CommissionConfig {
  total_pool_percentage: number;
  tiers: CommissionTierCfg[];
  frontline_kpi_tiers: FrontlineKPITier[];
  referral_bonus: ReferralBonusCfg;
  last_updated_by: string | null;
  last_updated_at: string | null;
  version: number;
}

export interface CommissionRecipient {
  role: string;
  label_vi: string;
  user_id: string | null;
  percentage: number;
  amount: number;
  tier_name: string | null;
}

export interface CommissionBreakdown {
  deal_amount: number;
  total_pool: number;
  total_pool_percentage: number;
  frontline_tier_applied: string;
  frontline_tier_id: number;
  total_distributed: number;
  total_distributed_percentage: number;
  is_balanced: boolean;
  recipients: CommissionRecipient[];
  calculated_at: string;
  config_version: number;
}

export interface CommissionConfigVersion {
  version: number | null;
  last_updated_by: string | null;
  last_updated_at: string | null;
  backup_file: string | null;
  is_current: boolean;
}

// ---------------------------------------------------------------------------
// CRM khách hàng (đồng bộ app/schemas/crm.py) — master view + hiệu suất sale
// ---------------------------------------------------------------------------

export type CrmLeadSource =
  | "imported"
  | "registered"
  | "referral"
  | "fb_ads"
  | "zalo"
  | "email"
  | "manual"
  | "google_sheet"
  | "file_upload"
  | "web"
  | "chatbot";

export type CrmLeadStatus = "cold" | "warm" | "hot" | "customer" | "lost";

export type CrmContactChannel =
  | "call"
  | "sms"
  | "zalo"
  | "facebook"
  | "email"
  | "inperson";

export interface CrmLead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: CrmLeadSource;
  status: CrmLeadStatus;
  assigned_sale_id: string | null;
  assigned_sale_name?: string | null;
  imported_by_sale_id: string | null;
  ai_score: number;
  booking_count: number;
  contact_count: number;
  registered: boolean;
  last_contact_at: string | null;
  hot_marker_at: string | null;
  created_at: string;
  updated_at: string;
  note: string | null;
  // Trường phân loại / hồ sơ mở rộng (Customer 360) — đều tuỳ chọn.
  region?: string | null;
  customer_group?: string | null;
  product_type?: string | null;
  budget?: string | null;
  purpose?: string | null;
  project?: string | null;
  days_since_contact: number | null;
}

export interface CrmContactLog {
  id: string;
  lead_id: string;
  sale_id: string;
  channel: CrmContactChannel;
  note: string;
  outcome: string;
  created_by_name?: string | null;
  created_at: string;
}

export interface CrmLeadDetail extends CrmLead {
  contact_logs: CrmContactLog[];
}

/** Payload sửa thông tin khách (admin) — đồng bộ app/schemas/crm.py LeadAdminUpdate. */
export interface CrmLeadUpdate {
  name?: string;
  phone?: string;
  email?: string | null;
  source?: CrmLeadSource;
  status?: CrmLeadStatus;
  note?: string | null;
  assigned_sale_id?: string | null;
  // Trường phân loại / hồ sơ mở rộng (Customer 360).
  region?: string | null;
  customer_group?: string | null;
  product_type?: string | null;
  budget?: string | null;
  purpose?: string | null;
  project?: string | null;
}

/** Kênh care feed = kênh liên hệ + 'note' (ghi chú thuần). */
export type CrmCareChannel = CrmContactChannel | "note";

/** Payload đăng 1 hoạt động chăm sóc (care feed). */
export interface CareLogInput {
  channel: CrmCareChannel;
  note: string;
  outcome?: string | null;
}

/** Gợi ý sale khi phân công chăm sóc — đồng bộ app/schemas/crm.py SaleSuggestion. */
export interface SaleSuggestion {
  sale_id: string;
  sale_name: string;
  eligibility_score: number;
  avg_daily_score: number;
  total_deals_closed: number;
  rank: number;
  online: boolean;
  availability?: string | null;
  active_calls: number;
}

/** Payload phân công chăm sóc cho sale (+ kênh tuỳ chọn). */
export interface AssignCareInput {
  sale_id: string;
  channel?: CrmContactChannel | null;
}

export interface CrmLeadPage {
  total: number;
  page: number;
  page_size: number;
  items: CrmLead[];
}

/** Kết quả xoá hàng loạt khách — đồng bộ POST /admin/crm/leads/bulk-delete. */
export interface CrmBulkDeleteResult {
  deleted_count: number;
  deleted_ids: string[];
  not_found: string[];
}

export interface CrmStats {
  total_leads: number;
  hot_leads: number;
  customers: number;
  cold_leads: number;
  warm_leads: number;
  lost_leads: number;
  conversion_rate: number;
  top_sources: { source: string; count: number }[];
}

export interface SalePerformance {
  sale_id: string;
  sale_name: string;
  week_start: string;
  avg_daily_score: number;
  total_leads_added: number;
  total_hot_leads_received: number;
  total_deals_closed: number;
  eligibility_score: number;
  rank: number;
}

// ---------------------------------------------------------------------------
// Import khách CRM đa nguồn (đồng bộ app/schemas/customer_import.py)
// ---------------------------------------------------------------------------

/** Map trường hệ thống ↔ tên cột (header) trong nguồn dữ liệu. */
export interface ImportColumnMapping {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  note?: string | null;
  demand?: string | null;
  // Trường phân loại / hồ sơ mở rộng (Customer 360).
  region?: string | null; // Vùng miền / khu vực
  customer_group?: string | null; // Tệp khách / nhóm khách
  product_type?: string | null; // Phân khúc / sản phẩm quan tâm
  budget?: string | null; // Ngân sách
  purpose?: string | null; // Mục đích (ở / đầu tư)
  project?: string | null; // Dự án quan tâm
}

/** Khoá field map được + nhãn tiếng Việt (dựng UI map cột). */
export type ImportMappingField = keyof ImportColumnMapping;

/** Số dòng dữ liệu của 1 tab (báo "số dòng/tab"). */
export interface ImportTabCount {
  name: string;
  count: number;
}

export interface ImportParsePreview {
  headers: string[];
  rows: Record<string, unknown>[];
  total: number;
  suggested_mapping: ImportColumnMapping;
  sheet_names?: string[] | null; // với Google Sheet / file nhiều sheet
  source_label?: string | null; // "google_sheet" | "file_upload"
  multi_tab?: boolean; // rows gộp từ nhiều tab
  tab_counts?: ImportTabCount[] | null; // số dòng từng tab (khi multi_tab)
}

export interface ImportCommitPayload {
  rows: Record<string, unknown>[];
  mapping: ImportColumnMapping;
  source?: string; // LeadSource value (google_sheet | file_upload | …)
  assigned_sale_id?: string | null;
  auto_assign?: boolean;
  skip_duplicates?: boolean;
  auto_care?: boolean;
  default_status?: string; // LeadStatus value
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: Record<string, unknown>[];
  duplicates: Record<string, unknown>[];
  created_ids: string[];
  ai_scored: number;
}

export interface ImportWorkspaceStatus {
  connected: boolean;
  scopes: string[];
  email: string | null;
  connected_at: string | null;
  updated_at: string | null;
  redirect_uri: string;
  sheets_ready: boolean;
}

// ---------------------------------------------------------------------------
// AI CRM — insight + rescore (đồng bộ app/api/ai_crm.py)
// ---------------------------------------------------------------------------

export type AiTier = "cold" | "warm" | "hot";

export interface AiNextAction {
  summary?: string | null;
  suggested_action?: string | null;
}

export interface LeadInsight {
  lead_id: string;
  ai_score: number;
  ai_tier?: AiTier | string | null;
  ai_reason?: string | null;
  ai_best_time?: string | null;
  ai_next_action?: AiNextAction | null;
  ai_scored_at?: string | null;
  status?: string | null;
}

export interface RescoreResult {
  scored: number;
}

// ---------------------------------------------------------------------------
// Hồ sơ 360° (đồng bộ app/core/customer_360.py build_profile)
// ---------------------------------------------------------------------------

export interface Profile360Basic {
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string | null;
  assigned_sale_id: string | null;
  assigned_sale_name: string | null;
  registered: boolean;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Profile360Ai {
  score: number;
  tier?: AiTier | string | null;
  reason?: string | null;
  best_time?: string | null;
  next_action?: AiNextAction | null;
  scored_at?: string | null;
}

export interface PipelineStageMeta {
  key: string;
  label: string;
  rank: number;
}

export interface Profile360Pipeline {
  stage: string;
  label: string;
  rank: number;
  stages: PipelineStageMeta[];
}

/** Mục dòng thời gian gộp đa nguồn (contact/booking/quote/ai/stage/note/created/update).
 *  `ref` chứa actor_id/actor_name cho mục contact/update (care feed kiểu mạng xã hội). */
export interface TimelineItem {
  type: string;
  channel: string;
  time: string | null;
  summary: string;
  ref: Record<string, unknown>;
}

/** Kết quả POST care: item timeline để prepend + log thô. */
export interface CareLogResult {
  item: TimelineItem;
  log: CrmContactLog;
}

export interface ChannelInteraction {
  channel: string;
  label: string;
  count: number;
  last_at: string | null;
  linked: boolean;
}

export interface Profile360Deals {
  bookings: Record<string, unknown>[];
  quotes: Record<string, unknown>[];
}

export interface Profile360Stats {
  contact_count: number;
  effective_contact_count: number;
  booking_count: number;
  quote_count: number;
  days_since_contact: number | null;
}

export interface Profile360 {
  lead_id: string;
  basic: Profile360Basic;
  ai: Profile360Ai;
  /** Sale AI đang phụ trách (Đội Sale AI) — null nếu chưa gán / chưa seed roster. */
  ai_salesman?: AiSalesmanRef | null;
  /** BĐS phù hợp nhu cầu khách (inventory matching) — [] nếu chưa khớp được. */
  matched_units?: MatchedUnit[];
  pipeline: Profile360Pipeline;
  timeline: TimelineItem[];
  deals: Profile360Deals;
  channels: ChannelInteraction[];
  stats: Profile360Stats;
}

// ---- Hội thoại đa kênh hợp nhất theo khách (GET /crm/leads/{id}/conversations) ----

export interface LeadConversationMessage {
  channel: string; // zalo | facebook | email | web | call | sms | chatwoot | ...
  channel_label: string;
  source: "chatwoot" | "internal";
  direction: "in" | "out";
  sender: string | null;
  content: string;
  time: string | null;
  conversation_id?: string | null;
  web_url?: string | null;
}

export interface LeadConversationsResponse {
  lead_id: string;
  messages: LeadConversationMessage[];
  count: number;
  channels: string[];
  chatwoot: {
    configured: boolean;
    error: boolean;
    detail?: string | null;
  };
}

// ---------------------------------------------------------------------------
// Pipeline kanban (đồng bộ app/api/pipeline.py)
// ---------------------------------------------------------------------------

export interface PipelineCard {
  id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
  source: string | null;
  assigned_sale_id: string | null;
  ai_score: number;
  ai_tier?: AiTier | string | null;
  stage: string;
  suggested_stage: string | null;
  booking_count: number;
  quote_count: number;
  last_contact_at: string | null;
  updated_at: string | null;
}

export interface PipelineColumn {
  key: string;
  label: string;
  rank: number;
  count: number;
  leads: PipelineCard[];
}

export interface PipelineResponse {
  stages: PipelineColumn[];
  total: number;
}

export interface StageChangeResult {
  lead_id: string;
  stage: string;
  label: string;
  lead: CrmLead;
}

// ---- Automation (n8n) ----

export interface N8nTag {
  id: string | null;
  name: string | null;
}

export interface N8nCategory {
  key: string;
  label: string;
  source: "tag" | "name";
}

export interface N8nLastRun {
  status: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
}

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  tags: N8nTag[];
  createdAt: string | null;
  updatedAt: string | null;
  category: N8nCategory;
  open_url: string;
  last_run: N8nLastRun | null;
  runs_window: number;
  errors_window: number;
  error_rate: number;
}

export interface N8nCategoryGroup {
  key: string;
  label: string;
  source: "tag" | "name";
  workflows: N8nWorkflow[];
}

/** Hướng dẫn set key — trả về khi chưa cấu hình N8N_API_KEY. */
export interface AutomationSetup {
  steps: string[];
}

export interface AutomationNotConfigured {
  configured: false;
  n8n_url: string;
  message: string;
  setup: AutomationSetup;
}

export interface AutomationOverview {
  configured: true;
  n8n_url: string;
  total: number;
  active: number;
  inactive: number;
  categories_count: number;
  runs_today: number;
  errors_recent: number;
  executions_window: number;
  checked_at: string;
}

export interface AutomationWorkflows {
  configured: true;
  n8n_url: string;
  total: number;
  categories: N8nCategoryGroup[];
  checked_at: string;
}

export type AutomationOverviewResponse =
  | AutomationOverview
  | AutomationNotConfigured;
export type AutomationWorkflowsResponse =
  | AutomationWorkflows
  | AutomationNotConfigured;

export interface N8nExecution {
  id: string;
  workflowId: string | null;
  status: string | null;
  mode: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  finished: boolean;
}

export interface AutomationExecutionsResponse {
  configured: boolean;
  workflow_id?: string;
  count?: number;
  executions?: N8nExecution[];
  // khi chưa cấu hình
  message?: string;
  setup?: AutomationSetup;
  n8n_url?: string;
}

export interface ToggleWorkflowResult {
  status: string;
  id: string;
  active: boolean;
}

// ---- Manager / Trung tâm điều hành (/admin/manager) ----

export interface ManagerInventoryKpi {
  total: number;
  available: number;
  sold: number;
  reserved: number;
  is_demo: boolean;
}

export interface ManagerSalesKpi {
  orders_reserved: number;
  revenue_projection_ty: number;
  commission_rate: number;
  inventory: ManagerInventoryKpi;
}

export interface ManagerLeadsKpi {
  total_leads?: number;
  hot_leads?: number;
  customers?: number;
  cold_leads?: number;
  warm_leads?: number;
  lost_leads?: number;
  conversion_rate?: number;
  top_sources?: { source: string; count: number }[];
}

export interface ManagerTopSale {
  sale_id: string;
  sale_name?: string;
  eligibility_score?: number;
  [key: string]: unknown;
}

export interface ManagerCommissionKpi {
  deals: number;
  total_amount: number;
  by_status: Record<string, { count: number; amount: number }>;
}

export interface ManagerAutomationKpi {
  configured: boolean;
  total?: number;
  active?: number;
  inactive?: number;
  runs_today?: number;
  errors_recent?: number;
  error?: string;
}

export interface ManagerPlatform {
  key: string;
  name: string;
  url: string;
  status?: "up" | "down";
  code?: number | null;
  error?: string;
}

export interface ManagerOpenClawStatus {
  configured: boolean;
  telegram_configured: boolean;
  bot_url: string;
}

export interface ManagerOverview {
  generated_at: string;
  sales: ManagerSalesKpi;
  leads: ManagerLeadsKpi;
  top_sales: ManagerTopSale[];
  commission: ManagerCommissionKpi;
  automation: ManagerAutomationKpi;
  platforms: ManagerPlatform[];
  openclaw: ManagerOpenClawStatus;
}

export type ManagerBroadcastChannel = "inapp" | "telegram";
export type ManagerAudience = "all_sales" | "all_admins" | "selected";

export interface ManagerBroadcastPayload {
  message: string;
  audience: ManagerAudience;
  user_ids?: string[];
  channels: ManagerBroadcastChannel[];
  title?: string;
}

export interface ManagerBroadcastResult {
  ok: boolean;
  audience: string;
  recipients: number;
  channels: string[];
  results: {
    inapp: { created: boolean; error?: string };
    telegram: { sent: number; skipped: number; errors: number; error?: string };
  };
}

export interface ManagerAssignHotResult {
  ok: boolean;
  dry_run?: boolean;
  pending?: number;
  distributed?: number;
  leads?: { lead_id: string; sale_id: string }[];
}

export interface ManagerCommandPayload {
  text: string;
  confirm?: boolean;
  action?: string | null;
  params?: Record<string, unknown>;
}

export interface ManagerCommandResult {
  ok: boolean;
  executed: boolean;
  action: string | null;
  params?: Record<string, unknown>;
  requires_confirmation?: boolean;
  summary?: string;
  message?: string;
  result?: { type: string; data?: unknown; message?: string };
}

// ---- Báo cáo hệ thống (/admin/manager/system-report) ----

export interface ManagerReportLeads {
  available: boolean;
  total?: number;
  hot?: number;
  warm?: number;
  cold?: number;
  customers?: number;
  lost?: number;
  conversion_rate?: number;
  top_sources?: { source: string; count: number }[];
}

export interface ManagerFunnelStage {
  key: string;
  label: string;
  count: number | null;
}

export interface ManagerReportFinance {
  available: boolean;
  period_label?: string;
  revenue?: number;
  cost?: number;
  profit?: number;
  margin?: number;
  deal_count?: number;
  commission?: {
    deals: number;
    total_amount: number;
    by_status: Record<string, { count: number; amount: number }>;
  };
}

export interface ManagerReportAiCare {
  available: boolean;
  total?: number;
  pending?: number;
  approved?: number;
  skipped?: number;
  sent?: number;
}

export interface ManagerReportAiSales {
  available: boolean;
  total?: number;
  active?: number;
  inactive?: number;
  total_capacity?: number;
  total_assigned?: number;
  capacity_left?: number;
  avg_load?: number;
  load_ratio?: number;
}

export interface ManagerReportMarketingChannel {
  channel: string;
  leads: number;
  spent: number;
  cpl: number;
}

export interface ManagerReportMarketing {
  available: boolean;
  total_spent?: number;
  total_leads?: number;
  avg_cpl?: number;
  roi?: number;
  by_channel?: ManagerReportMarketingChannel[];
}

export interface ManagerSystemReport {
  generated_at: string;
  leads: ManagerReportLeads;
  funnel: ManagerFunnelStage[];
  sales: ManagerSalesKpi;
  finance: ManagerReportFinance;
  ai_care: ManagerReportAiCare;
  ai_sales: ManagerReportAiSales;
  marketing: ManagerReportMarketing;
  platforms: ManagerPlatform[];
  automation: ManagerAutomationKpi;
  openclaw: ManagerOpenClawStatus;
}

// ---- Đề xuất cải tiến (/admin/manager/improvements) ----

export type ManagerImprovementSeverity = "high" | "medium" | "low";

export interface ManagerImprovement {
  title: string;
  area?: string;
  severity?: ManagerImprovementSeverity | string;
  detail?: string;
  suggested_action?: string;
}

export interface ManagerImprovementsResult {
  generated_by: "ai" | "fallback" | string;
  generated_at: string;
  focus?: string | null;
  improvements: ManagerImprovement[];
  report?: ManagerSystemReport;
}

// ---- Tài chính (/admin/finance) ----

export type CostCategory =
  | "nền tảng"
  | "marketing"
  | "nhân sự"
  | "vận hành"
  | "khác";
export type CostRecurrence = "monthly" | "one_off";

export interface FinanceCost {
  id: string;
  category: CostCategory | string;
  name: string;
  amount: number;
  recurring: CostRecurrence | string;
  date: string; // YYYY-MM-DD
  note?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface FinanceCostInput {
  category: string;
  name: string;
  amount: number;
  recurring: string;
  date: string;
  note?: string;
}

export interface FinanceManualRevenue {
  id: string;
  name: string;
  amount: number;
  date: string;
  source?: string | null;
  note?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface FinanceManualRevenueInput {
  name: string;
  amount: number;
  date: string;
  source?: string;
  note?: string;
}

export interface FinanceRevenueItem {
  source: "commission" | "manual" | "deal" | string;
  source_label: string;
  ref_id?: string | null;
  label: string;
  amount: number;
  date: string;
  meta: Record<string, unknown>;
}

export interface FinancePeriodSummary {
  period_label: string;
  start: string;
  end: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  deal_count: number;
  customer_count: number;
}

export interface FinanceMonthlyPoint {
  month: string; // YYYY-MM
  revenue: number;
  cost: number;
  profit: number;
}

export interface FinanceCostSlice {
  category: string;
  amount: number;
  percentage: number;
}

export interface FinanceOverview {
  summary: FinancePeriodSummary;
  monthly: FinanceMonthlyPoint[];
  cost_breakdown: FinanceCostSlice[];
  revenue_breakdown: { commission: number; manual: number };
}

export interface FinanceForecast {
  next_period_label: string;
  revenue: number;
  cost: number;
  profit: number;
  method: string;
}

export interface FinanceAIAnalysis {
  source: "ai" | "fallback";
  summary: string;
  forecast: FinanceForecast;
  period_label: string;
  generated_at: string;
}

export interface FinanceRevenueResponse {
  items: FinanceRevenueItem[];
  count: number;
  total: number;
  manual: FinanceManualRevenue[];
}

export type FinancePeriod = "month" | "quarter" | "year";

// ---------------------------------------------------------------------------
// NHÂN SỰ (HR) — phân quyền, KPI, báo cáo hiệu suất AI (đồng bộ app/schemas/hr.py)
// ---------------------------------------------------------------------------

export type HRRole =
  | "admin"
  | "manager"
  | "sale"
  | "marketing"
  | "accountant"
  | "support"
  | "client";

export type KPIMetric =
  | "revenue"
  | "commission"
  | "deals"
  | "leads"
  | "contacts"
  | "meetings";

/** Nhân sự (mở rộng từ public_view + % hoàn thành mục tiêu). */
export interface HRStaff {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  role: HRRole | string;
  is_active: boolean;
  region?: string | null;
  referral_code?: string | null;
  upline_email?: string | null;
  created_at: string;
  objective_completion_pct: number;
}

export interface HRStaffCreate {
  email: string;
  full_name: string;
  password?: string;
  phone?: string;
  role: HRRole;
  region?: string;
  upline_email?: string;
}

export interface HRStaffUpdate {
  full_name?: string;
  email?: string;
  phone?: string;
  role?: HRRole;
  is_active?: boolean;
  region?: string;
  upline_email?: string;
}

export interface HRPermissionDef {
  key: string;
  label_vi: string;
}

export interface HRRolePermissionRow {
  role: string;
  label_vi: string;
  permissions: Record<string, boolean>;
}

export interface HRPermissionMatrix {
  permissions_catalog: HRPermissionDef[];
  roles: HRRolePermissionRow[];
}

export interface HRObjective {
  id: string;
  staff_id: string;
  staff_name?: string | null;
  period: string;
  metric: KPIMetric;
  target: number;
  actual: number;
  actual_auto: number;
  actual_override?: number | null;
  completion_pct: number;
  note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRObjectiveCreate {
  staff_id: string;
  period: string;
  metric: KPIMetric;
  target: number;
  note?: string;
}

export interface HRObjectiveUpdate {
  period?: string;
  metric?: KPIMetric;
  target?: number;
  actual_override?: number | null;
  note?: string;
}

export interface HRPerformanceReport {
  staff_id: string;
  staff_name: string;
  role: string;
  generated_at: string;
  ai_used: boolean;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  metrics: Record<string, number>;
}

export interface HRTopPerformer {
  staff_id: string;
  staff_name: string;
  role: string;
  completion_pct: number;
}

export interface HROverview {
  staff_total: number;
  staff_active: number;
  staff_by_role: Record<string, number>;
  objectives_total: number;
  overall_completion_pct: number;
  top_performers: HRTopPerformer[];
  generated_at: string;
}

// ---------------------------------------------------------------------------
// AI Marketing — chiến dịch đa kênh + hiệu suất + sản xuất nội dung AI
// ---------------------------------------------------------------------------

export type CampaignChannel =
  | "facebook"
  | "zalo"
  | "google"
  | "email"
  | "tiktok"
  | "other";
export type CampaignStatus = "draft" | "running" | "paused" | "done";
export type MarketingContentType = "post" | "ad" | "email" | "script";
export type MarketingContentLength = "short" | "medium" | "long";

export interface MarketingCampaign {
  id: string;
  name: string;
  channel: CampaignChannel;
  objective?: string | null;
  budget: number;
  spent: number;
  start_date?: string | null;
  end_date?: string | null;
  status: CampaignStatus;
  utm_source?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignCreatePayload {
  name: string;
  channel: CampaignChannel;
  objective?: string;
  budget?: number;
  spent?: number;
  start_date?: string;
  end_date?: string;
  status?: CampaignStatus;
  utm_source?: string;
  notes?: string;
}

export type CampaignUpdatePayload = Partial<CampaignCreatePayload>;

export interface CampaignPerformance {
  campaign_id: string;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  budget: number;
  spent: number;
  leads: number;
  customers: number;
  cpl: number;
  conversion_rate: number;
  est_revenue: number;
  roi: number;
}

export interface MarketingChannelStat {
  channel: CampaignChannel;
  campaigns: number;
  spent: number;
  leads: number;
  customers: number;
  cpl: number;
  est_revenue: number;
  roi: number;
}

export interface MarketingOverview {
  total_campaigns: number;
  running_campaigns: number;
  total_budget: number;
  total_spent: number;
  total_leads: number;
  total_customers: number;
  avg_cpl: number;
  est_revenue: number;
  roi: number;
  est_revenue_per_customer: number;
  by_channel: MarketingChannelStat[];
  campaigns: CampaignPerformance[];
  generated_at: string;
}

export interface ContentGeneratePayload {
  content_type: MarketingContentType;
  channel: CampaignChannel;
  product: string;
  audience?: string;
  tone?: string;
  length: MarketingContentLength;
  variants: number;
  campaign_id?: string;
}

export interface MarketingContentItem {
  id: string;
  content_type: MarketingContentType;
  channel: CampaignChannel;
  product: string;
  audience?: string | null;
  tone?: string | null;
  length: MarketingContentLength;
  variants: string[];
  used_llm: boolean;
  campaign_id?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface ContentGenerateResponse {
  item: MarketingContentItem;
  used_llm: boolean;
  message?: string | null;
}

export interface CampaignSuggestion {
  channel: CampaignChannel;
  idea: string;
  rationale?: string | null;
}

export interface CampaignSuggestResponse {
  suggestions: CampaignSuggestion[];
  used_llm: boolean;
  message?: string | null;
}

// ---------------------------------------------------------------------------
// MARKETING PIPELINE — dây chuyền sản xuất content AI nhiều giai đoạn
// ---------------------------------------------------------------------------

export type PipelineStage =
  | "research"
  | "script"
  | "content"
  | "video_script"
  | "publish";

export type PipelineContentFormat =
  | "toplist"
  | "pov"
  | "case_study"
  | "howto"
  | "generic";

export type PipelineLanguage = "vi" | "en" | "bilingual";

export type PipelineStageStatus = "pending" | "running" | "done" | "error";

export interface PipelinePublishResult {
  channel: string;
  status: "posted" | "scheduled" | "needs_connection" | "error" | "skipped";
  detail?: string;
  post_id?: string;
  message_id?: string;
}

export interface PipelineStageState {
  status: PipelineStageStatus;
  output?: string | null;
  result?: {
    channels?: string[];
    results?: PipelinePublishResult[];
    needs_connection?: string[];
  } | null;
  used_llm: boolean;
  updated_at?: string | null;
  error?: string | null;
}

export interface MarketingPipeline {
  id: string;
  name: string;
  topic: string;
  project?: string | null;
  audience?: string | null;
  content_format: PipelineContentFormat;
  channel: CampaignChannel;
  tone?: string | null;
  language: PipelineLanguage;
  campaign_id?: string | null;
  stages: Record<PipelineStage, PipelineStageState>;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineCreatePayload {
  name: string;
  topic: string;
  project?: string;
  audience?: string;
  content_format: PipelineContentFormat;
  channel: CampaignChannel;
  tone?: string;
  language: PipelineLanguage;
  campaign_id?: string;
}

export type PipelineUpdatePayload = Partial<PipelineCreatePayload>;

export interface PipelineRunResponse {
  pipeline: MarketingPipeline;
  ran: string[];
  used_llm: boolean;
  message?: string | null;
}

export interface PipelineRunAllPayload {
  include_publish?: boolean;
  confirm?: boolean;
  channels?: CampaignChannel[];
}

export interface PipelinePublishPayload {
  channels?: CampaignChannel[];
  confirm?: boolean;
  email_to?: string[];
  subject?: string;
}

// ---------------------------------------------------------------------------
// ĐỘI SALE AI (Sales Crew / CrewAI) — /admin/crew/*
// Khớp schema backend: app/crew/availability.py, service.py, sales_crew.py.
// Mọi kết quả chỉ ĐỌC + TẠO NHÁP: requires_confirmation=true, auto_executed=false.
// ---------------------------------------------------------------------------

export type CrewMode = "disabled" | "live" | "fallback";

/** GET /admin/crew/status — crew_runtime_status(). */
export interface CrewStatus {
  enabled: boolean;
  mode: CrewMode;
  crewai_installed: boolean;
  anthropic_key_present: boolean;
  use_mock_llm: boolean;
  dify_configured: boolean;
  dify_dataset_configured: boolean;
  model: string;
  max_agents: number;
  max_tokens: number;
  will_use_llm: boolean;
  notes: string[];
}

/** 1 agent template (advisor / nurturer / closer). */
export interface CrewAgentTemplate {
  key: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
}

/** GET /admin/crew/agents. */
export interface CrewAgentsResponse {
  agents: CrewAgentTemplate[];
}

/** 1 đề xuất hành động (engine heuristic). */
export interface CrewRecommendedAction {
  priority: string;
  action: string;
  reason: string;
}

/** 1 tin nhắn NHÁP — không bao giờ tự gửi. */
export interface CrewDraftMessage {
  channel: string;
  draft: string;
  suggested_time?: string;
  requires_confirmation?: boolean;
  auto_sent?: boolean;
}

/** Next-best-action — hành động kế tiếp tốt nhất + thời điểm. */
export interface CrewNextBestAction {
  action: string;
  reason?: string;
  timing?: string;
}

/** 1 căn BĐS đề xuất (đã khớp nhu cầu khách). */
export interface MatchedUnit {
  id?: string;
  lo?: string;
  phan_khu?: string;
  loai?: string;
  dien_tich?: number;
  mat_tien?: number;
  trang_thai?: string;
  gia?: string;
  gia_tri?: number;
  huong?: string;
  view?: string;
  match_percent?: number;
  reasons?: string[];
}

/** Khối phân tích — siêu tập heuristic | claude-direct | crewai. */
export interface CrewAnalysis {
  engine: string; // "heuristic" | "claude-direct" | "crewai"
  model?: string | null;
  summary: string;
  agents: string[];
  draft_messages?: CrewDraftMessage[];
  readiness?: number;
  recommended_actions?: CrewRecommendedAction[];
  // bộ não mạnh (claude-direct/heuristic):
  potential_score?: number;
  potential_reason?: string;
  next_best_action?: CrewNextBestAction | null;
  matched_units?: MatchedUnit[];
  // chỉ engine=crewai:
  task_outputs?: string[];
}

export interface CrewKnowledge {
  configured?: boolean | null;
  records?: number | null;
}

/** POST /admin/crew/leads/{id}/run — service.run_for_lead(). */
export interface CrewRunResult {
  ok: boolean;
  mode: CrewMode | string;
  lead_id: string;
  lead_name?: string | null;
  generated_at: string;
  requires_confirmation: boolean;
  auto_executed: boolean;
  notes: string[];
  // có khi ok=true:
  analysis?: CrewAnalysis;
  matched_units?: MatchedUnit[];
  knowledge?: CrewKnowledge;
}

export type CrewRunChannel = "zalo" | "sms" | "email";

/** Body POST run (CrewRunRequest). */
export interface CrewRunPayload {
  channel?: CrewRunChannel;
}

// ---------------------------------------------------------------------------
// ĐỘI SALE AI ("1000 saleman AI") — /admin/ai-sales/* (require_admin)
// ---------------------------------------------------------------------------

/** 1 sale AI trong roster (public_view). */
export interface AiSalesman {
  id: string;
  code: string;
  name: string;
  specialty: string;
  specialty_label: string;
  capacity: number;
  assigned_count: number;
  status: string; // "active" | "inactive"
  created_at: string;
  updated_at: string;
  capacity_left: number;
  load_ratio: number;
}

/** Khối phân khúc trong thống kê. */
export interface AiSalesBySpecialty {
  key: string;
  label: string;
  count: number;
  assigned: number;
}

/** GET /admin/ai-sales/stats. */
export interface AiSalesStats {
  total: number;
  active: number;
  inactive: number;
  total_capacity: number;
  total_assigned: number;
  avg_load: number;
  capacity_left: number;
  by_specialty: AiSalesBySpecialty[];
}

/** GET /admin/ai-sales (phân trang). */
export interface AiSalesPage {
  total: number;
  page: number;
  page_size: number;
  items: AiSalesman[];
}

/** POST /admin/ai-sales/seed. */
export interface AiSalesSeedResult {
  created: number;
  total: number;
  requested: number;
}

/** Tham chiếu sale AI rút gọn (đính kèm hồ sơ 360 + kết quả run-care). */
export interface AiSalesmanRef {
  id: string;
  code: string;
  name: string;
  specialty: string;
  specialty_label: string;
  status?: string | null;
  assigned_count?: number | null;
  capacity?: number | null;
}

/** POST /admin/ai-sales/leads/{id}/assign. */
export interface AiSalesAssignResult {
  ok: boolean;
  lead_id: string;
  ai_salesman: AiSalesmanRef | null;
  changed?: boolean;
  reason?: string;
}

/** POST run-care = CrewRunResult + sale AI phụ trách. */
export interface AiCareResult extends CrewRunResult {
  ai_salesman?: AiSalesmanRef | null;
}

// ---------------------------------------------------------------------------
// AUTO-CARE — hàng đợi hành động chăm sóc (NHÁP chờ duyệt) + chạy chu kỳ
// ---------------------------------------------------------------------------

/** Căn rút gọn đính kèm mục hàng đợi. */
export interface CareQueueUnitRef {
  id?: string;
  loai?: string;
  phan_khu?: string;
  gia?: string;
  match_percent?: number;
}

/** 1 mục hành động chăm sóc trong hàng đợi. */
export interface CareQueueItem {
  id: string;
  lead_id: string;
  lead_name?: string | null;
  ai_salesman_id?: string | null;
  ai_salesman_name?: string | null;
  action_type: string;
  channel: string;
  draft: string;
  suggested_time?: string;
  summary?: string;
  potential_score?: number | null;
  readiness?: number | null;
  reason?: string;
  matched_units?: CareQueueUnitRef[];
  status: "pending" | "approved" | "skipped" | "sent" | string;
  engine?: string | null;
  model?: string | null;
  due_at?: string;
  created_at: string;
  updated_at?: string;
}

/** GET /admin/ai-sales/care-queue (phân trang). */
export interface CareQueuePage {
  total: number;
  page: number;
  page_size: number;
  items: CareQueueItem[];
}

/** GET /admin/ai-sales/care-queue/stats. */
export interface CareQueueStats {
  total: number;
  pending: number;
  approved: number;
  skipped: number;
  sent: number;
  by_status: Record<string, number>;
  config?: {
    ai_care_enabled: boolean;
    ai_care_auto_send: boolean;
    ai_care_due_days: number;
    ai_care_batch_limit: number;
  };
}

/** Body POST /admin/ai-sales/run-cycle. */
export interface RunCyclePayload {
  channel?: CrewRunChannel;
  due_days?: number;
  batch_limit?: number;
  dry_run?: boolean;
}

/** Kết quả POST /admin/ai-sales/run-cycle. */
export interface RunCycleResult {
  ok: boolean;
  enabled: boolean;
  auto_send: boolean;
  due_days: number;
  batch_limit: number;
  dry_run: boolean;
  scanned_candidates: number;
  queued: number;
  errors: { lead_id: string; error: string }[];
  items: CareQueueItem[];
  note?: string;
  requires_confirmation: boolean;
  auto_executed: boolean;
}

// ---------------------------------------------------------------------------
// DỰ ÁN (Project CMS) — /admin/projects/* (require_admin). Khớp app/schemas/project.py.
// Lưu ý: các tên dùng prefix Project* để KHÔNG đụng TimelineItem (CRM) đã có ở trên.
// ---------------------------------------------------------------------------

export type ProjectSection =
  | "overview"
  | "location"
  | "training"
  | "subzones"
  | "gallery360"
  | "policy"
  | "timeline"
  | "news";

export interface ProjectHeroImage {
  src: string;
  caption: string;
}
export interface ProjectKeyValue {
  label: string;
  value: string;
}
export interface ProjectConnection {
  place: string;
  time: string;
}
export interface ProjectTrainingItem {
  title: string;
  size: string;
  date: string;
  href: string;
  ready: boolean;
}
export interface ProjectSubzone {
  name: string;
  style: string;
  units: string;
  desc: string;
  img: string;
}
export interface ProjectTour360 {
  title: string;
  img: string;
  ready: boolean;
}
export interface ProjectPolicyCard {
  title: string;
  date: string;
  open: boolean;
  summary: string;
  highlights: string[];
}
export interface ProjectPriceRow {
  product: string;
  area: string;
  from: string;
}
export interface ProjectTimelineItem {
  period: string;
  title: string;
  desc: string;
  img: string;
}
export interface ProjectNewsItem {
  title: string;
  date: string;
  excerpt: string;
  img: string;
  url: string;
}

export interface ProjectOverviewContent {
  hero_images: ProjectHeroImage[];
  rows: ProjectKeyValue[];
}
export interface ProjectLocationContent {
  description: string;
  connections: ProjectConnection[];
  map_lat: number | null;
  map_lng: number | null;
}
export interface ProjectTrainingContent {
  items: ProjectTrainingItem[];
}
export interface ProjectSubzonesContent {
  items: ProjectSubzone[];
}
export interface ProjectGallery360Content {
  items: ProjectTour360[];
}
export interface ProjectPolicyContent {
  policies: ProjectPolicyCard[];
  price_table: ProjectPriceRow[];
  commission_note: string;
}
export interface ProjectTimelineContent {
  items: ProjectTimelineItem[];
}
export interface ProjectNewsContent {
  items: ProjectNewsItem[];
}

export interface ProjectContent {
  overview: ProjectOverviewContent;
  location: ProjectLocationContent;
  training: ProjectTrainingContent;
  subzones: ProjectSubzonesContent;
  gallery360: ProjectGallery360Content;
  policy: ProjectPolicyContent;
  timeline: ProjectTimelineContent;
  news: ProjectNewsContent;
}

/** Map section → kiểu nội dung của section đó (dùng cho editor generic). */
export interface ProjectSectionContentMap {
  overview: ProjectOverviewContent;
  location: ProjectLocationContent;
  training: ProjectTrainingContent;
  subzones: ProjectSubzonesContent;
  gallery360: ProjectGallery360Content;
  policy: ProjectPolicyContent;
  timeline: ProjectTimelineContent;
  news: ProjectNewsContent;
}

export interface ProjectDoc {
  slug: string;
  name: string;
  tagline: string;
  status: string;
  developer: string;
  location: string;
  content: ProjectContent;
  version: number;
  last_updated_at: string | null;
}

export interface ProjectSummary {
  slug: string;
  name: string;
  status: string;
  version: number;
  last_updated_at: string | null;
}

export interface ProjectUpdateIn {
  name?: string;
  tagline?: string;
  status?: string;
  developer?: string;
  location?: string;
  content?: Partial<ProjectContent>;
}

/** Kết quả AI-edit 1 section — CHỈ đề xuất, không tự lưu. */
export interface AIEditOut {
  section: string;
  used_llm: boolean;
  suggestion: Record<string, unknown> | null;
  suggestion_text: string | null;
  note: string | null;
}

export interface ProjectHistoryEntry {
  version: number;
  updated_at: string | null;
  updated_by?: string | null;
  note?: string | null;
}
