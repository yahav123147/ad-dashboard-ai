"use client";

import { useState, useMemo, useCallback, useEffect } from "react";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface DayData {
  date: string;
  // From Meta Ads Manager
  adSpend: number;
  impressions: number;
  uniqueClicks: number;
  landingPageViews: number;
  // From CRM / website
  registrations: number;
  purchases: number;
  orderBumps: number;
  upsells: number;
  // From accounting
  revenue: number;
  productCost: number;
  commissions: number;
  // Ad tracking
  adName: string;
  // Notes
  notes: string;
}

type CampaignGoal = "clicks" | "landingPageViews" | "registrations" | "purchases" | "revenue";

const CAMPAIGN_GOAL_LABELS: Record<CampaignGoal, string> = {
  clicks: "קליקים",
  landingPageViews: "צפיות בדף",
  registrations: "רישומים",
  purchases: "רכישות",
  revenue: "הכנסה ₪",
};

interface Settings {
  businessName: string;
  month: number;
  year: number;
  vatRate: number;
  breakEvenRoas: number;
  campaignGoal: CampaignGoal;
}

interface AdLeaderboardEntry {
  adName: string;
  results: number;
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  days: number;
}

interface DayMetrics {
  ctr: number;
  cpc: number;
  cpm: number;
  lpvRate: number;
  regRate: number;
  purchaseRate: number;
  obRate: number;
  upsellRate: number;
  revenueBeforeVat: number;
  cpa: number;
  netProfit: number;
  roas: number;
}

interface Summary {
  totalSpend: number;
  totalRevenue: number;
  totalRevenueBeforeVat: number;
  totalProductCost: number;
  totalCommissions: number;
  totalNetProfit: number;
  totalImpressions: number;
  totalUniqueClicks: number;
  totalLPV: number;
  totalRegistrations: number;
  totalPurchases: number;
  totalOrderBumps: number;
  totalUpsells: number;
  avgCtr: number;
  avgCpc: number;
  avgCpm: number;
  avgLpvRate: number;
  avgRegRate: number;
  avgPurchaseRate: number;
  avgObRate: number;
  avgUpsellRate: number;
  avgCpa: number;
  overallRoas: number;
  overallRoi: number;
  avgAov: number;
  activeDays: number;
  profitableDays: number;
  bestDay: { date: string; profit: number } | null;
  worstDay: { date: string; profit: number } | null;
}

