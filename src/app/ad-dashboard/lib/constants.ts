import type { DayData, CampaignGoal, Settings } from "./types";

export const MONTHS_HE = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

export const DEFAULT_SETTINGS: Settings = {
  businessName: "",
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  vatRate: 18,
  breakEvenRoas: 2,
  campaignGoal: "registrations",
  leadActionType: "auto",
  leadActionTypes: {},
};

// Available lead action types for the settings dropdown
export const LEAD_ACTION_TYPES: { value: string; label: string }[] = [
  { value: "auto", label: "אוטומטי (הראשון שנמצא)" },
  { value: "lead", label: "lead — ליד" },
  { value: "offsite_conversion.fb_pixel_lead", label: "fb_pixel_lead — ליד מהפיקסל" },
  { value: "onsite_conversion.lead_grouped", label: "lead_grouped — טופס מיידי" },
  { value: "complete_registration", label: "complete_registration — השלמת רישום" },
  { value: "offsite_conversion.fb_pixel_complete_registration", label: "fb_pixel_complete_registration — רישום מהפיקסל" },
  { value: "offsite_conversion.fb_pixel_custom", label: "fb_pixel_custom — אירוע מותאם אישית" },
  { value: "onsite_conversion.messaging_conversation_started_7d", label: "messaging_conversation — שיחת מסנג׳ר" },
];

export const EMPTY_DAY: DayData = {
  date: "",
  adSpend: 0,
  impressions: 0,
  uniqueClicks: 0,
  landingPageViews: 0,
  registrations: 0,
  purchases: 0,
  revenue: 0,
  adName: "",
  notes: "",
};

export const CAMPAIGN_GOAL_LABELS: Record<CampaignGoal, string> = {
  clicks: "קליקים",
  landingPageViews: "צפיות בדף",
  registrations: "רישומים",
  purchases: "רכישות",
  revenue: "הכנסה ₪",
};

export const FUNNEL_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#a855f7",
  "#06b6d4",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
];

export const GLASS =
  "rounded-2xl border border-gray-200 bg-white shadow-sm";

export const GLASS_HOVER =
  "transition-all duration-300 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md";

export const META_API_VERSION = "v21.0";
export const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export const SYNC_CACHE_HOURS = 24;
