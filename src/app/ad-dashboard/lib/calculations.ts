import type {
  DayData,
  DayMetrics,
  Summary,
  CampaignGoal,
  AdLeaderboardEntry,
  DiagnosticCard,
  ScaleLevel,
  MetricScale,
  SmartRecommendation,
} from "./types";
import { EMPTY_DAY } from "./constants";
import { fmtPct, fmtDec } from "./format";

// ═══════════════════════════════════════════════════════════
// Core Calculations
// ═══════════════════════════════════════════════════════════

export function safe(a: number, b: number): number {
  if (!b || !isFinite(a / b)) return 0;
  return a / b;
}

export function calcDay(day: DayData, vatRate: number): DayMetrics {
  const revBV = day.revenue / (1 + vatRate / 100);
  const net = revBV - day.adSpend;
  return {
    ctr: safe(day.uniqueClicks, day.impressions) * 100,
    cpc: safe(day.adSpend, day.uniqueClicks),
    cpm: safe(day.adSpend, day.impressions) * 1000,
    lpvRate: safe(day.landingPageViews, day.uniqueClicks) * 100,
    regRate: safe(day.registrations, day.landingPageViews) * 100,
    purchaseRate: safe(day.purchases, day.registrations) * 100,
    revenueBeforeVat: revBV,
    cpa: safe(day.adSpend, day.purchases),
    netProfit: net,
    roas: safe(day.revenue, day.adSpend),
  };
}

export function calcSummary(days: DayData[], vatRate: number): Summary {
  const active = days.filter(
    (d) => d.adSpend > 0 || d.revenue > 0 || d.purchases > 0
  );

  const t = days.reduce(
    (a, d) => ({
      spend: a.spend + d.adSpend,
      revenue: a.revenue + d.revenue,
      impressions: a.impressions + d.impressions,
      uniqueClicks: a.uniqueClicks + d.uniqueClicks,
      lpv: a.lpv + d.landingPageViews,
      reg: a.reg + d.registrations,
      purch: a.purch + d.purchases,
    }),
    {
      spend: 0,
      revenue: 0,
      impressions: 0,
      uniqueClicks: 0,
      lpv: 0,
      reg: 0,
      purch: 0,
    }
  );

  const revBV = t.revenue / (1 + vatRate / 100);
  const net = revBV - t.spend;

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
    totalNetProfit: net,
    totalImpressions: t.impressions,
    totalUniqueClicks: t.uniqueClicks,
    totalLPV: t.lpv,
    totalRegistrations: t.reg,
    totalPurchases: t.purch,
    avgCtr: safe(t.uniqueClicks, t.impressions) * 100,
    avgCpc: safe(t.spend, t.uniqueClicks),
    avgCpm: safe(t.spend, t.impressions) * 1000,
    avgLpvRate: safe(t.lpv, t.uniqueClicks) * 100,
    avgRegRate: safe(t.reg, t.lpv) * 100,
    avgPurchaseRate: safe(t.purch, t.reg) * 100,
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

// ═══════════════════════════════════════════════════════════
// Multi-Account Helpers
// ═══════════════════════════════════════════════════════════

export function mergeDays(accounts: { days: DayData[] }[]): DayData[] {
  if (!accounts.length) return [];
  const len = Math.max(...accounts.map((a) => a.days.length));
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
        merged.revenue += d.revenue;
      }
    }
    return merged;
  });
}

export function aggregateDays(days: DayData[]): DayData {
  return days.reduce(
    (acc, d) => ({
      ...acc,
      adSpend: acc.adSpend + d.adSpend,
      impressions: acc.impressions + d.impressions,
      uniqueClicks: acc.uniqueClicks + d.uniqueClicks,
      landingPageViews: acc.landingPageViews + d.landingPageViews,
      registrations: acc.registrations + d.registrations,
      purchases: acc.purchases + d.purchases,
      revenue: acc.revenue + d.revenue,
    }),
    { ...EMPTY_DAY, date: days[0]?.date || "" }
  );
}

