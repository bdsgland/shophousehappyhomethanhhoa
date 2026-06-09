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
  | "manual";

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
  created_at: string;
}

export interface CrmLeadDetail extends CrmLead {
  contact_logs: CrmContactLog[];
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
