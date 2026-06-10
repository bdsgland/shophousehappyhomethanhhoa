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
  | "file_upload";

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
}

/** Khoá field map được + nhãn tiếng Việt (dựng UI map cột). */
export type ImportMappingField = keyof ImportColumnMapping;

export interface ImportParsePreview {
  headers: string[];
  rows: Record<string, unknown>[];
  total: number;
  suggested_mapping: ImportColumnMapping;
  sheet_names?: string[] | null; // với Google Sheet
  source_label?: string | null; // "google_sheet" | "file_upload"
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
  pipeline: Profile360Pipeline;
  timeline: TimelineItem[];
  deals: Profile360Deals;
  channels: ChannelInteraction[];
  stats: Profile360Stats;
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