export function groupByWeek(
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

// ═══════════════════════════════════════════════════════════
// Ad Leaderboard
// ═══════════════════════════════════════════════════════════

export function calcAdLeaderboard(
  days: DayData[],
  goal: CampaignGoal
): AdLeaderboardEntry[] {
  const map = new Map<
    string,
    { spend: number; revenue: number; results: number; days: number }
  >();
  for (const d of days) {
    if (!d.adName) continue;
    const existing = map.get(d.adName) || {
      spend: 0,
      revenue: 0,
      results: 0,
      days: 0,
    };
    existing.spend += d.adSpend;
    existing.revenue += d.revenue;
    existing.days += 1;
    if (goal === "clicks") existing.results += d.uniqueClicks;
    else if (goal === "landingPageViews")
      existing.results += d.landingPageViews;
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

// ═══════════════════════════════════════════════════════════
// Diagnostics
// ═══════════════════════════════════════════════════════════

export function getDiagnostics(
  days: DayData[],
  vatRate: number,
  breakEvenRoas: number
): DiagnosticCard[] {
  const totals = aggregateDays(days);
  const calc = calcDay(totals, vatRate);
  const breakEvenCPA =
    totals.revenue > 0 && totals.purchases > 0
      ? totals.revenue / totals.purchases / breakEvenRoas
      : 100;

  return [
    {
      metric: "ctr",
      label: "CTR",
      value: calc.ctr,
      threshold: 1.5,
      isGood: calc.ctr >= 1.5,
      goodMessage: "המודעה מושכת קליקים",
      badMessage: "שנה קריאייטיב / קהל",
      format: fmtPct,
    },
    {
      metric: "regRate",
      label: "אחוז רישום",
      value: calc.regRate,
      threshold: 8,
      isGood: calc.regRate >= 8,
      goodMessage: "הדף ממיר טוב",
      badMessage: "שפר כותרת / הצעה",
      format: fmtPct,
    },
    {
      metric: "purchaseRate",
      label: "אחוז רכישה",
      value: calc.purchaseRate,
      threshold: 20,
      isGood: calc.purchaseRate >= 20,
      goodMessage: "תהליך המכירה עובד",
      badMessage: "בדוק מחיר / הצעה",
      format: fmtPct,
    },
    {
      metric: "cpm",
      label: "CPM",
      value: calc.cpm,
      threshold: 40,
      isGood: calc.cpm <= 40,
      goodMessage: "עלות חשיפה סבירה",
      badMessage: "הקהל יקר",
      format: fmtDec,
    },
    {
      metric: "cpa",
      label: "CPA",
      value: calc.cpa,
      threshold: breakEvenCPA,
      isGood: calc.cpa <= breakEvenCPA,
      goodMessage: "עלות רכישה בטווח",
      badMessage: "עלות גבוהה!",
      format: fmtDec,
    },
    {
      metric: "roas",
      label: "ROAS",
      value: calc.roas,
      threshold: breakEvenRoas,
      isGood: calc.roas >= breakEvenRoas,
      goodMessage: "רווחי",
      badMessage: "מפסיד!",
      format: (v) => v.toFixed(2),
    },
  ];
}

// ═══════════════════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════════════════

export function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

export function generateEmptyDays(month: number, year: number): DayData[] {
  const count = getDaysInMonth(month, year);
  return Array.from({ length: count }, (_, i) => ({
    ...EMPTY_DAY,
    date: `${i + 1}.${month}`,
  }));
}

// ═══════════════════════════════════════════════════════════
// Smart Recommendations (Israeli Market Benchmarks)
// ═══════════════════════════════════════════════════════════

function computeLevel(
  value: number,
  thresholds: number[],
  direction: "higher_better" | "lower_better"
): ScaleLevel {
  if (direction === "higher_better") {
    if (value < thresholds[0]) return "poor";
    if (value < thresholds[1]) return "below_avg";
    if (value < thresholds[2]) return "average";
    if (value < thresholds[3]) return "good";
    return "excellent";
  }
  // lower_better (CPM, CPC)
  if (value > thresholds[0]) return "poor";
  if (value > thresholds[1]) return "below_avg";
  if (value > thresholds[2]) return "average";
  if (value > thresholds[3]) return "good";
  return "excellent";
}

const LEVEL_SCORES: Record<ScaleLevel, number> = {
  poor: 0,
  below_avg: 25,
  average: 50,
  good: 75,
  excellent: 100,
};

export function getSmartRecommendations(
  days: DayData[],
  vatRate: number,
): SmartRecommendation {
  const totals = aggregateDays(days);
  const calc = calcDay(totals, vatRate);

  const scales: Array<{
    metric: string;
    label: string;
    icon: string;
    value: number;
    format: (v: number) => string;
    thresholds: number[];
    direction: "higher_better" | "lower_better";
    recommendations: Record<ScaleLevel, string>;
  }> = [
    {
      metric: "ctr",
      label: "CTR (אחוז הקלקה)",
      icon: "📢",
      value: calc.ctr,
      format: fmtPct,
      thresholds: [0.8, 1.2, 1.8, 2.5],
      direction: "higher_better",
      recommendations: {
        poor: "הקריאייטיב לא עוצר את הסקרול. נסה: 1) וידאו קצר עם הוק ב-3 שניות 2) תמונה עם פנים 3) כותרת שמעוררת סקרנות",
        below_avg:
          "CTR נמוך מהממוצע. נסה לבדוק: 1) Hook חזק יותר 2) קריאייטיב חדש 3) התאמת קהל יעד",
        average: "סביר, אבל יש מרווח. נסה A/B test על 3 קריאייטיבים שונים",
        good: "ביצועים טובים! שמור על הקריאייטיב ובדוק אם אפשר לשכפל לקהלות נוספים",
        excellent:
          "קריאייטיב מנצח! אל תשנה — רק תגדיל תקציב בהדרגה (20% ליום)",
      },
    },
    {
      metric: "cpm",
      label: "CPM (עלות ל-1,000 חשיפות)",
      icon: "💵",
      value: calc.cpm,
      format: fmtDec,
      thresholds: [60, 40, 25, 15],
      direction: "lower_better",
      recommendations: {
        poor: "עלות חשיפות גבוהה מאוד. הקהל יקר — נסה: 1) הרחב את הטרגוט 2) נסה Broad targeting 3) שנה גילאים/מיקומים",
        below_avg:
          "CPM גבוה. צמצם טרגוט או נסה קהלות Lookalike רחבים יותר",
        average: "עלות חשיפות סבירה. תעקוב ותוודא שלא עולה",
        good: "עלות חשיפות נמוכה! הטרגוט עובד טוב",
        excellent: "CPM מצוין! ניצול מקסימלי של התקציב",
      },
    },
    {
      metric: "cpc",
      label: "CPC (עלות לקליק)",
      icon: "👆",
      value: calc.cpc,
      format: fmtDec,
      thresholds: [8, 5, 3, 1.5],
      direction: "lower_better",
      recommendations: {
        poor: "עלות לקליק גבוהה מאוד. שלב בין שיפור CTR + הורדת CPM",
        below_avg:
          "CPC גבוה. שפר את הקריאייטיב כדי להעלות CTR ולהוריד עלות",
        average: "CPC סביר. נסה לשפר CTR כדי להוריד עוד",
        good: "עלות קליק טובה!",
        excellent: "CPC מצוין! קליקים זולים מאוד",
      },
    },
    {
      metric: "regRate",
      label: "אחוז רישום (מדף נחיתה)",
      icon: "📝",
      value: calc.regRate,
      format: fmtPct,
      thresholds: [3, 6, 12, 20],
      direction: "higher_better",
      recommendations: {
        poor: "דף הנחיתה לא ממיר. בדוק: 1) כותרת חזקה 2) הצעת ערך ברורה 3) טופס קצר 4) מהירות טעינה",
        below_avg:
          "המרה נמוכה. שפר: 1) התאמה בין מודעה לדף 2) Social proof 3) CTA בולט",
        average: "המרה סבירה. נסה A/B test על כותרת וטופס",
        good: "דף נחיתה ממיר טוב! שמור ושכפל את הנוסחה",
        excellent: "המרה מעולה! דף נחיתה מנצח — אל תיגע",
      },
    },
    {
      metric: "purchaseRate",
      label: "אחוז רכישה (מנרשמים)",
      icon: "🛒",
      value: calc.purchaseRate,
      format: fmtPct,
      thresholds: [5, 15, 25, 40],
      direction: "higher_better",
      recommendations: {
        poor: "תהליך מכירה בעייתי. בדוק: 1) מחיר 2) הצעה 3) תהליך סגירה 4) Follow-up",
        below_avg:
          "אחוז רכישה נמוך. שפר: 1) אימיילים 2) ריטרגטינג 3) הנחה ראשונה",
        average: "סביר. נסה Order Bump / Upsell להגדלת AOV",
        good: "תהליך מכירה טוב! בדוק אם אפשר להעלות AOV",
        excellent: "מכונת מכירות! שמור ותגדיל תקציב",
      },
    },
    {
      metric: "roas",
      label: "ROAS (החזר על הוצאה)",
      icon: "🔄",
      value: calc.roas,
      format: (v: number) => v.toFixed(2) + "x",
      thresholds: [1, 2, 3, 5],
      direction: "higher_better",
      recommendations: {
        poor: "מפסיד כסף! עצור קמפיין ובדוק מאפס: קריאייטיב → דף נחיתה → הצעה → מחיר",
        below_avg:
          "ROAS נמוך. מצא את צוואר הבקבוק — CTR? המרה? מחיר?",
        average: "רווחי אבל בקושי. שפר המרה/מחיר כדי להגדיל מרווח",
        good: "קמפיין רווחי! הגדל תקציב ב-20% ליום ועקוב",
        excellent:
          "קמפיין מנצח! הגדל תקציב בהדרגה ושכפל לקהלות חדשים",
      },
    },
  ];

  const computedMetrics: MetricScale[] = scales.map((s) => {
    const level = computeLevel(s.value, s.thresholds, s.direction);
    return {
      metric: s.metric,
      label: s.label,
      icon: s.icon,
      value: s.value,
      formattedValue: s.format(s.value),
      level,
      recommendation: s.recommendations[level],
      thresholds: s.thresholds,
      direction: s.direction,
    };
  });

  // Weighted health score (0-100)
  // Weights: CTR=15, CPM=10, CPC=10, RegRate=20, PurchRate=20, ROAS=25
  const weights = [15, 10, 10, 20, 20, 25];
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const overallScore = Math.round(
    computedMetrics.reduce(
      (sum, m, i) => sum + LEVEL_SCORES[m.level] * weights[i],
      0
    ) / totalWeight
  );

  let overallLevel: ScaleLevel;
  if (overallScore < 20) overallLevel = "poor";
  else if (overallScore < 40) overallLevel = "below_avg";
  else if (overallScore < 60) overallLevel = "average";
  else if (overallScore < 80) overallLevel = "good";
  else overallLevel = "excellent";

  const sorted = [...computedMetrics].sort(
    (a, b) => LEVEL_SCORES[a.level] - LEVEL_SCORES[b.level]
  );

  return {
    metrics: computedMetrics,
    overallScore,
    overallLevel,
    topPriority: sorted[0] || null,
    topStrength: sorted[sorted.length - 1] || null,
  };
}

export function generateDemo(
  month: number,
  year: number,
  variation: number = 0
): DayData[] {
  const count = getDaysInMonth(month, year);
  const rng = (min: number, max: number) =>
    Math.round(min + Math.random() * (max - min));

  const profiles = [
    { spendMul: 1, ctrMul: 1, regMul: 1, purchMul: 1 },
    { spendMul: 0.7, ctrMul: 1.2, regMul: 1.1, purchMul: 1.3 },
    { spendMul: 1.4, ctrMul: 0.85, regMul: 0.9, purchMul: 0.8 },
    { spendMul: 0.5, ctrMul: 1.4, regMul: 1.3, purchMul: 1.5 },
    { spendMul: 1.1, ctrMul: 0.95, regMul: 1.05, purchMul: 1.1 },
  ];
  const p = profiles[variation % profiles.length];

  const adNames = [
    "סרטון — לפני/אחרי",
    "קרוסלה — המלצות",
    "תמונה — הנחה",
    "סרטון — סטוריטלינג",
    "קרוסלה — פיצ׳רים",
  ];

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
    const registrations = Math.max(
      1,
      Math.round(landingPageViews * regRate)
    );
    const purchRate = (0.2 + Math.random() * 0.35) * p.purchMul;
    const purchases = Math.max(0, Math.round(registrations * purchRate));
    const aov = rng(150, 450);
    const revenue = purchases * aov;

    const notes =
      dayNum === 5
        ? "שינוי קריאייטיב"
        : dayNum === 12
          ? "שיפור דף נחיתה"
          : dayNum === 20
            ? "שינוי אורדרבאמפ"
            : "";

    const adName = adNames[Math.floor(Math.random() * adNames.length)];

    return {
      date: `${dayNum}.${month}`,
      adSpend,
      impressions,
      uniqueClicks,
      landingPageViews,
      registrations,
      purchases,
      revenue,
      adName,
      notes,
    };
  });
}

// Convert Supabase row to DayData
export function dbRowToDayData(row: Record<string, unknown>): DayData {
  const date = row.date;
  let dateStr = "";
  if (typeof date === "string") {
    // "2026-03-15" → "15.3"
    const parts = date.split("-");
    if (parts.length === 3) {
      dateStr = `${parseInt(parts[2])}.${parseInt(parts[1])}`;
    } else {
      dateStr = date;
    }
  } else if (date instanceof Date) {
    dateStr = `${date.getDate()}.${date.getMonth() + 1}`;
  }

  return {
    date: dateStr,
    adSpend: parseFloat(String(row.ad_spend)) || 0,
    impressions: Number(row.impressions) || 0,
    uniqueClicks: Number(row.unique_clicks) || 0,
    landingPageViews: Number(row.landing_page_views) || 0,
    registrations: Number(row.registrations) || 0,
    purchases: Number(row.purchases) || 0,
    revenue: parseFloat(String(row.revenue)) || 0,
    adName: String(row.ad_name || ""),
    notes: String(row.notes || ""),
  };
}
