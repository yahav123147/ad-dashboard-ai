// src/app/ad-dashboard/lib/seo-types.ts

// ─── Connection State ───
export interface SeoConnections {
  google: {
    connected: boolean;
    accessToken?: string;
    refreshToken?: string;
    siteUrl?: string;
    propertyId?: string;
    expiresAt?: number;
  };
  wordpress: {
    connected: boolean;
    siteUrl?: string;
    user?: string;
    appPassword?: string;
  };
}

// ─── Search Console ───
export interface SCKeyword {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  prevClicks?: number;
  prevImpressions?: number;
  prevCtr?: number;
  prevPosition?: number;
}

export interface SCPageData {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SCDayData {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

// ─── Google Analytics 4 ───
export interface GA4Metrics {
  sessions: number;
  users: number;
  bounceRate: number;
  avgSessionDuration: number;
  prevSessions?: number;
  prevUsers?: number;
  prevBounceRate?: number;
  prevAvgSessionDuration?: number;
}

export interface GA4DayData {
  date: string;
  sessions: number;
  users: number;
}

export interface MonthlyGrowthData {
  month: string; // "2025-05"
  label: string; // "מאי"
  users: number;
  sessions: number;
  clicks: number;
}

// ─── WordPress Content ───
export interface WPArticle {
  id: number;
  title: string;
  url: string;
  slug: string;
  status: "publish" | "draft" | "pending";
  publishedAt: string;
  modifiedAt: string;
  excerpt: string;
  clicks?: number;
  impressions?: number;
  position?: number;
  topKeywords?: string[];
  trafficTrend?: "up" | "down" | "stable";
}

// ─── SEO Tasks ───
export type SeoTaskType =
  | "critical_indexing"
  | "missing_meta_description"
  | "title_too_long"
  | "title_too_short"
  | "weak_title_ctr"
  | "thin_content"
  | "keyword_dropped"
  | "keyword_opportunity"
  | "missing_schema"
  | "missing_alt_text"
  | "internal_linking"
  | "duplicate_content"
  | "slow_page"
  | "eeat_gap"
  | "content_cluster"
  | "opportunity_keyword";

export type SeoTaskStatus = "pending" | "running" | "done" | "approved" | "error";

export interface SeoTaskChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface SeoTask {
  id: string;
  type: SeoTaskType;
  title: string;
  description: string;
  url?: string;
  keyword?: string;
  priority: "critical" | "high" | "medium" | "low";
  status: SeoTaskStatus;
  result?: string;
  changes?: SeoTaskChange[];
  wpPostId?: number;
  wpPostType?: string;
  actualUrl?: string;
  createdAt: string;
}

export const SEO_TASK_TYPE_LABELS: Record<string, { icon: string; label: string }> = {
  critical_indexing: { icon: "🚨", label: "בעיית אינדוקס קריטית" },
  missing_meta_description: { icon: "📝", label: "חסר תיאור מטא" },
  title_too_long: { icon: "📏", label: "כותרת ארוכה מדי" },
  title_too_short: { icon: "📏", label: "כותרת קצרה מדי" },
  weak_title_ctr: { icon: "📊", label: "CTR נמוך מהצפוי" },
  thin_content: { icon: "⚠️", label: "תוכן דק" },
  keyword_dropped: { icon: "📉", label: "מילת מפתח ירדה" },
  keyword_opportunity: { icon: "🎯", label: "הזדמנות מילת מפתח" },
  missing_schema: { icon: "🏗️", label: "חסר Schema" },
  missing_alt_text: { icon: "🖼️", label: "חסר Alt Text" },
  internal_linking: { icon: "🔗", label: "קישורים פנימיים" },
  duplicate_content: { icon: "📋", label: "תוכן כפול" },
  slow_page: { icon: "🐌", label: "דף איטי" },
  eeat_gap: { icon: "🏅", label: "חסר E-E-A-T" },
  content_cluster: { icon: "🌐", label: "בנה Cluster תוכן" },
  opportunity_keyword: { icon: "🎯", label: "הזדמנות דירוג" },
};

// ─── Tab state ───
export type SeoTab = "overview" | "keywords" | "content" | "tasks" | "strategy";
