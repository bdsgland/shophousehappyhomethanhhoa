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
  inventory: {
    total: number;
    available: number;
    sold: number;
    reserved: number;
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