interface Account {
  id: string;
  name: string;
  days: DayData[];
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const MONTHS_HE = [
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

const DEFAULT_SETTINGS: Settings = {
  businessName: "",
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  vatRate: 18,
  breakEvenRoas: 2,
  campaignGoal: "registrations",
};

const STORAGE_KEY = "ad-dashboard-v4";

const EMPTY_DAY: Omit<DayData, "date"> = {
  adSpend: 0,
  impressions: 0,
  uniqueClicks: 0,
  landingPageViews: 0,
  registrations: 0,
  purchases: 0,
  orderBumps: 0,
  upsells: 0,
  revenue: 0,
  productCost: 0,
  commissions: 0,
  adName: "",
  notes: "",
};

// ═══════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════

function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function generateEmptyDays(month: number, year: number): DayData[] {
  const count = getDaysInMonth(month, year);
  return Array.from({ length: count }, (_, i) => ({
    ...EMPTY_DAY,
    date: `${i + 1}.${month}`,
  }));
}

function safe(a: number, b: number): number {
  if (!b || !isFinite(a / b)) return 0;
  return a / b;
}

function calcDay(day: DayData, vatRate: number): DayMetrics {
  const revBV = day.revenue / (1 + vatRate / 100);
  const net = revBV - day.adSpend - day.productCost - day.commissions;
  return {
    ctr: safe(day.uniqueClicks, day.impressions) * 100,
    cpc: safe(day.adSpend, day.uniqueClicks),
    cpm: safe(day.adSpend, day.impressions) * 1000,
    lpvRate: safe(day.landingPageViews, day.uniqueClicks) * 100,
    regRate: safe(day.registrations, day.landingPageViews) * 100,
    purchaseRate: safe(day.purchases, day.registrations) * 100,
    obRate: safe(day.orderBumps, day.purchases) * 100,
    upsellRate: safe(day.upsells, day.purchases) * 100,
    revenueBeforeVat: revBV,
    cpa: safe(day.adSpend, day.purchases),
    netProfit: net,
    roas: safe(day.revenue, day.adSpend),
  };
}

function calcSummary(days: DayData[], vatRate: number): Summary {
  const active = days.filter(
    (d) => d.adSpend > 0 || d.revenue > 0 || d.purchases > 0
  );

  const t = days.reduce(
    (a, d) => ({
      spend: a.spend + d.adSpend,
      revenue: a.revenue + d.revenue,
      productCost: a.productCost + d.productCost,
      commissions: a.commissions + d.commissions,
      impressions: a.impressions + d.impressions,
      uniqueClicks: a.uniqueClicks + d.uniqueClicks,
      lpv: a.lpv + d.landingPageViews,
      reg: a.reg + d.registrations,
      purch: a.purch + d.purchases,
      ob: a.ob + d.orderBumps,
      upsell: a.upsell + d.upsells,
    }),
    {
      spend: 0,
      revenue: 0,
      productCost: 0,
      commissions: 0,
      impressions: 0,
      uniqueClicks: 0,
      lpv: 0,
      reg: 0,
      purch: 0,
      ob: 0,
      upsell: 0,
    }
  );

  const revBV = t.revenue / (1 + vatRate / 100);
  const net = revBV - t.spend - t.productCost - t.commissions;

  let bestDay: Summary["bestDay"] = null;
  let worstDay: Summary["worstDay"] = null;

  for (const d of active) {
    const m = calcDay(d, vatRate);
    if (!bestDay || m.netProfit > bestDay.profit)
      bestDay = { date: d.date, profit: m.netProfit };
    if (!worstDay || m.netProfit < worstDay.profit)
      worstDay = { date: d.date, profit: m.netProfit };
  }

  return {
    totalSpend: t.spend,
    totalRevenue: t.revenue,
    totalRevenueBeforeVat: revBV,
    totalProductCost: t.productCost,
    totalCommissions: t.commissions,
    totalNetProfit: net,
    totalImpressions: t.impressions,
    totalUniqueClicks: t.uniqueClicks,
    totalLPV: t.lpv,
    totalRegistrations: t.reg,
    totalPurchases: t.purch,
    totalOrderBumps: t.ob,
    totalUpsells: t.upsell,
    avgCtr: safe(t.uniqueClicks, t.impressions) * 100,
    avgCpc: safe(t.spend, t.uniqueClicks),
    avgCpm: safe(t.spend, t.impressions) * 1000,
    avgLpvRate: safe(t.lpv, t.uniqueClicks) * 100,
    avgRegRate: safe(t.reg, t.lpv) * 100,
    avgPurchaseRate: safe(t.purch, t.reg) * 100,
    avgObRate: safe(t.ob, t.purch) * 100,
    avgUpsellRate: safe(t.upsell, t.purch) * 100,
    avgCpa: safe(t.spend, t.purch),
    overallRoas: safe(t.revenue, t.spend),
    overallRoi: safe(net, t.spend) * 100,
    avgAov: safe(t.revenue, t.purch),
    activeDays: active.length,
    profitableDays: active.filter((d) => calcDay(d, vatRate).netProfit > 0)
      .length,
    bestDay,
    worstDay,
  };
}

// ─── Multi-account helpers ───

function createDefaultAccounts(month: number, year: number): Account[] {
  return Array.from({ length: 1 }, (_, i) => ({
    id: String(i + 1),
    name: `חשבון ${i + 1}`,
    days: generateEmptyDays(month, year),
  }));
}

function mergeDays(accounts: Account[]): DayData[] {
  if (!accounts.length) return [];
  const len = accounts[0].days.length;
  return Array.from({ length: len }, (_, i) => {
    const merged: DayData = {
      ...EMPTY_DAY,
      date: accounts[0].days[i]?.date || `${i + 1}`,
    };
    for (const acc of accounts) {
      if (i < acc.days.length) {
        const d = acc.days[i];
        merged.adSpend += d.adSpend;
        merged.impressions += d.impressions;
        merged.uniqueClicks += d.uniqueClicks;
        merged.landingPageViews += d.landingPageViews;
        merged.registrations += d.registrations;
        merged.purchases += d.purchases;
        merged.orderBumps += d.orderBumps;
        merged.upsells += d.upsells;
        merged.revenue += d.revenue;
        merged.productCost += d.productCost;
        merged.commissions += d.commissions;
      }
    }
    return merged;
  });
}

function aggregateDays(days: DayData[]): DayData {
  return days.reduce(
    (acc, d) => ({
      ...acc,
      adSpend: acc.adSpend + d.adSpend,
      impressions: acc.impressions + d.impressions,
      uniqueClicks: acc.uniqueClicks + d.uniqueClicks,
      landingPageViews: acc.landingPageViews + d.landingPageViews,
      registrations: acc.registrations + d.registrations,
      purchases: acc.purchases + d.purchases,
      orderBumps: acc.orderBumps + d.orderBumps,
      upsells: acc.upsells + d.upsells,
      revenue: acc.revenue + d.revenue,
      productCost: acc.productCost + d.productCost,
      commissions: acc.commissions + d.commissions,
    }),
    { ...EMPTY_DAY, date: days[0]?.date || "" }
  );
}

function groupByWeek(
  days: DayData[]
): { label: string; data: DayData }[] {
  const weeks: { label: string; data: DayData }[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, Math.min(i + 7, days.length));
    const from = i + 1;
    const to = Math.min(i + 7, days.length);
    const agg = aggregateDays(chunk);
    agg.date = `${from}-${to}`;
    weeks.push({
      label: `שבוע ${weeks.length + 1} (${from}-${to})`,
      data: agg,
    });
  }
  return weeks;
}

// ─── Ad leaderboard ───

function calcAdLeaderboard(days: DayData[], goal: CampaignGoal): AdLeaderboardEntry[] {
  const map = new Map<string, { spend: number; revenue: number; results: number; days: number }>();
  for (const d of days) {
    if (!d.adName) continue;
    const existing = map.get(d.adName) || { spend: 0, revenue: 0, results: 0, days: 0 };
    existing.spend += d.adSpend;
    existing.revenue += d.revenue;
    existing.days += 1;
    if (goal === "clicks") existing.results += d.uniqueClicks;
    else if (goal === "landingPageViews") existing.results += d.landingPageViews;
    else if (goal === "registrations") existing.results += d.registrations;
    else if (goal === "purchases") existing.results += d.purchases;
    else if (goal === "revenue") existing.results += d.revenue;
    map.set(d.adName, existing);
  }
  return Array.from(map.entries())
    .map(([adName, v]) => ({
      adName,
      results: v.results,
      spend: v.spend,
      revenue: v.revenue,
      roas: v.spend > 0 ? v.revenue / v.spend : 0,
      cpa: v.results > 0 ? v.spend / v.results : 0,
      days: v.days,
    }))
    .sort((a, b) => b.results - a.results);
}

// ─── Format helpers ───

function fmtN(n: number): string {
  if (!n) return "-";
  return n.toLocaleString("he-IL", { maximumFractionDigits: 0 });
}
function fmtCurrency(n: number): string {
  if (!n) return "-";
  return `₪${n.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
}
function fmtSigned(n: number): string {
  if (!n) return "-";
  const s = n > 0 ? "+" : "";
  return `${s}₪${n.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
}
function fmtPct(n: number): string {
  if (!n) return "-";
  return `${n.toFixed(1)}%`;
}
function fmtRoas(n: number): string {
  if (!n) return "-";
  return `${n.toFixed(2)}x`;
}
function fmtDec(n: number): string {
  if (!n) return "-";
  return `₪${n.toFixed(1)}`;
}

// ─── Demo data ───

function generateDemo(
  month: number,
  year: number,
  variation: number = 0
): DayData[] {
  const count = getDaysInMonth(month, year);
  const rng = (min: number, max: number) =>
    Math.round(min + Math.random() * (max - min));

  // Each account gets a different budget/performance profile
  const profiles = [
    { spendMul: 1, ctrMul: 1, regMul: 1, purchMul: 1 },
    { spendMul: 0.7, ctrMul: 1.2, regMul: 1.1, purchMul: 1.3 },
    { spendMul: 1.4, ctrMul: 0.85, regMul: 0.9, purchMul: 0.8 },
    { spendMul: 0.5, ctrMul: 1.4, regMul: 1.3, purchMul: 1.5 },
    { spendMul: 1.1, ctrMul: 0.95, regMul: 1.05, purchMul: 1.1 },
  ];
  const p = profiles[variation % profiles.length];

  return Array.from({ length: count }, (_, i) => {
    const dayNum = i + 1;
    const dow = new Date(year, month - 1, dayNum).getDay();
    const isWknd = dow === 5 || dow === 6;

    const baseSpend = isWknd ? rng(150, 350) : rng(300, 700);
    const adSpend = Math.round(baseSpend * p.spendMul);
    const impressions = rng(adSpend * 15, adSpend * 35);
    const ctr = (0.01 + Math.random() * 0.03) * p.ctrMul;
    const uniqueClicks = Math.max(1, Math.round(impressions * ctr));
    const lpvRate = 0.7 + Math.random() * 0.25;
    const landingPageViews = Math.round(uniqueClicks * lpvRate);
    const regRate = (0.06 + Math.random() * 0.1) * p.regMul;
    const registrations = Math.max(1, Math.round(landingPageViews * regRate));
    const purchRate = (0.2 + Math.random() * 0.35) * p.purchMul;
    const purchases = Math.max(0, Math.round(registrations * purchRate));
    const orderBumps = Math.round(purchases * (0.15 + Math.random() * 0.2));
    const upsells = Math.round(purchases * (0.05 + Math.random() * 0.15));
    const aov = rng(150, 450);
    const revenue =
      purchases * aov + orderBumps * rng(30, 80) + upsells * rng(100, 300);
    const productCost = Math.round(revenue * (0.15 + Math.random() * 0.15));
    const commissions = Math.round(revenue * (0.04 + Math.random() * 0.06));

    const notes =
      dayNum === 5
        ? "שינוי קריאייטיב"
        : dayNum === 12
          ? "שיפור דף נחיתה"
          : dayNum === 20
            ? "שינוי אורדרבאמפ"
            : "";

    const adNames = ["סרטון — לפני/אחרי", "קרוסלה — המלצות", "תמונה — הנחה", "סרטון — סטוריטלינג", "קרוסלה — פיצ׳רים"];
    const adName = adNames[Math.floor(Math.random() * adNames.length)];

    return {
      date: `${dayNum}.${month}`,
      adSpend,
      impressions,
      uniqueClicks,
      landingPageViews,
      registrations,
      purchases,
      orderBumps,
      upsells,
      revenue,
      productCost,
      commissions,
      adName,
      notes,
    };
  });
}

// ─── AI prompt ───

function getPromptTemplate(s: Settings, accs: Account[]): string {
  const accountsList = accs
    .map((a) => `  - id: "${a.id}", name: "${a.name}"`)
    .join("\n");

  return `אתה סוכן AI שאחראי למלא דשבורד מעקב פרסום ממומן באופן יומי.
הנתונים מגיעים מ-${accs.length} חשבונות Meta Ads. מלא כל חשבון בנפרד.

══════ פרטי העסק ══════
- שם העסק: ${s.businessName || "[שם העסק]"}
- פלטפורמה: Meta Ads (Facebook / Instagram)
- חודש: ${MONTHS_HE[s.month - 1]} ${s.year}
- חשבונות:
${accountsList}

══════ מה לאסוף מ-Meta Ads Manager (כל חשבון בנפרד!) ══════

עבור כל חשבון, עבור כל יום בחודש, משוך:
• Amount Spent → adSpend (₪)
• Impressions → impressions
• Unique Link Clicks → uniqueClicks
• Landing Page Views → landingPageViews

══════ מה לאסוף מה-CRM / מערכת המכירות ══════

• registrations — כמה נרשמו
• purchases — כמה רכשו
• orderBumps — Order Bump בצ׳קאאוט
• upsells — Upsell אחרי הרכישה
• revenue — הכנסה ברוטו כולל מע״מ (כולל OB + Upsells)

══════ מהנהלת חשבונות ══════

• productCost — עלות מוצרים + משלוח (₪)
• commissions — עמלות סליקה + שותפים (₪)

══════ שדות אופציונליים ══════

• adName — שם המודעה שרצה באותו יום
• notes — מה השתנה? קריאייטיב חדש, שינוי קהל, מחיר חדש...

══════ איך לשמור ══════

אפשרות א׳ (מומלצת): שמור ישירות לקובץ public/ad-data/accounts.json
אפשרות ב׳: הדבק JSON בדשבורד → "ממשק סוכן AI" → "ייבוא JSON"

══════ פורמט JSON — מרובה חשבונות ══════

{
  "settings": {
    "businessName": "${s.businessName || "שם העסק"}",
    "month": ${s.month},
    "year": ${s.year},
    "vatRate": ${s.vatRate},
    "breakEvenRoas": ${s.breakEvenRoas}
  },
  "accounts": [
    {
      "id": "1",
      "name": "${accs[0]?.name || "חשבון 1"}",
      "days": [
        {
          "date": "1.${s.month}",
          "adSpend": 500,
          "impressions": 15000,
          "uniqueClicks": 320,
          "landingPageViews": 250,
          "registrations": 22,
          "purchases": 8,
          "orderBumps": 2,
          "upsells": 1,
          "revenue": 3500,
          "productCost": 600,
          "commissions": 175,
          "adName": "video_v2",
          "notes": ""
        }
      ]
    }
  ],
  "_lastUpdated": "ISO timestamp",
  "_updatedBy": "manus"
}

לעדכון חשבון בודד (ייבוא JSON בדשבורד):
{ "accountId": "1", "days": [ ... ] }

══════ הערות חשובות ══════

- מלא כל יום בנפרד (לא שבועי!)
- הכנסה = ברוטו כולל מע״מ (${s.vatRate}%). המערכת מחשבת לפני מע״מ אוטומטית.
- ימים ללא פעילות = אפשר לדלג עליהם.
- כל מספר = מספר פשוט (500, לא "₪500").
- פורמט תאריך: "יום.חודש" (לדוגמה: "1.${s.month}", "15.${s.month}")
- אל תחשב מדדים! הדשבורד עושה את זה לבד.

══════ מה המערכת מחשבת אוטומטית ══════

CTR%, CPC₪, CPM₪, אחוז הגעה לדף, אחוז רישום, אחוז רכישה,
אחוז OB/Upsell, CPA₪, רווח נקי₪, ROAS, אבחון אוטומטי.

ככה בעל העסק יודע בדיוק איפה הבעיה:
- CTR נמוך? → המודעה לא עובדת
- הגעה לדף נמוכה? → הדף איטי
- רישום נמוך? → הדף לא ממיר
- רכישה נמוכה? → תהליך המכירה לא עובד
- OB/Upsell נמוך? → ההצעות לא אטרקטיביות`;
}

// ═══════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════

function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  danger,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-white/[0.1] bg-[#111115] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 text-lg font-bold text-white">{title}</h3>
        <p className="mb-6 text-sm leading-relaxed text-gray-400">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all ${danger ? "bg-red-600 hover:bg-red-500" : "bg-blue-600 hover:bg-blue-500"}`}
          >
            אישור
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-gray-300 transition-all hover:bg-white/[0.08]"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyCell({ value, fmt }: { value: number; fmt: (n: number) => string }) {
  return (
    <div className="px-2.5 py-2 text-left text-sm font-medium text-gray-600">
      {fmt(value)}
    </div>
  );
}

const GLASS =
  "rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm";
const GLASS_HOVER =
  "transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-white/[0.05]";

function KPICard({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: string;
}) {
  const accents: Record<string, { bar: string; grad: string; text: string }> = {
    blue: {
      bar: "bg-blue-500",
      grad: "from-blue-500/15 via-blue-500/5 to-transparent",
      text: "text-blue-400",
    },
    green: {
      bar: "bg-emerald-500",
      grad: "from-emerald-500/15 via-emerald-500/5 to-transparent",
      text: "text-emerald-400",
    },
    red: {
      bar: "bg-red-500",
      grad: "from-red-500/15 via-red-500/5 to-transparent",
      text: "text-red-400",
    },
    amber: {
      bar: "bg-amber-500",
      grad: "from-amber-500/15 via-amber-500/5 to-transparent",
      text: "text-amber-400",
    },
    purple: {
      bar: "bg-purple-500",
      grad: "from-purple-500/15 via-purple-500/5 to-transparent",
      text: "text-purple-400",
    },
    cyan: {
      bar: "bg-cyan-500",
      grad: "from-cyan-500/15 via-cyan-500/5 to-transparent",
      text: "text-cyan-400",
    },
  };
  const a = accents[color] || accents.blue;

  return (
    <div
      className={`group relative overflow-hidden ${GLASS} ${GLASS_HOVER} p-5 md:p-6`}
    >
      {/* Top accent line */}
      <div
        className={`absolute inset-x-0 top-0 h-[2px] ${a.bar} opacity-40 transition-opacity group-hover:opacity-80`}
      />
      {/* Background gradient */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${a.grad} opacity-60`}
      />
      {/* Content */}
      <div className="relative">
        <div className="mb-3 flex items-center gap-2.5">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${a.bar}/10 text-lg`}
          >
            {icon}
          </div>
          <span className="text-sm font-medium text-gray-400">{label}</span>
        </div>
        <div className="text-3xl font-bold tracking-tight text-white md:text-4xl">
          {value}
        </div>
        {sub && (
          <div className="mt-2.5 text-[13px] leading-relaxed text-gray-500">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function FunnelStep({
  label,
  value,
  rate,
  maxValue,
  color,
  step,
}: {
  label: string;
  value: number;
  rate?: string;
  maxValue: number;
  color: string;
  step: number;
}) {
  const w = maxValue > 0 ? Math.max(5, (value / maxValue) * 100) : 0;
  return (
    <div className="group flex items-center gap-3">
      {/* Step number */}
      <div
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white/80"
        style={{ backgroundColor: `${color}33` }}
      >
        {step}
      </div>
      {/* Label */}
      <div className="w-28 flex-shrink-0 text-left text-sm font-medium text-gray-300">
        {label}
      </div>
      {/* Bar */}
      <div className="relative flex-1">
        <div className="h-10 overflow-hidden rounded-xl bg-white/[0.04]">
          <div
            className="flex h-full items-center rounded-xl pr-3 transition-all duration-700"
            style={{
              width: `${w}%`,
              background: `linear-gradient(90deg, ${color}cc, ${color}44)`,
              boxShadow: `0 0 20px ${color}15`,
            }}
          >
            {w > 15 && (
              <span className="text-xs font-bold text-white drop-shadow-sm">
                {fmtN(value)}
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Value outside bar if small */}
      {w <= 15 && (
        <span className="min-w-[40px] text-left text-xs font-semibold text-white">
          {fmtN(value)}
        </span>
      )}
      {/* Rate badge */}
      {rate && (
        <div
          className="min-w-[70px] rounded-lg px-2 py-1 text-center text-xs font-semibold"
          style={{
            backgroundColor: `${color}15`,
            color: color,
          }}
        >
          {rate}
        </div>
      )}
    </div>
  );
}

function DailyTrend({
  days,
  metrics,
}: {
  days: DayData[];
  metrics: DayMetrics[];
}) {
  const bars = days.map((d, i) => ({
    date: d.date,
    profit: metrics[i].netProfit,
    active: d.adSpend > 0 || d.revenue > 0 || d.purchases > 0,
  }));
  const hasData = bars.some((b) => b.active);
  if (!hasData) return null;

  const maxAbs = Math.max(...bars.map((b) => Math.abs(b.profit)), 1);

  return (
    <div className={`mb-8 ${GLASS} p-5 md:p-6`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">מגמת רווח יומי</h2>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/70" />
            רווח
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500/70" />
            הפסד
          </span>
        </div>
      </div>
      {/* Chart */}
      <div className="flex items-end gap-[3px]" style={{ height: 100 }}>
        {bars.map((b, i) => {
          if (!b.active) {
            return (
              <div key={i} className="flex-1" title={b.date}>
                <div className="mx-auto h-[2px] w-full rounded-full bg-white/[0.04]" />
              </div>
            );
          }
          const h = Math.max(4, (Math.abs(b.profit) / maxAbs) * 100);
          const isProfit = b.profit >= 0;
          return (
            <div
              key={i}
              className="group/bar relative flex-1"
              title={`${b.date}: ${fmtSigned(b.profit)}`}
            >
              <div
                className={`w-full rounded-t-md transition-all duration-200 group-hover/bar:opacity-100 ${isProfit ? "bg-emerald-500/60 group-hover/bar:bg-emerald-400/80" : "bg-red-500/60 group-hover/bar:bg-red-400/80"}`}
                style={{ height: `${h}%` }}
              />
            </div>
          );
        })}
      </div>
      {/* Day labels */}
      <div className="mt-1.5 flex gap-[3px]">
        {bars.map((b, i) => (
          <div
            key={i}
            className="flex-1 text-center text-[8px] text-gray-600"
          >
            {(i + 1) % 5 === 1 ? b.date.split(".")[0] : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function DiagCard({
  icon,
  label,
  value,
  isGood,
  detail,
  threshold,
  current,
  maxVal,
}: {
  icon: string;
  label: string;
  value: string;
  isGood: boolean;
  detail: string;
  threshold: number;
  current: number;
  maxVal: number;
}) {
  const pct = maxVal > 0 ? Math.min((current / maxVal) * 100, 100) : 0;
  const threshPct = maxVal > 0 ? Math.min((threshold / maxVal) * 100, 100) : 0;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 ${isGood ? "border-emerald-500/15 bg-emerald-500/[0.04]" : "border-red-500/15 bg-red-500/[0.04]"}`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span
          className={`text-xs font-medium ${isGood ? "text-emerald-400/70" : "text-red-400/70"}`}
        >
          {label}
        </span>
      </div>
      <div
        className={`text-xl font-bold ${isGood ? "text-emerald-400" : "text-red-400"}`}
      >
        {value}
      </div>
      <div
        className={`mt-1 text-sm ${isGood ? "text-emerald-300/60" : "text-red-300/60"}`}
      >
        {detail}
      </div>
      {/* Progress bar */}
      <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isGood ? "bg-emerald-500/50" : "bg-red-500/50"}`}
          style={{ width: `${pct}%` }}
        />
        {/* Threshold marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white/30"
          style={{ left: `${threshPct}%` }}
        />
      </div>
    </div>
  );
}

function NumCell({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      className="w-full bg-transparent px-2.5 py-2 text-left text-sm text-gray-800 outline-none transition-colors [appearance:textfield] hover:bg-blue-50/60 focus:bg-blue-50 focus:ring-1 focus:ring-blue-400/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      value={value || ""}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      placeholder="-"
    />
  );
}

function TxtCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      className="w-full bg-transparent px-2.5 py-2 text-right text-sm text-gray-500 outline-none transition-colors hover:bg-blue-50/60 focus:bg-blue-50 focus:text-gray-800 focus:ring-1 focus:ring-blue-400/40"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="—"
    />
  );
}

function CC({
  v,
  f,
  pos,
  best,
}: {
  v: number;
  f: (n: number) => string;
  pos?: boolean;
  best?: boolean;
}) {
  const c =
    pos === undefined
      ? "text-gray-700"
      : v > 0
        ? "text-emerald-600"
        : v < 0
          ? "text-red-600"
          : "text-gray-400";
  return (
    <td
      className={`px-2.5 py-2 text-left text-sm font-semibold ${c} ${best ? "bg-amber-50 ring-2 ring-inset ring-amber-400/50" : "bg-violet-50/40"}`}
    >
      <div className="flex items-center gap-1">
        {best && <span className="text-[10px]">🏆</span>}
        <span>{f(v)}</span>
      </div>
    </td>
  );
}

function StaticCell({ value }: { value: string }) {
  return (
    <td className="px-2.5 py-2 text-left text-sm text-gray-800">
      {value || "—"}
    </td>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export function AdDashboard() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [accounts, setAccounts] = useState<Account[]>(() =>
    createDefaultAccounts(DEFAULT_SETTINGS.month, DEFAULT_SETTINGS.year)
  );
  const [activeAccountId, setActiveAccountId] = useState("summary");
  const [timeView, setTimeView] = useState<"daily" | "weekly" | "monthly">(
    "daily"
  );
  const [showAI, setShowAI] = useState(false);
  const [aiTab, setAiTab] = useState<"import" | "export" | "prompt">("import");
  const [jsonIn, setJsonIn] = useState("");
  const [importMsg, setImportMsg] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    danger?: boolean;
  } | null>(null);


  // ─── Persistence (with v3 migration) ───
  useEffect(() => {
    // Load order: 1) /ad-data/accounts.json (Manus file), 2) localStorage, 3) v3 migration
    const loadFromFile = async () => {
      try {
        const res = await fetch("/ad-data/accounts.json");
        if (res.ok) {
          const d = await res.json();
          const hasData = d.accounts?.some(
            (a: Account) => a.days && a.days.length > 0
          );
          if (hasData) {
            if (d.settings) setSettings((p) => ({ ...p, ...d.settings }));
            setAccounts((prev) => {
              // Merge file accounts: match by id, keep existing for unmatched
              const merged = prev.map((existing) => {
                const fromFile = d.accounts?.find(
                  (a: Account) => a.id === existing.id
                );
                return fromFile && fromFile.days?.length > 0
                  ? { ...existing, ...fromFile }
                  : existing;
              });
              // Add any new accounts from file not in current list
              const existingIds = new Set(prev.map((a) => a.id));
              const newAccs = (d.accounts || []).filter(
                (a: Account) => !existingIds.has(a.id)
              );
              return [...merged, ...newAccs];
            });
            return; // File data loaded — skip localStorage
          }
        }
      } catch {
        /* File not available — fallback to localStorage */
      }

      // Fallback: localStorage
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const d = JSON.parse(saved);
          if (d.settings) setSettings(d.settings);
          if (d.accounts?.length) setAccounts(d.accounts);
        } else {
          // Migrate from v3
          const v3 = localStorage.getItem("ad-dashboard-v3");
          if (v3) {
            const d = JSON.parse(v3);
            if (d.settings) setSettings(d.settings);
            if (d.days?.length) {
              setAccounts((prev) => {
                const updated = [...prev];
                if (updated[0]) updated[0] = { ...updated[0], days: d.days };
                return updated;
              });
            }
          }
        }
      } catch {
        /* ignore */
      }
    };

    loadFromFile();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ settings, accounts })
      );
    } catch {
      /* ignore */
    }
  }, [settings, accounts]);

  // ─── Computed data ───
  const activeAccount = accounts.find((a) => a.id === activeAccountId);
  const isEditable = activeAccountId !== "summary" && timeView === "daily";

  const activeDays = useMemo(() => {
    if (activeAccountId === "summary") return mergeDays(accounts);
    return accounts.find((a) => a.id === activeAccountId)?.days || [];
  }, [activeAccountId, accounts]);

  const metrics = useMemo(
    () => activeDays.map((d) => calcDay(d, settings.vatRate)),
    [activeDays, settings.vatRate]
  );
  const sum = useMemo(
    () => calcSummary(activeDays, settings.vatRate),
    [activeDays, settings.vatRate]
  );

  // ─── Best-performing days ───
  const bestDays = useMemo(() => {
    let bestCtrIdx = -1,
      bestCtrVal = -1;
    let bestCostLpvIdx = -1,
      bestCostLpvVal = Infinity;
    let bestRegRateIdx = -1,
      bestRegRateVal = -1;

    activeDays.forEach((day, i) => {
      const active = day.adSpend > 0 || day.revenue > 0 || day.purchases > 0;
      if (!active) return;
      const m = metrics[i];

      if (m.ctr > bestCtrVal) {
        bestCtrVal = m.ctr;
        bestCtrIdx = i;
      }
      if (day.landingPageViews > 0 && day.adSpend > 0) {
        const cpv = day.adSpend / day.landingPageViews;
        if (cpv < bestCostLpvVal) {
          bestCostLpvVal = cpv;
          bestCostLpvIdx = i;
        }
      }
      if (m.regRate > bestRegRateVal) {
        bestRegRateVal = m.regRate;
        bestRegRateIdx = i;
      }
    });

    return {
      bestCtrIdx,
      bestCostLpvIdx,
      bestCostLpvVal:
        bestCostLpvIdx >= 0
          ? activeDays[bestCostLpvIdx].adSpend /
            activeDays[bestCostLpvIdx].landingPageViews
          : 0,
      bestRegRateIdx,
    };
  }, [activeDays, metrics]);

  // ─── Ad leaderboard ───
  const adLeaderboard = useMemo(
    () => calcAdLeaderboard(activeDays, settings.campaignGoal),
    [activeDays, settings.campaignGoal]
  );

  // ─── Weekly / Monthly aggregated rows ───
  const weeklyRows = useMemo(() => {
    if (timeView !== "weekly") return [];
    return groupByWeek(activeDays).map((w) => ({
      label: w.label,
      day: w.data,
      metrics: calcDay(w.data, settings.vatRate),
    }));
  }, [timeView, activeDays, settings.vatRate]);

  const monthlyRow = useMemo(() => {
    if (timeView !== "monthly") return null;
    const agg = aggregateDays(activeDays);
    return { label: "סה״כ חודשי", day: agg, metrics: calcDay(agg, settings.vatRate) };
  }, [timeView, activeDays, settings.vatRate]);

  // ─── Handlers ───
  const upDay = useCallback(
    (i: number, field: keyof DayData, val: number | string) => {
      if (!activeAccountId || activeAccountId === "summary") return;
      setAccounts((prev) =>
        prev.map((acc) =>
          acc.id === activeAccountId
            ? {
                ...acc,
                days: acc.days.map((d, j) =>
                  j === i ? { ...d, [field]: val } : d
                ),
              }
            : acc
        )
      );
    },
    [activeAccountId]
  );

  const upSet = useCallback(
    <K extends keyof Settings>(k: K, v: Settings[K]) =>
      setSettings((p) => ({ ...p, [k]: v })),
    []
  );

  const chMonth = useCallback((month: number, year: number) => {
    const hasData = accounts.some((acc) =>
      acc.days.some((d) => d.adSpend > 0 || d.revenue > 0 || d.purchases > 0)
    );
    const doChange = () => {
      setSettings((p) => ({ ...p, month, year }));
      setAccounts((prev) =>
        prev.map((acc) => ({ ...acc, days: generateEmptyDays(month, year) }))
      );
    };
    if (hasData) {
      setConfirmDialog({
        title: "שינוי חודש",
        message: "שינוי חודש ימחק את כל הנתונים הקיימים. להמשיך?",
        onConfirm: () => { doChange(); setConfirmDialog(null); },
        danger: true,
      });
    } else {
      doChange();
    }
  }, [accounts]);

  const loadDemo = useCallback(() => {
    setConfirmDialog({
      title: "טעינת דאטה לדוגמה",
      message: "פעולה זו תחליף את כל הנתונים הקיימים בדאטה לדוגמה. להמשיך?",
      onConfirm: () => {
        setAccounts((prev) =>
          prev.map((acc, idx) => ({
            ...acc,
            days: generateDemo(settings.month, settings.year, idx),
          }))
        );
        setSettings((p) => ({ ...p, businessName: p.businessName || "העסק שלי" }));
        setConfirmDialog(null);
      },
    });
  }, [settings.month, settings.year]);

  const clearAll = useCallback(() => {
    setConfirmDialog({
      title: "ניקוי נתונים",
      message: activeAccountId === "summary"
        ? "למחוק את כל הנתונים בכל החשבונות?"
        : "למחוק את כל הנתונים בחשבון הנוכחי?",
      onConfirm: () => {
        if (activeAccountId === "summary") {
          setAccounts((prev) =>
            prev.map((acc) => ({
              ...acc,
              days: generateEmptyDays(settings.month, settings.year),
            }))
          );
        } else {
          setAccounts((prev) =>
            prev.map((acc) =>
              acc.id === activeAccountId
                ? { ...acc, days: generateEmptyDays(settings.month, settings.year) }
                : acc
            )
          );
        }
        setConfirmDialog(null);
      },
      danger: true,
    });
  }, [activeAccountId, settings.month, settings.year]);

  const addAccount = useCallback(() => {
    const newId = String(Date.now());
    setAccounts((prev) => [
      ...prev,
      {
        id: newId,
        name: `חשבון ${prev.length + 1}`,
        days: generateEmptyDays(settings.month, settings.year),
      },
    ]);
    setActiveAccountId(newId);
  }, [settings.month, settings.year]);

  const removeAccount = useCallback(
    (id: string) => {
      const accName = accounts.find((a) => a.id === id)?.name || "חשבון";
      setConfirmDialog({
        title: "מחיקת חשבון",
        message: `למחוק את "${accName}" וכל הנתונים שלו?`,
        onConfirm: () => {
          setAccounts((prev) => {
            if (prev.length <= 1) return prev;
            return prev.filter((a) => a.id !== id);
          });
          if (activeAccountId === id) setActiveAccountId("summary");
          setConfirmDialog(null);
        },
        danger: true,
      });
    },
    [activeAccountId, accounts]
  );

  const renameAccount = useCallback((id: string, name: string) => {
    setAccounts((prev) =>
      prev.map((acc) => (acc.id === id ? { ...acc, name } : acc))
    );
  }, []);

  const parseDaysIntoEmpty = useCallback(
    (days: DayData[], mo: number, yr: number) => {
      const empty = generateEmptyDays(mo, yr);
      for (const d of days) {
        const num = parseInt(d.date?.split(".")[0]);
        if (num >= 1 && num <= empty.length) {
          empty[num - 1] = {
            date: d.date || `${num}.${mo}`,
            adSpend: d.adSpend || 0,
            impressions: d.impressions || 0,
            uniqueClicks: d.uniqueClicks || 0,
            landingPageViews: d.landingPageViews || 0,
            registrations: d.registrations || 0,
            purchases: d.purchases || 0,
            orderBumps: d.orderBumps || 0,
            upsells: d.upsells || 0,
            revenue: d.revenue || 0,
            productCost: d.productCost || 0,
            commissions: d.commissions || 0,
            adName: d.adName || "",
            notes: d.notes || "",
          };
        }
      }
      return empty;
    },
    []
  );

  const doImport = useCallback(() => {
    try {
      const data = JSON.parse(jsonIn);
      if (data.settings) setSettings((p) => ({ ...p, ...data.settings }));
      const mo = data.settings?.month || settings.month;
      const yr = data.settings?.year || settings.year;

      // Format 1: Multi-account (full accounts.json from Manus)
      if (data.accounts && Array.isArray(data.accounts)) {
        let importedCount = 0;
        setAccounts((prev) => {
          const updated = [...prev];
          for (const fileAcc of data.accounts) {
            if (!fileAcc.days?.length) continue;
            const idx = updated.findIndex((a) => a.id === fileAcc.id);
            const parsedDays = parseDaysIntoEmpty(fileAcc.days, mo, yr);
            if (idx >= 0) {
              updated[idx] = {
                ...updated[idx],
                name: fileAcc.name || updated[idx].name,
                days: parsedDays,
              };
            } else {
              updated.push({
                id: fileAcc.id || String(Date.now()),
                name: fileAcc.name || `חשבון ${updated.length + 1}`,
                days: parsedDays,
              });
            }
            importedCount++;
          }
          return updated;
        });
        setImportMsg({
          ok: true,
          msg: `יובאו ${data.accounts.length} חשבונות (${importedCount} עם נתונים)`,
        });
        setJsonIn("");
        return;
      }

      // Format 2: Single account (legacy or per-account)
      if (!data.days || !Array.isArray(data.days)) {
        setImportMsg({ ok: false, msg: 'חסר שדה "days" או "accounts"' });
        return;
      }
      const empty = parseDaysIntoEmpty(data.days, mo, yr);
      const targetId =
        data.accountId ||
        (activeAccountId !== "summary" ? activeAccountId : accounts[0]?.id);
      if (targetId) {
        setAccounts((prev) =>
          prev.map((acc) =>
            acc.id === targetId ? { ...acc, days: empty } : acc
          )
        );
      }
      const targetName =
        accounts.find((a) => a.id === targetId)?.name || "חשבון";
      setImportMsg({
        ok: true,
        msg: `יובאו ${data.days.length} ימים ל${targetName}`,
      });
      setJsonIn("");
    } catch {
      setImportMsg({ ok: false, msg: "JSON לא תקין" });
    }
  }, [jsonIn, settings.month, settings.year, activeAccountId, accounts, parseDaysIntoEmpty]);

  const doExport = useCallback(() => {
    if (activeAccountId === "summary") {
      // Export full multi-account format (Manus-compatible)
      const accsWithData = accounts.map((acc) => ({
        id: acc.id,
        name: acc.name,
        days: acc.days.filter(
          (d) => d.adSpend > 0 || d.revenue > 0 || d.purchases > 0
        ),
      }));
      return JSON.stringify(
        {
          settings: { ...settings },
          accounts: accsWithData,
          _lastUpdated: new Date().toISOString(),
          _updatedBy: "dashboard-export",
        },
        null,
        2
      );
    }
    // Export single account
    const act = (activeAccount?.days || []).filter(
      (d: DayData) => d.adSpend > 0 || d.revenue > 0 || d.purchases > 0
    );
    return JSON.stringify(
      {
        settings: { ...settings },
        accountId: activeAccountId,
        accountName: activeAccount?.name,
        days: act,
      },
      null,
      2
    );
  }, [accounts, activeAccount, activeAccountId, settings]);

  const clip = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const profitColor =
    sum.totalNetProfit > 0 ? "green" : sum.totalNetProfit < 0 ? "red" : "blue";
  const roasColor =
    sum.overallRoas >= settings.breakEvenRoas
      ? "green"
      : sum.overallRoas > 0
        ? "amber"
        : "red";

  const inputCls =
    "rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm text-white outline-none transition-all focus:border-blue-500/40 focus:bg-white/[0.06]";
  const numInputCls = `${inputCls} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  return (
    <main className="relative min-h-screen bg-[#060609] text-white" dir="rtl">
      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title || ""}
        message={confirmDialog?.message || ""}
        onConfirm={confirmDialog?.onConfirm || (() => {})}
        onCancel={() => setConfirmDialog(null)}
        danger={confirmDialog?.danger}
      />
      {/* Ambient background orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full opacity-100"
          style={{
            background:
              "radial-gradient(circle, rgba(59,130,246,0.04) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute -bottom-40 right-1/4 h-[500px] w-[500px] rounded-full opacity-100"
          style={{
            background:
              "radial-gradient(circle, rgba(139,92,246,0.03) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-100"
          style={{
            background:
              "radial-gradient(circle, rgba(6,182,212,0.02) 0%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-[1700px] px-4 py-8 md:px-8 md:py-12">
        {/* HEADER */}
        <header className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-400/60">
              Meta Ads Dashboard
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, #60a5fa, #a78bfa, #06b6d4)",
                }}
              >
                אצבע על הדופק
              </span>
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-gray-500">
              דשבורד מעקב Meta Ads + משפך המרות + רווחיות — למילוי יומי ע״י סוכן
              AI
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={loadDemo}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-gray-300 transition-all hover:border-white/[0.15] hover:bg-white/[0.07]"
            >
              טען דאטה לדוגמה
            </button>
            <button
              onClick={clearAll}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-gray-300 transition-all hover:border-white/[0.15] hover:bg-white/[0.07]"
            >
              נקה הכל
            </button>
            <button
              onClick={() => setShowAI(!showAI)}
              className={`rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${
                showAI
                  ? "border-blue-500/40 bg-blue-500/15 text-blue-300 shadow-lg shadow-blue-500/10"
                  : "border-white/[0.08] bg-white/[0.03] text-gray-300 hover:border-blue-500/30 hover:bg-blue-500/[0.06]"
              }`}
            >
              🤖 ממשק סוכן AI
            </button>
          </div>
        </header>

        {/* SETTINGS */}
        <div className={`mb-8 flex flex-wrap items-center gap-4 ${GLASS} p-4 md:gap-6 md:p-5`}>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            שם העסק
            <input
              type="text"
              value={settings.businessName}
              onChange={(e) => upSet("businessName", e.target.value)}
              className={inputCls}
              placeholder="הכנס שם..."
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            חודש
            <select
              value={settings.month}
              onChange={(e) => chMonth(parseInt(e.target.value), settings.year)}
              className={inputCls}
            >
              {MONTHS_HE.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            שנה
            <input
              type="number"
              value={settings.year}
              onChange={(e) =>
                chMonth(settings.month, parseInt(e.target.value) || 2026)
              }
              className={`w-20 ${numInputCls}`}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            מע״מ %
            <input
              type="number"
              value={settings.vatRate}
              onChange={(e) =>
                upSet("vatRate", parseFloat(e.target.value) || 18)
              }
              className={`w-14 ${numInputCls}`}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            ROAS איזון
            <input
              type="number"
              step="0.1"
              value={settings.breakEvenRoas}
              onChange={(e) =>
                upSet("breakEvenRoas", parseFloat(e.target.value) || 2)
              }
              className={`w-16 ${numInputCls}`}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            מטרת קמפיין
            <select
              value={settings.campaignGoal}
              onChange={(e) => upSet("campaignGoal", e.target.value as CampaignGoal)}
              className={inputCls}
            >
              {(Object.entries(CAMPAIGN_GOAL_LABELS) as [CampaignGoal, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
        </div>

        {/* AD LEADERBOARD — Winning Ad */}
        {adLeaderboard.length > 0 && (
          <div className={`mb-8 ${GLASS} p-5 md:p-6`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                🏆 מודעה ווינרית (לפי {CAMPAIGN_GOAL_LABELS[settings.campaignGoal]})
              </h2>
              <span className="rounded-lg bg-white/[0.04] px-3 py-1 text-xs font-medium text-gray-400">
                {adLeaderboard.length} מודעות
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {adLeaderboard.slice(0, 3).map((ad, i) => {
                const medals = ["🥇", "🥈", "🥉"];
                const borderColors = ["border-amber-500/30", "border-gray-400/20", "border-orange-700/20"];
                const bgColors = ["bg-amber-500/[0.06]", "bg-white/[0.02]", "bg-white/[0.02]"];
                return (
                  <div key={ad.adName} className={`rounded-xl border ${borderColors[i]} ${bgColors[i]} p-4`}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-lg">{medals[i]}</span>
                      <span className="text-sm font-bold text-white">{ad.adName}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">{CAMPAIGN_GOAL_LABELS[settings.campaignGoal]}: </span>
                        <span className="font-bold text-white">{settings.campaignGoal === "revenue" ? fmtCurrency(ad.results) : fmtN(ad.results)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">הוצאה: </span>
                        <span className="font-bold text-white">{fmtCurrency(ad.spend)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">ROAS: </span>
                        <span className={`font-bold ${ad.roas >= settings.breakEvenRoas ? "text-emerald-400" : "text-red-400"}`}>{fmtRoas(ad.roas)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">CPA: </span>
                        <span className="font-bold text-white">{fmtDec(ad.cpa)}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-gray-500">{ad.days} ימים פעילים</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ACCOUNT TABS */}
        <div className={`mb-8 overflow-hidden ${GLASS} p-1.5`}>
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveAccountId("summary")}
              className={`flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                activeAccountId === "summary"
                  ? "bg-blue-500/20 text-blue-300 shadow-sm shadow-blue-500/10"
                  : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]"
              }`}
            >
              📊 סיכום כולל
            </button>
            <div className="h-6 w-px flex-shrink-0 bg-white/[0.06]" />
            {accounts.map((acc) => {
              const accSum = calcSummary(acc.days, settings.vatRate);
              return (
                <button
                  key={acc.id}
                  onClick={() => setActiveAccountId(acc.id)}
                  className={`group relative flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                    activeAccountId === acc.id
                      ? "bg-purple-500/20 text-purple-300 shadow-sm shadow-purple-500/10"
                      : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]"
                  }`}
                >
                  <span>{acc.name}</span>
                  {accSum.totalSpend > 0 && (
                    <span className="mr-2 text-[10px] text-gray-500">
                      {fmtCurrency(accSum.totalSpend)}
                    </span>
                  )}
                  {accounts.length > 1 && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAccount(acc.id);
                      }}
                      className="absolute -left-1 -top-1 hidden h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-red-500/80 text-[8px] text-white group-hover:flex"
                    >
                      ×
                    </span>
                  )}
                </button>
              );
            })}
            <button
              onClick={addAccount}
              className="flex-shrink-0 rounded-xl px-3 py-2.5 text-lg text-gray-500 transition-all hover:bg-white/[0.04] hover:text-gray-300"
            >
              +
            </button>
          </div>
        </div>

        {/* ACCOUNT NAME (editable when specific account selected) */}
        {activeAccount && (
          <div className={`-mt-4 mb-8 flex items-center gap-3 px-2`}>
            <span className="text-xs text-gray-500">שם חשבון:</span>
            <input
              type="text"
              value={activeAccount.name}
              onChange={(e) =>
                renameAccount(activeAccountId, e.target.value)
              }
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-sm text-white outline-none transition-all focus:border-purple-500/40"
            />
          </div>
        )}

        {/* PER-ACCOUNT BREAKDOWN (Summary tab only) */}
        {activeAccountId === "summary" && sum.activeDays > 0 && (
          <div className="mb-8">
            <h3 className="mb-4 text-lg font-bold text-white">
              פירוט לפי חשבון
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {accounts.map((acc) => {
                const accSum = calcSummary(acc.days, settings.vatRate);
                if (accSum.activeDays === 0) return null;
                return (
                  <div
                    key={acc.id}
                    onClick={() => setActiveAccountId(acc.id)}
                    className={`cursor-pointer ${GLASS} ${GLASS_HOVER} p-4`}
                  >
                    <div className="mb-1 text-sm font-medium text-gray-400">
                      {acc.name}
                    </div>
                    <div className="text-lg font-bold text-white">
                      {fmtCurrency(accSum.totalSpend)}
                    </div>
                    <div
                      className={`mt-1 text-sm font-semibold ${accSum.totalNetProfit > 0 ? "text-emerald-400" : accSum.totalNetProfit < 0 ? "text-red-400" : "text-gray-500"}`}
                    >
                      רווח: {fmtSigned(accSum.totalNetProfit)}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      ROAS: {fmtRoas(accSum.overallRoas)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* KPI CARDS — Row 1: Money */}
        <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
          <KPICard
            icon="💰"
            label="הוצאה כוללת"
            value={fmtCurrency(sum.totalSpend)}
            sub={`${sum.activeDays} ימים פעילים`}
            color="blue"
          />
          <KPICard
            icon="📈"
            label="הכנסה כוללת"
            value={fmtCurrency(sum.totalRevenue)}
            sub={`לפני מע״מ: ${fmtCurrency(sum.totalRevenueBeforeVat)}`}
            color="cyan"
          />
          <KPICard
            icon={sum.totalNetProfit >= 0 ? "✅" : "⚠️"}
            label="רווח נקי"
            value={fmtSigned(sum.totalNetProfit)}
            sub={`${sum.profitableDays} מתוך ${sum.activeDays} ימים ברווח`}
            color={profitColor}
          />
          <KPICard
            icon="🔄"
            label="ROAS"
            value={fmtRoas(sum.overallRoas)}
            sub={`איזון: ${fmtRoas(settings.breakEvenRoas)} · ROI: ${fmtPct(sum.overallRoi)}`}
            color={roasColor}
          />
        </div>
        {/* KPI CARDS — Row 2: Funnel */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
          <KPICard
            icon="📢"
            label="CTR (קליקים / חשיפות)"
            value={fmtPct(sum.avgCtr)}
            sub={`CPC: ${fmtDec(sum.avgCpc)} · CPM: ${fmtDec(sum.avgCpm)}`}
            color="purple"
          />
          <KPICard
            icon="📝"
            label="אחוז רישום"
            value={fmtPct(sum.avgRegRate)}
            sub={`${fmtN(sum.totalRegistrations)} מתוך ${fmtN(sum.totalLPV)} הגיעו`}
            color="cyan"
          />
          <KPICard
            icon="🛒"
            label="אחוז רכישה"
            value={fmtPct(sum.avgPurchaseRate)}
            sub={`${fmtN(sum.totalPurchases)} רכשו · AOV: ${fmtCurrency(sum.avgAov)}`}
            color="green"
          />
          <KPICard
            icon="🎯"
            label="CPA (עלות לרכישה)"
            value={fmtDec(sum.avgCpa)}
            sub={`OB: ${fmtPct(sum.avgObRate)} · אפסייל: ${fmtPct(sum.avgUpsellRate)}`}
            color="amber"
          />
        </div>

        {/* DAILY TREND CHART */}
        <DailyTrend days={activeDays} metrics={metrics} />

        {/* FUNNEL VIZ */}
        <div className={`mb-8 ${GLASS} p-5 md:p-7`}>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">משפך המרות מלא</h2>
            <span className="rounded-lg bg-white/[0.04] px-3 py-1 text-xs font-medium text-gray-400">
              איפה הצוואר בקבוק?
            </span>
          </div>
          <div className="flex flex-col gap-3">
            <FunnelStep
              step={1}
              label="חשיפות"
              value={sum.totalImpressions}
              maxValue={sum.totalImpressions}
              color="#3b82f6"
            />
            <FunnelStep
              step={2}
              label="קליקים יחודיים"
              value={sum.totalUniqueClicks}
              rate={`CTR ${fmtPct(sum.avgCtr)}`}
              maxValue={sum.totalImpressions}
              color="#8b5cf6"
            />
            <FunnelStep
              step={3}
              label="הגיעו לדף"
              value={sum.totalLPV}
              rate={fmtPct(sum.avgLpvRate)}
              maxValue={sum.totalImpressions}
              color="#a855f7"
            />
            <FunnelStep
              step={4}
              label="נרשמו"
              value={sum.totalRegistrations}
              rate={fmtPct(sum.avgRegRate)}
              maxValue={sum.totalImpressions}
              color="#06b6d4"
            />
            <FunnelStep
              step={5}
              label="רכשו"
              value={sum.totalPurchases}
              rate={fmtPct(sum.avgPurchaseRate)}
              maxValue={sum.totalImpressions}
              color="#22c55e"
            />
            <FunnelStep
              step={6}
              label="Order Bump"
              value={sum.totalOrderBumps}
              rate={fmtPct(sum.avgObRate)}
              maxValue={sum.totalImpressions}
              color="#f59e0b"
            />
            <FunnelStep
              step={7}
              label="Upsell"
              value={sum.totalUpsells}
              rate={fmtPct(sum.avgUpsellRate)}
              maxValue={sum.totalImpressions}
              color="#ef4444"
            />
          </div>
        </div>

        {/* AI PANEL */}
        {showAI && (
          <div className={`mb-8 overflow-hidden ${GLASS} border-blue-500/15`}>
            <div className="flex border-b border-white/[0.06]">
              {(
                [
                  { key: "import", label: "ייבוא JSON", icon: "📥" },
                  { key: "export", label: "ייצוא JSON", icon: "📤" },
                  { key: "prompt", label: "פרומפט לסוכן AI", icon: "🤖" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setAiTab(t.key)}
                  className={`flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium transition-all ${
                    aiTab === t.key
                      ? "border-b-2 border-blue-500 bg-blue-500/[0.08] text-blue-300"
                      : "text-gray-500 hover:bg-white/[0.03] hover:text-gray-300"
                  }`}
                >
                  <span className="text-xs">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="p-5 md:p-7">
              {aiTab === "import" && (
                <div>
                  <p className="mb-3 text-sm text-gray-400">
                    הדבק את ה-JSON שסוכן ה-AI הפיק. הטבלה תתמלא אוטומטית.
                  </p>
                  <textarea
                    value={jsonIn}
                    onChange={(e) => {
                      setJsonIn(e.target.value);
                      setImportMsg(null);
                    }}
                    className="h-48 w-full rounded-xl border border-white/[0.08] bg-[#0a0a0f] p-4 font-mono text-sm text-gray-300 outline-none transition-all focus:border-blue-500/40"
                    placeholder='{"settings":{...},"days":[...]}'
                    dir="ltr"
                  />
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={doImport}
                      disabled={!jsonIn.trim()}
                      className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 hover:shadow-blue-500/30 disabled:opacity-40 disabled:shadow-none"
                    >
                      ייבא נתונים
                    </button>
                    {importMsg && (
                      <span
                        className={`text-sm font-medium ${importMsg.ok ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {importMsg.msg}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {aiTab === "export" && (
                <div>
                  <p className="mb-3 text-sm text-gray-400">
                    נתונים נוכחיים כ-JSON (רק ימים עם נתונים).
                  </p>
                  <pre
                    className="max-h-64 overflow-auto rounded-xl border border-white/[0.08] bg-[#0a0a0f] p-4 font-mono text-sm text-gray-300"
                    dir="ltr"
                  >
                    {doExport()}
                  </pre>
                  <button
                    onClick={() => clip(doExport())}
                    className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500"
                  >
                    {copied ? "הועתק! ✓" : "העתק JSON"}
                  </button>
                </div>
              )}
              {aiTab === "prompt" && (
                <div>
                  <p className="mb-3 text-sm text-gray-400">
                    העתק את הפרומפט ותן לסוכן AI. הוא ידע לאסוף מ-Meta Ads
                    Manager + CRM ולפרמט JSON.
                  </p>
                  <pre
                    className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-white/[0.08] bg-[#0a0a0f] p-5 font-mono text-sm leading-relaxed text-gray-300"
                    dir="rtl"
                  >
                    {getPromptTemplate(settings, accounts)}
                  </pre>
                  <button
                    onClick={() => clip(getPromptTemplate(settings, accounts))}
                    className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500"
                  >
                    {copied ? "הועתק! ✓" : "העתק פרומפט"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* DAILY TABLE — Light theme for readability */}
        <div className="mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl shadow-black/5">
          <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-7">
            <h2 className="text-xl font-bold text-gray-900">
              {activeAccountId === "summary"
                ? "סיכום כולל"
                : activeAccount?.name || "מעקב"}{" "}
              — {MONTHS_HE[settings.month - 1]} {settings.year}
            </h2>
            <div className="flex items-center gap-4">
              {/* Time period toggle */}
              <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
                {(
                  [
                    { key: "daily" as const, label: "יומי" },
                    { key: "weekly" as const, label: "שבועי" },
                    { key: "monthly" as const, label: "חודשי" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTimeView(t.key)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                      timeView === t.key
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Legend */}
              <div className="hidden items-center gap-3 text-xs md:flex">
                <span className="flex items-center gap-1.5 text-gray-400">
                  <span className="inline-block h-2 w-4 rounded-sm bg-gray-200" />
                  קלט
                </span>
                <span className="flex items-center gap-1.5 text-gray-400">
                  <span className="inline-block h-2 w-4 rounded-sm bg-violet-100" />
                  מחושב אוטומטית
                </span>
                <span className="flex items-center gap-1.5 text-blue-500">
                  <span className="inline-block h-2 w-4 rounded-sm bg-blue-100 ring-2 ring-blue-400" />
                  היום
                </span>
                <span className="flex items-center gap-1.5 text-amber-600">
                  <span className="inline-block h-2 w-4 rounded-sm bg-amber-50 ring-2 ring-amber-400" />
                  שיא
                </span>
              </div>
            </div>
          </div>

          {/* Top Performers Banner */}
          {sum.activeDays > 0 &&
            (bestDays.bestCtrIdx >= 0 ||
              bestDays.bestCostLpvIdx >= 0 ||
              bestDays.bestRegRateIdx >= 0) && (
              <div className="border-b border-gray-100 bg-gradient-to-l from-amber-50/60 via-white to-white px-5 py-3 md:px-7">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-xs font-bold text-gray-600">
                    🏆 שיאי החודש:
                  </span>
                  {bestDays.bestCtrIdx >= 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                      🎯 CTR הכי גבוה — יום{" "}
                      {activeDays[bestDays.bestCtrIdx].date} (
                      {fmtPct(metrics[bestDays.bestCtrIdx].ctr)})
                    </span>
                  )}
                  {bestDays.bestCostLpvIdx >= 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      💰 עלות/צפייה הכי נמוכה — יום{" "}
                      {activeDays[bestDays.bestCostLpvIdx].date} (₪
                      {bestDays.bestCostLpvVal.toFixed(1)})
                    </span>
                  )}
                  {bestDays.bestRegRateIdx >= 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                      📝 המרה בדף הכי גבוהה — יום{" "}
                      {activeDays[bestDays.bestRegRateIdx].date} (
                      {fmtPct(metrics[bestDays.bestRegRateIdx].regRate)})
                    </span>
                  )}
                </div>
              </div>
            )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1800px]">
              <thead>
                {/* Group headers */}
                <tr className="border-b border-gray-200">
                  <th colSpan={3} className="bg-gray-50 px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500">זיהוי</th>
                  <th
                    colSpan={4}
                    className="bg-blue-50/70 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-blue-600/70"
                  >
                    Meta Ads Manager
                  </th>
                  <th
                    colSpan={4}
                    className="bg-violet-50/70 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-violet-600/70"
                  >
                    משפך (CRM / אתר)
                  </th>
                  <th
                    colSpan={3}
                    className="bg-emerald-50/70 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-emerald-600/70"
                  >
                    כספים
                  </th>
                  <th
                    colSpan={11}
                    className="bg-purple-50/70 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-purple-600/70"
                  >
                    מדדי ביצוע (אוטומטי)
                  </th>
                </tr>
                {/* Column headers */}
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="sticky right-0 z-10 bg-gray-50 px-2.5 py-3 text-right text-xs font-bold text-gray-600">
                    תאריך
                  </th>
                  <th className="bg-gray-50 px-2 py-3 text-right text-xs font-bold text-gray-600">שם מודעה</th>
                  <th className="bg-gray-50 px-2 py-3 text-right text-xs font-bold text-gray-600">הערות</th>
                  {/* Meta */}
                  {["הוצאה ₪", "חשיפות", "קליקים יחודיים", "הגיעו לדף"].map(
                    (h) => (
                      <th
                        key={h}
                        className="bg-blue-50/30 px-2 py-3 text-right text-xs font-bold text-gray-600"
                      >
                        {h}
                      </th>
                    )
                  )}
                  {/* CRM */}
                  {["נרשמו", "רכשו", "OB", "אפסייל"].map((h) => (
                    <th
                      key={h}
                      className="bg-violet-50/30 px-2 py-3 text-right text-xs font-bold text-gray-600"
                    >
                      {h}
                    </th>
                  ))}
                  {/* Financial */}
                  {["הכנסה ₪", "עלות ₪", "עמלות ₪"].map((h) => (
                    <th
                      key={h}
                      className="bg-emerald-50/30 px-2 py-3 text-right text-xs font-bold text-gray-600"
                    >
                      {h}
                    </th>
                  ))}
                  {/* Calculated */}
                  {[
                    "CTR %",
                    "CPC ₪",
                    "CPM ₪",
                    "% הגעה",
                    "% רישום",
                    "% רכישה",
                    "% OB",
                    "% אפסייל",
                    "CPA ₪",
                    "רווח נקי",
                    "ROAS",
                  ].map((h) => (
                    <th
                      key={h}
                      className="bg-purple-50/30 px-2 py-3 text-right text-xs font-bold text-gray-600"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {/* ─── DAILY VIEW (editable) ─── */}
                {timeView === "daily" && isEditable && activeDays.map((day, i) => {
                  const m = metrics[i];
                  const active =
                    day.adSpend > 0 || day.revenue > 0 || day.purchases > 0;
                  const dayNum = parseInt(day.date.split(".")[0]);
                  const now = new Date();
                  const isToday =
                    dayNum === now.getDate() &&
                    settings.month === now.getMonth() + 1 &&
                    settings.year === now.getFullYear();
                  const bg = isToday
                    ? "bg-blue-50"
                    : i % 2 === 0
                      ? "bg-white"
                      : "bg-gray-50/60";
                  const stickyBg = isToday
                    ? "bg-blue-50"
                    : i % 2 === 0
                      ? "bg-white"
                      : "bg-gray-50";
                  return (
                    <tr
                      key={i}
                      className={`border-b border-gray-100 ${bg} transition-colors hover:bg-blue-50/50 ${isToday ? "ring-2 ring-inset ring-blue-400/60" : ""}`}
                    >
                      <td
                        className={`sticky right-0 z-10 ${stickyBg} px-2.5 py-1 text-right text-sm font-semibold ${isToday ? "text-blue-600" : active ? "text-gray-900" : "text-gray-400"}`}
                      >
                        <div className="flex items-center gap-1">
                          {isToday && (
                            <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                          )}
                          <span>{day.date}</span>
                          {bestDays.bestCtrIdx === i && (
                            <span className="inline-block rounded-full bg-amber-100 px-1 py-px text-[7px] font-bold leading-tight text-amber-700">
                              CTR
                            </span>
                          )}
                          {bestDays.bestCostLpvIdx === i && (
                            <span className="inline-block rounded-full bg-emerald-100 px-1 py-px text-[7px] font-bold leading-tight text-emerald-700">
                              CPV
                            </span>
                          )}
                          {bestDays.bestRegRateIdx === i && (
                            <span className="inline-block rounded-full bg-purple-100 px-1 py-px text-[7px] font-bold leading-tight text-purple-700">
                              CVR
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Ad name + Notes (near date) */}
                      <td className="px-0 py-0">
                        <TxtCell
                          value={day.adName}
                          onChange={(v) => upDay(i, "adName", v)}
                        />
                      </td>
                      <td className="px-0 py-0">
                        <TxtCell
                          value={day.notes}
                          onChange={(v) => upDay(i, "notes", v)}
                        />
                      </td>
                      {/* Meta inputs */}
                      <td className="px-0 py-0">
                        <NumCell
                          value={day.adSpend}
                          onChange={(v) => upDay(i, "adSpend", v)}
                        />
                      </td>
                      <td className="px-0 py-0">
                        <NumCell
                          value={day.impressions}
                          onChange={(v) => upDay(i, "impressions", v)}
                        />
                      </td>
                      <td className="px-0 py-0">
                        <NumCell
                          value={day.uniqueClicks}
                          onChange={(v) => upDay(i, "uniqueClicks", v)}
                        />
                      </td>
                      <td className="px-0 py-0">
                        <NumCell
                          value={day.landingPageViews}
                          onChange={(v) => upDay(i, "landingPageViews", v)}
                        />
                      </td>
                      {/* CRM inputs */}
                      <td className="px-0 py-0">
                        <NumCell
                          value={day.registrations}
                          onChange={(v) => upDay(i, "registrations", v)}
                        />
                      </td>
                      <td className="px-0 py-0">
                        <NumCell
                          value={day.purchases}
                          onChange={(v) => upDay(i, "purchases", v)}
                        />
                      </td>
                      <td className="px-0 py-0">
                        <NumCell
                          value={day.orderBumps}
                          onChange={(v) => upDay(i, "orderBumps", v)}
                        />
                      </td>
                      <td className="px-0 py-0">
                        <NumCell
                          value={day.upsells}
                          onChange={(v) => upDay(i, "upsells", v)}
                        />
                      </td>
                      {/* Financial inputs */}
                      <td className="px-0 py-0">
                        <NumCell
                          value={day.revenue}
                          onChange={(v) => upDay(i, "revenue", v)}
                        />
                      </td>
                      <td className="px-0 py-0">
                        <NumCell
                          value={day.productCost}
                          onChange={(v) => upDay(i, "productCost", v)}
                        />
                      </td>
                      <td className="px-0 py-0">
                        <NumCell
                          value={day.commissions}
                          onChange={(v) => upDay(i, "commissions", v)}
                        />
                      </td>
                      {/* Calculated */}
                      <CC
                        v={m.ctr}
                        f={fmtPct}
                        best={bestDays.bestCtrIdx === i}
                      />
                      <CC v={m.cpc} f={fmtDec} />
                      <CC v={m.cpm} f={fmtDec} />
                      <CC
                        v={m.lpvRate}
                        f={fmtPct}
                        best={bestDays.bestCostLpvIdx === i}
                      />
                      <CC
                        v={m.regRate}
                        f={fmtPct}
                        best={bestDays.bestRegRateIdx === i}
                      />
                      <CC v={m.purchaseRate} f={fmtPct} />
                      <CC v={m.obRate} f={fmtPct} />
                      <CC v={m.upsellRate} f={fmtPct} />
                      <CC v={m.cpa} f={fmtDec} />
                      <CC v={m.netProfit} f={fmtSigned} pos={m.netProfit > 0} />
                      <CC
                        v={m.roas}
                        f={fmtRoas}
                        pos={m.roas >= settings.breakEvenRoas}
                      />
                    </tr>
                  );
                })}

                {/* ─── DAILY VIEW (read-only — summary tab) ─── */}
                {timeView === "daily" && !isEditable && activeDays.map((day, i) => {
                  const m = metrics[i];
                  const active = day.adSpend > 0 || day.revenue > 0;
                  const bg = i % 2 === 0 ? "bg-white" : "bg-gray-50/60";
                  const stickyBg = i % 2 === 0 ? "bg-white" : "bg-gray-50";
                  return (
                    <tr key={i} className={`border-b border-gray-100 ${bg} transition-colors hover:bg-blue-50/50`}>
                      <td className={`sticky right-0 z-10 ${stickyBg} px-2.5 py-2 text-right text-sm font-semibold ${active ? "text-gray-900" : "text-gray-400"}`}>
                        {day.date}
                      </td>
                      <StaticCell value="" />
                      <StaticCell value="" />
                      <StaticCell value={day.adSpend ? fmtCurrency(day.adSpend) : ""} />
                      <StaticCell value={day.impressions ? fmtN(day.impressions) : ""} />
                      <StaticCell value={day.uniqueClicks ? fmtN(day.uniqueClicks) : ""} />
                      <StaticCell value={day.landingPageViews ? fmtN(day.landingPageViews) : ""} />
                      <StaticCell value={day.registrations ? fmtN(day.registrations) : ""} />
                      <StaticCell value={day.purchases ? fmtN(day.purchases) : ""} />
                      <StaticCell value={day.orderBumps ? fmtN(day.orderBumps) : ""} />
                      <StaticCell value={day.upsells ? fmtN(day.upsells) : ""} />
                      <StaticCell value={day.revenue ? fmtCurrency(day.revenue) : ""} />
                      <StaticCell value={day.productCost ? fmtCurrency(day.productCost) : ""} />
                      <StaticCell value={day.commissions ? fmtCurrency(day.commissions) : ""} />
                      <CC v={m.ctr} f={fmtPct} />
                      <CC v={m.cpc} f={fmtDec} />
                      <CC v={m.cpm} f={fmtDec} />
                      <CC v={m.lpvRate} f={fmtPct} />
                      <CC v={m.regRate} f={fmtPct} />
                      <CC v={m.purchaseRate} f={fmtPct} />
                      <CC v={m.obRate} f={fmtPct} />
                      <CC v={m.upsellRate} f={fmtPct} />
                      <CC v={m.cpa} f={fmtDec} />
                      <CC v={m.netProfit} f={fmtSigned} pos={m.netProfit > 0} />
                      <CC v={m.roas} f={fmtRoas} pos={m.roas >= settings.breakEvenRoas} />
                      <td className="px-2.5 py-2 text-right text-xs text-gray-400">—</td>
                    </tr>
                  );
                })}

                {/* ─── WEEKLY VIEW ─── */}
                {timeView === "weekly" && weeklyRows.map((row, i) => {
                  const d = row.day;
                  const m = row.metrics;
                  const bg = i % 2 === 0 ? "bg-white" : "bg-gray-50/60";
                  const stickyBg = i % 2 === 0 ? "bg-white" : "bg-gray-50";
                  return (
                    <tr key={i} className={`border-b border-gray-100 ${bg} transition-colors hover:bg-blue-50/50`}>
                      <td className={`sticky right-0 z-10 ${stickyBg} px-2.5 py-3 text-right text-sm font-bold text-gray-900`}>
                        {row.label}
                      </td>
                      <StaticCell value="" />
                      <StaticCell value="" />
                      <StaticCell value={fmtCurrency(d.adSpend)} />
                      <StaticCell value={fmtN(d.impressions)} />
                      <StaticCell value={fmtN(d.uniqueClicks)} />
                      <StaticCell value={fmtN(d.landingPageViews)} />
                      <StaticCell value={fmtN(d.registrations)} />
                      <StaticCell value={fmtN(d.purchases)} />
                      <StaticCell value={fmtN(d.orderBumps)} />
                      <StaticCell value={fmtN(d.upsells)} />
                      <StaticCell value={fmtCurrency(d.revenue)} />
                      <StaticCell value={fmtCurrency(d.productCost)} />
                      <StaticCell value={fmtCurrency(d.commissions)} />
                      <CC v={m.ctr} f={fmtPct} />
                      <CC v={m.cpc} f={fmtDec} />
                      <CC v={m.cpm} f={fmtDec} />
                      <CC v={m.lpvRate} f={fmtPct} />
                      <CC v={m.regRate} f={fmtPct} />
                      <CC v={m.purchaseRate} f={fmtPct} />
                      <CC v={m.obRate} f={fmtPct} />
                      <CC v={m.upsellRate} f={fmtPct} />
                      <CC v={m.cpa} f={fmtDec} />
                      <CC v={m.netProfit} f={fmtSigned} pos={m.netProfit > 0} />
                      <CC v={m.roas} f={fmtRoas} pos={m.roas >= settings.breakEvenRoas} />
                    </tr>
                  );
                })}

                {/* ─── MONTHLY VIEW ─── */}
                {timeView === "monthly" && monthlyRow && (() => {
                  const d = monthlyRow.day;
                  const m = monthlyRow.metrics;
                  return (
                    <tr className="border-b border-gray-100 bg-white transition-colors hover:bg-blue-50/50">
                      <td className="sticky right-0 z-10 bg-white px-2.5 py-3 text-right text-sm font-bold text-gray-900">
                        {monthlyRow.label}
                      </td>
                      <StaticCell value="" />
                      <StaticCell value="" />
                      <StaticCell value={fmtCurrency(d.adSpend)} />
                      <StaticCell value={fmtN(d.impressions)} />
                      <StaticCell value={fmtN(d.uniqueClicks)} />
                      <StaticCell value={fmtN(d.landingPageViews)} />
                      <StaticCell value={fmtN(d.registrations)} />
                      <StaticCell value={fmtN(d.purchases)} />
                      <StaticCell value={fmtN(d.orderBumps)} />
                      <StaticCell value={fmtN(d.upsells)} />
                      <StaticCell value={fmtCurrency(d.revenue)} />
                      <StaticCell value={fmtCurrency(d.productCost)} />
                      <StaticCell value={fmtCurrency(d.commissions)} />
                      <CC v={m.ctr} f={fmtPct} />
                      <CC v={m.cpc} f={fmtDec} />
                      <CC v={m.cpm} f={fmtDec} />
                      <CC v={m.lpvRate} f={fmtPct} />
                      <CC v={m.regRate} f={fmtPct} />
                      <CC v={m.purchaseRate} f={fmtPct} />
                      <CC v={m.obRate} f={fmtPct} />
                      <CC v={m.upsellRate} f={fmtPct} />
                      <CC v={m.cpa} f={fmtDec} />
                      <CC v={m.netProfit} f={fmtSigned} pos={m.netProfit > 0} />
                      <CC v={m.roas} f={fmtRoas} pos={m.roas >= settings.breakEvenRoas} />
                      <td className="px-2.5 py-3 text-right text-xs text-gray-400">—</td>
                    </tr>
                  );
                })()}

                {/* TOTALS */}
                <tr className="border-t-2 border-blue-300 bg-blue-50 font-bold">
                  <td className="sticky right-0 z-10 bg-blue-50 px-2.5 py-3.5 text-right text-sm font-extrabold text-blue-700">
                    סה״כ
                  </td>
                  <td className="bg-blue-50 px-2.5 py-3.5 text-right text-xs text-gray-400">—</td>
                  <td className="bg-blue-50 px-2.5 py-3.5 text-right text-xs text-gray-400">—</td>
                  <td className="px-2.5 py-3.5 text-left text-sm font-bold text-gray-900">
                    {fmtCurrency(sum.totalSpend)}
                  </td>
                  <td className="px-2.5 py-3.5 text-left text-sm font-bold text-gray-900">
                    {fmtN(sum.totalImpressions)}
                  </td>
                  <td className="px-2.5 py-3.5 text-left text-sm font-bold text-gray-900">
                    {fmtN(sum.totalUniqueClicks)}
                  </td>
                  <td className="px-2.5 py-3.5 text-left text-sm font-bold text-gray-900">
                    {fmtN(sum.totalLPV)}
                  </td>
                  <td className="px-2.5 py-3.5 text-left text-sm font-bold text-gray-900">
                    {fmtN(sum.totalRegistrations)}
                  </td>
                  <td className="px-2.5 py-3.5 text-left text-sm font-bold text-gray-900">
                    {fmtN(sum.totalPurchases)}
                  </td>
                  <td className="px-2.5 py-3.5 text-left text-sm font-bold text-gray-900">
                    {fmtN(sum.totalOrderBumps)}
                  </td>
                  <td className="px-2.5 py-3.5 text-left text-sm font-bold text-gray-900">
                    {fmtN(sum.totalUpsells)}
                  </td>
                  <td className="px-2.5 py-3.5 text-left text-sm font-bold text-gray-900">
                    {fmtCurrency(sum.totalRevenue)}
                  </td>
                  <td className="px-2.5 py-3.5 text-left text-sm font-bold text-gray-900">
                    {fmtCurrency(sum.totalProductCost)}
                  </td>
                  <td className="px-2.5 py-3.5 text-left text-sm font-bold text-gray-900">
                    {fmtCurrency(sum.totalCommissions)}
                  </td>
                  <CC v={sum.avgCtr} f={fmtPct} />
                  <CC v={sum.avgCpc} f={fmtDec} />
                  <CC v={sum.avgCpm} f={fmtDec} />
                  <CC v={sum.avgLpvRate} f={fmtPct} />
                  <CC v={sum.avgRegRate} f={fmtPct} />
                  <CC v={sum.avgPurchaseRate} f={fmtPct} />
                  <CC v={sum.avgObRate} f={fmtPct} />
                  <CC v={sum.avgUpsellRate} f={fmtPct} />
                  <CC v={sum.avgCpa} f={fmtDec} />
                  <CC
                    v={sum.totalNetProfit}
                    f={fmtSigned}
                    pos={sum.totalNetProfit > 0}
                  />
                  <CC
                    v={sum.overallRoas}
                    f={fmtRoas}
                    pos={sum.overallRoas >= settings.breakEvenRoas}
                  />
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* DIAGNOSTICS */}
        {sum.activeDays > 0 && (
          <div className={`mb-8 ${GLASS} p-5 md:p-7`}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                אבחון אוטומטי — איפה הבעיה?
              </h2>
              <span className="rounded-lg bg-white/[0.04] px-3 py-1 text-xs font-medium text-gray-400">
                {sum.activeDays} ימים נבדקו
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <DiagCard
                icon="📢"
                label="מודעה (CTR)"
                value={
                  sum.avgCtr >= 1.5
                    ? `CTR ${fmtPct(sum.avgCtr)} — תקין`
                    : `CTR ${fmtPct(sum.avgCtr)} — נמוך!`
                }
                isGood={sum.avgCtr >= 1.5}
                detail={
                  sum.avgCtr >= 1.5
                    ? "המודעה מושכת קליקים"
                    : "שנה קריאייטיב / קהל יעד / כותרת"
                }
                current={sum.avgCtr}
                threshold={1.5}
                maxVal={5}
              />
              <DiagCard
                icon="📝"
                label="דף נחיתה (% רישום)"
                value={
                  sum.avgRegRate >= 8
                    ? `${fmtPct(sum.avgRegRate)} — תקין`
                    : `${fmtPct(sum.avgRegRate)} — נמוך!`
                }
                isGood={sum.avgRegRate >= 8}
                detail={
                  sum.avgRegRate >= 8
                    ? "הדף ממיר טוב"
                    : "שפר כותרת / הצעה / מהירות דף"
                }
                current={sum.avgRegRate}
                threshold={8}
                maxVal={30}
              />
              <DiagCard
                icon="🛒"
                label="מכירות (% רכישה מנרשמים)"
                value={
                  sum.avgPurchaseRate >= 20
                    ? `${fmtPct(sum.avgPurchaseRate)} — תקין`
                    : `${fmtPct(sum.avgPurchaseRate)} — נמוך!`
                }
                isGood={sum.avgPurchaseRate >= 20}
                detail={
                  sum.avgPurchaseRate >= 20
                    ? "תהליך המכירה עובד"
                    : "בדוק מחיר / הצעה / תהליך סגירה"
                }
                current={sum.avgPurchaseRate}
                threshold={20}
                maxVal={60}
              />

              {/* CPM diagnosis */}
              <DiagCard
                icon="💵"
                label="CPM (עלות ל-1,000 חשיפות)"
                value={
                  sum.avgCpm <= 40
                    ? `${fmtDec(sum.avgCpm)} — תקין`
                    : `${fmtDec(sum.avgCpm)} — יקר!`
                }
                isGood={sum.avgCpm <= 40}
                detail={
                  sum.avgCpm <= 40
                    ? "עלות חשיפות סבירה"
                    : "קהל יקר — צמצם טרגוט / נסה קהלות חדשים"
                }
                current={Math.min(sum.avgCpm, 100)}
                threshold={40}
                maxVal={100}
              />

              {/* Best/Worst day */}
              {sum.bestDay && (
                <div className="relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-4">
                  <div className="mb-1 flex items-center gap-2 text-xs font-medium text-emerald-400/70">
                    <span>🏆</span> היום הכי רווחי
                  </div>
                  <div className="text-xl font-bold text-emerald-400">
                    {sum.bestDay.date}
                  </div>
                  <div className="mt-1 text-sm text-emerald-300/60">
                    רווח: {fmtSigned(sum.bestDay.profit)}
                  </div>
                </div>
              )}

              {sum.worstDay && sum.worstDay.profit < 0 && (
                <div className="relative overflow-hidden rounded-2xl border border-red-500/15 bg-red-500/[0.04] p-4">
                  <div className="mb-1 flex items-center gap-2 text-xs font-medium text-red-400/70">
                    <span>⚠️</span> היום הכי מפסיד
                  </div>
                  <div className="text-xl font-bold text-red-400">
                    {sum.worstDay.date}
                  </div>
                  <div className="mt-1 text-sm text-red-300/60">
                    הפסד: {fmtSigned(sum.worstDay.profit)}
                  </div>
                </div>
              )}

              {/* ROAS status */}
              <DiagCard
                icon="🔄"
                label="ROAS"
                value={
                  sum.overallRoas >= settings.breakEvenRoas
                    ? "מעל נקודת איזון"
                    : "מתחת לנקודת איזון"
                }
                isGood={sum.overallRoas >= settings.breakEvenRoas}
                detail={`${fmtRoas(sum.overallRoas)} מתוך ${fmtRoas(settings.breakEvenRoas)} נדרש`}
                current={Math.min(sum.overallRoas, settings.breakEvenRoas * 2)}
                threshold={settings.breakEvenRoas}
                maxVal={settings.breakEvenRoas * 2}
              />
            </div>
          </div>
        )}


        <footer className="mt-10 flex items-center justify-center gap-2 text-xs text-gray-600">
          <div
            className="h-px flex-1 max-w-32"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
            }}
          />
          דשבורד ממומן v4.0 — אצבע על הדופק
          <div
            className="h-px flex-1 max-w-32"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
            }}
          />
        </footer>
      </div>
    </main>
  );
}
