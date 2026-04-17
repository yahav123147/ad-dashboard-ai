// ═══════════════════════════════════════════════════════════
// Ad Dashboard — Type Definitions
// ═══════════════════════════════════════════════════════════

// --- Data Types ---

export interface DayData {
  date: string;
  // From Meta Ads Manager (auto-synced)
  adSpend: number;
  impressions: number;
  uniqueClicks: number;
  landingPageViews: number;
  registrations: number;
  purchases: number;
  revenue: number;
  // Metadata
  adName: string;
  notes: string;
}

export type CampaignGoal =
  | "clicks"
  | "landingPageViews"
  | "registrations"
  | "purchases"
  | "revenue";

export interface Settings {
  businessName: string;
  month: number;
  year: number;
  vatRate: number;
  breakEvenRoas: number;
  campaignGoal: CampaignGoal;
  leadActionType: string; // global default
  leadActionTypes: Record<string, string>; // per-account overrides: { "act_xxx": "complete_registration" }
}

export interface DayMetrics {
  ctr: number;
  cpc: number;
  cpm: number;
  lpvRate: number;
  regRate: number;
  purchaseRate: number;
  revenueBeforeVat: number;
  cpa: number;
  netProfit: number;
  roas: number;
}

export interface Summary {
  totalSpend: number;
  totalRevenue: number;
  totalRevenueBeforeVat: number;
  totalNetProfit: number;
  totalImpressions: number;
  totalUniqueClicks: number;
  totalLPV: number;
  totalRegistrations: number;
  totalPurchases: number;
  avgCtr: number;
  avgCpc: number;
  avgCpm: number;
  avgLpvRate: number;
  avgRegRate: number;
  avgPurchaseRate: number;
  avgCpa: number;
  overallRoas: number;
  overallRoi: number;
  avgAov: number;
  activeDays: number;
  profitableDays: number;
  bestDay: { date: string; profit: number } | null;
  worstDay: { date: string; profit: number } | null;
}

export interface Account {
  id: string;
  name: string;
  metaAccountId?: string;
  days: DayData[];
}

export interface AdLeaderboardEntry {
  adName: string;
  results: number;
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  days: number;
}

// --- Meta API Types ---

export interface AdUser {
  id: string;
  metaUserId: string;
  name: string | null;
  email: string | null;
  hasValidToken: boolean;
  tokenExpiresAt: string | null;
}

export interface MetaAdAccount {
  id: string; // act_XXXXX
  name: string;
  account_status: number;
}

export interface MetaInsight {
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  inline_link_clicks?: string;
  landing_page_views?: Array<{ action_type: string; value: string }>;
}

// --- UI State Types ---

export interface SyncStatus {
  lastSynced: string | null;
  isSyncing: boolean;
  error: string | null;
}

export interface AuthState {
  user: AdUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

// --- Diagnostic Types ---

export interface DiagnosticCard {
  metric: string;
  label: string;
  value: number;
  threshold: number;
  isGood: boolean;
  goodMessage: string;
  badMessage: string;
  format: (v: number) => string;
}

// --- Smart Recommendations Types ---

export type ScaleLevel =
  | "poor"
  | "below_avg"
  | "average"
  | "good"
  | "excellent";

export interface MetricScale {
  metric: string;
  label: string;
  icon: string;
  value: number;
  formattedValue: string;
  level: ScaleLevel;
  recommendation: string;
  thresholds: number[];
  direction: "higher_better" | "lower_better";
}

export interface SmartRecommendation {
  metrics: MetricScale[];
  overallScore: number;
  overallLevel: ScaleLevel;
  topPriority: MetricScale | null;
  topStrength: MetricScale | null;
}
