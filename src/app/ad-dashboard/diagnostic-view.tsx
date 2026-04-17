"use client";

import { useMemo } from "react";
import type { Summary, Account } from "./lib/types";
import { fmtN, fmtCurrency, fmtPct, fmtDec, fmtRoas } from "./lib/format";
import { GLASS } from "./lib/constants";
import { type DatePreset, DATE_PRESETS } from "./lib/date-presets";

// ═══════════════════════════════════════════════════════════
// DIAGNOSTIC ENGINE
// ═══════════════════════════════════════════════════════════

type Severity = "critical" | "warning" | "ok" | "good";
type FunnelStage =
  | "delivery"
  | "creative"
  | "landing_page"
  | "conversion"
  | "sales"
  | "efficiency"
  | "fatigue";

interface DiagnosticSignal {
  severity: Severity;
  stage: FunnelStage;
  title: string;
  message: string;
  action: string;
  metric: string;
  value: string;
  benchmark: string;
}

interface FunnelStep {
  stage: FunnelStage;
  label: string;
  icon: string;
  value: number;
  formatted: string;
  rate?: number;
  rateFormatted?: string;
  status: Severity;
}

function runDiagnostics(sum: Summary, breakEvenRoas: number): DiagnosticSignal[] {
  const signals: DiagnosticSignal[] = [];

  if (sum.activeDays === 0) return signals;

  // ─── 1. CTR Analysis ───
  if (sum.avgCtr < 0.8) {
    signals.push({
      severity: "critical",
      stage: "creative",
      title: "CTR קריטי — הקריאייטיב לא עובד",
      message: `ה-CTR שלך (${fmtPct(sum.avgCtr)}) נמוך מאוד. אנשים רואים את המודעה ולא לוחצים.`,
      action: "לשנות את ה-Hook (3 שניות ראשונות), לנסות פורמט אחר (וידאו/קרוסלה), לבדוק התאמת קהל",
      metric: "CTR",
      value: fmtPct(sum.avgCtr),
      benchmark: "מעל 1.3%",
    });
  } else if (sum.avgCtr < 1.3) {
    signals.push({
      severity: "warning",
      stage: "creative",
      title: "CTR מתחת לממוצע",
      message: `ה-CTR (${fmtPct(sum.avgCtr)}) מתחת לממוצע של השוק. יש מקום לשיפור בקריאייטיב.`,
      action: "לבדוק A/B על כותרות וקריאייטיבים שונים",
      metric: "CTR",
      value: fmtPct(sum.avgCtr),
      benchmark: "1.3%-2%",
    });
  } else if (sum.avgCtr >= 2.0) {
    signals.push({
      severity: "good",
      stage: "creative",
      title: "CTR חזק — ההוק עובד",
      message: `ה-CTR (${fmtPct(sum.avgCtr)}) מעל הממוצע. אנשים מגיבים למודעה.`,
      action: "לשמור על הקריאייטיב, לבדוק שה-CTR לא מנופח מ-clickbait",
      metric: "CTR",
      value: fmtPct(sum.avgCtr),
      benchmark: "מעל 2%",
    });
  } else {
    signals.push({
      severity: "ok",
      stage: "creative",
      title: "CTR תקין",
      message: `ה-CTR (${fmtPct(sum.avgCtr)}) בטווח הממוצע.`,
      action: "אפשר לנסות לשפר עם A/B testing",
      metric: "CTR",
      value: fmtPct(sum.avgCtr),
      benchmark: "1.3%-2%",
    });
  }

  // ─── 2. Landing Page View Rate ───
  const lpvRate =
    sum.totalUniqueClicks > 0
      ? (sum.totalLPV / sum.totalUniqueClicks) * 100
      : 0;

  if (sum.totalUniqueClicks > 0 && lpvRate < 60) {
    signals.push({
      severity: "critical",
      stage: "landing_page",
      title: "בעיה טכנית חמורה — אנשים לא מגיעים לדף",
      message: `רק ${lpvRate.toFixed(0)}% מהקליקים מגיעים לדף. הבעיה כנראה טכנית.`,
      action: "לבדוק מהירות דף (מעל 3 שניות = בעיה), Pixel תקין, SSL, redirects, ותאימות מובייל",
      metric: "הגעה לדף",
      value: `${lpvRate.toFixed(0)}%`,
      benchmark: "מעל 70%",
    });
  } else if (sum.totalUniqueClicks > 0 && lpvRate < 70) {
    signals.push({
      severity: "warning",
      stage: "landing_page",
      title: "שיעור הגעה לדף נמוך",
      message: `${lpvRate.toFixed(0)}% מהקליקים מגיעים לדף. ייתכן שהדף איטי.`,
      action: "לבדוק מהירות טעינה, לוודא שהדף מותאם למובייל",
      metric: "הגעה לדף",
      value: `${lpvRate.toFixed(0)}%`,
      benchmark: "70%-85%",
    });
  } else if (sum.totalUniqueClicks > 0) {
    signals.push({
      severity: lpvRate >= 85 ? "good" : "ok",
      stage: "landing_page",
      title: lpvRate >= 85 ? "דף נחיתה מהיר" : "הגעה לדף תקינה",
      message: `${lpvRate.toFixed(0)}% מהקליקים מגיעים לדף.`,
      action: lpvRate >= 85 ? "מצוין, הדף מהיר" : "תקין",
      metric: "הגעה לדף",
      value: `${lpvRate.toFixed(0)}%`,
      benchmark: "מעל 85%",
    });
  }

  // ─── 3. Registration/Conversion Rate ───
  // Skip the lead-based conversion analysis when there are no leads but purchases ARE flowing —
  // it's a direct-sale funnel, so judging it by "dף not converting to leads" is misleading.
  if (sum.totalLPV > 0 && !(sum.totalRegistrations === 0 && sum.totalPurchases > 0)) {
    if (sum.avgRegRate < 3) {
      signals.push({
        severity: "critical",
        stage: "conversion",
        title: "דף הנחיתה לא ממיר",
        message: `רק ${fmtPct(sum.avgRegRate)} מהגולשים נרשמים. הבעיה בדף, לא במודעה.`,
        action: "לחזק ההצעה (בונוסים, urgency), לקצר טופס ל-3-4 שדות, להוסיף Social Proof, לבדוק CTA בולט",
        metric: "המרה בדף",
        value: fmtPct(sum.avgRegRate),
        benchmark: "מעל 5%",
      });
    } else if (sum.avgRegRate < 5) {
      signals.push({
        severity: "warning",
        stage: "conversion",
        title: "שיעור המרה נמוך מהממוצע",
        message: `${fmtPct(sum.avgRegRate)} המרה — יש מקום לשיפור.`,
        action: "לנסות A/B על כותרת הדף, הצעה, וגודל טופס",
        metric: "המרה בדף",
        value: fmtPct(sum.avgRegRate),
        benchmark: "5%-10%",
      });
    } else {
      signals.push({
        severity: sum.avgRegRate >= 10 ? "good" : "ok",
        stage: "conversion",
        title: sum.avgRegRate >= 10 ? "המרה מצוינת" : "המרה תקינה",
        message: `${fmtPct(sum.avgRegRate)} נרשמים מתוך מי שמגיע לדף.`,
        action: sum.avgRegRate >= 10 ? "לשמור! לסקייל" : "סביר, אפשר לשפר",
        metric: "המרה בדף",
        value: fmtPct(sum.avgRegRate),
        benchmark: "מעל 5%",
      });
    }
  }

  // ─── 4. CPL (Cost Per Lead) — המטריקה המרכזית בלידים ───
  const cpl =
    sum.totalRegistrations > 0
      ? sum.totalSpend / sum.totalRegistrations
      : 0;

  if (sum.totalRegistrations > 0) {
    if (cpl > 100) {
      signals.push({
        severity: "critical",
        stage: "efficiency",
        title: "עלות לליד גבוהה מאוד",
        message: `עלות של ${fmtDec(cpl)} לליד. צריך לבדוק את כל המשפך.`,
        action: "לשפר CTR (מוריד CPC), לשפר המרה בדף (מעלה CVR), לבדוק התאמה בין מודעה לדף",
        metric: "CPL",
        value: fmtDec(cpl),
        benchmark: "מתחת ל-₪60",
      });
    } else if (cpl > 60) {
      signals.push({
        severity: "warning",
        stage: "efficiency",
        title: "עלות לליד מעל הממוצע",
        message: `CPL של ${fmtDec(cpl)}. יש מקום לשיפור.`,
        action: "לבדוק: CTR (אם נמוך = קריאייטיב), המרה בדף (אם נמוכה = דף נחיתה), CPM (אם גבוה = קהל)",
        metric: "CPL",
        value: fmtDec(cpl),
        benchmark: "₪20-₪60",
      });
    } else if (cpl <= 30) {
      signals.push({
        severity: "good",
        stage: "efficiency",
        title: "עלות לליד מצוינת",
        message: `CPL של ${fmtDec(cpl)} — מתחת לממוצע. לידים זולים.`,
        action: "לסקייל! להעלות תקציב 20% כל 3-4 ימים. לוודא שאיכות הלידים נשמרת",
        metric: "CPL",
        value: fmtDec(cpl),
        benchmark: "מתחת ל-₪30",
      });
    } else {
      signals.push({
        severity: "ok",
        stage: "efficiency",
        title: "עלות לליד סבירה",
        message: `CPL של ${fmtDec(cpl)} — בטווח הממוצע.`,
        action: "תקין. אפשר לנסות לשפר עם A/B על קריאייטיב ודף נחיתה",
        metric: "CPL",
        value: fmtDec(cpl),
        benchmark: "₪30-₪60",
      });
    }
  } else if (sum.totalPurchases > 0) {
    // No leads/registrations tracked, but purchases ARE coming in — use CPA instead of CPL
    const cpa = sum.totalSpend / sum.totalPurchases;
    if (cpa > 300) {
      signals.push({
        severity: "warning",
        stage: "efficiency",
        title: "עלות לרכישה גבוהה",
        message: `CPA של ${fmtDec(cpa)} — יקר. ${sum.totalPurchases} רכישות ב-${fmtCurrency(sum.totalSpend)}.`,
        action: "לשפר קריאייטיב, לבדוק קהל, לשקול להעלות מחיר מוצר",
        metric: "CPA",
        value: fmtDec(cpa),
        benchmark: "מתחת ל-₪300",
      });
    } else {
      signals.push({
        severity: "good",
        stage: "efficiency",
        title: "רכישות מגיעות ישירות",
        message: `${sum.totalPurchases} רכישות ב-${fmtCurrency(sum.totalSpend)} — CPA ${fmtDec(cpa)}.`,
        action: "קמפיין רכישות פעיל. שים לב: אירוע Lead לא נספר, רק Purchase — לוודא ש-Pixel ב-thank you page דולק",
        metric: "CPA",
        value: fmtDec(cpa),
        benchmark: "מתחת ל-₪300",
      });
    }
  } else if (sum.totalSpend > 50) {
    // Spent money but 0 leads AND 0 purchases
    signals.push({
      severity: "critical",
      stage: "efficiency",
      title: "הוצאת כסף בלי תוצאות",
      message: `הוצאת ${fmtCurrency(sum.totalSpend)} ולא נספרו לידים או רכישות.`,
      action: "לבדוק: Pixel תקין? דף נחיתה עובד? טופס מחובר? אם הכל תקין — הבעיה בהצעה או בקהל",
      metric: "CPL",
      value: "∞",
      benchmark: "צריך תוצאות",
    });
  }

  // ─── 5. CPC Analysis ───
  if (sum.avgCpc > 5) {
    signals.push({
      severity: "warning",
      stage: "efficiency",
      title: "עלות לקליק גבוהה",
      message: `CPC של ${fmtDec(sum.avgCpc)} — יקר. כנראה CTR נמוך או תחרות גבוהה על הקהל.`,
      action: "לשפר CTR (מוריד CPC אוטומטית), לבדוק אם הקהל צר מדי",
      metric: "CPC",
      value: fmtDec(sum.avgCpc),
      benchmark: "מתחת ל-₪5",
    });
  } else if (sum.avgCpc > 0 && sum.avgCpc <= 3) {
    signals.push({
      severity: "good",
      stage: "efficiency",
      title: "עלות לקליק טובה",
      message: `CPC של ${fmtDec(sum.avgCpc)} — קליקים זולים.`,
      action: "מצוין. לוודא שהקליקים ממירים (לבדוק CVR בדף)",
      metric: "CPC",
      value: fmtDec(sum.avgCpc),
      benchmark: "מתחת ל-₪3",
    });
  }

  // ─── 6. ROAS — only when revenue data exists ───
  if (sum.totalRevenue > 0 && sum.totalPurchases > 0) {
    if (sum.overallRoas < breakEvenRoas) {
      signals.push({
        severity: "warning",
        stage: "sales",
        title: "ROAS מתחת לנקודת איזון",
        message: `ROAS ${fmtRoas(sum.overallRoas)} — מתחת ליעד של ${fmtRoas(breakEvenRoas)}.`,
        action: "לשפר המרה בדף, לבדוק תהליך מכירה, לשקול להעלות מחיר מוצר",
        metric: "ROAS",
        value: fmtRoas(sum.overallRoas),
        benchmark: `מעל ${fmtRoas(breakEvenRoas)}`,
      });
    } else {
      signals.push({
        severity: "good",
        stage: "sales",
        title: "ROAS חיובי",
        message: `ROAS ${fmtRoas(sum.overallRoas)} — מעל נקודת האיזון.`,
        action: sum.overallRoas >= 3 ? "לסקייל!" : "רווחי, אפשר לסקייל בזהירות",
        metric: "ROAS",
        value: fmtRoas(sum.overallRoas),
        benchmark: `מעל ${fmtRoas(breakEvenRoas)}`,
      });
    }
  }

  // ─── 7. CTR high + 0 leads + 0 purchases = Clickbait/disconnect warning ───
  if (
    sum.avgCtr >= 2.0 &&
    sum.totalRegistrations === 0 &&
    sum.totalPurchases === 0 &&
    sum.totalSpend > 100
  ) {
    signals.push({
      severity: "warning",
      stage: "creative",
      title: "CTR גבוה בלי לידים — ניתוק בין מודעה לדף",
      message: `CTR של ${fmtPct(sum.avgCtr)} אבל 0 לידים. אנשים לוחצים אבל לא נרשמים.`,
      action: "לבדוק: האם המסר בדף תואם למודעה? האם הטופס עובד? האם הדף נטען?",
      metric: "CTR vs לידים",
      value: `${fmtPct(sum.avgCtr)} / 0 לידים`,
      benchmark: "CTR + לידים",
    });
  }

  // ─── 8. CPM Analysis ───
  if (sum.avgCpm > 60) {
    signals.push({
      severity: "warning",
      stage: "delivery",
      title: "CPM גבוה — תחרות חזקה או קהל צר",
      message: `CPM של ${fmtDec(sum.avgCpm)} — יקר. ייתכן שהקהל צר מדי או שיש תחרות חזקה.`,
      action: "להרחיב קהל, לנסות Lookalike, לבדוק Audience Overlap בין ad sets",
      metric: "CPM",
      value: fmtDec(sum.avgCpm),
      benchmark: "מתחת ל-₪40",
    });
  }

  return signals;
}

// ═══════════════════════════════════════════════════════════
// DIAGNOSTIC VIEW COMPONENT
// ═══════════════════════════════════════════════════════════

const SEVERITY_STYLES: Record<
  Severity,
  { bg: string; border: string; text: string; icon: string; label: string }
> = {
  critical: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    icon: "🔴",
    label: "קריטי",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    icon: "🟡",
    label: "אזהרה",
  },
  ok: {
    bg: "bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-600",
    icon: "⚪",
    label: "תקין",
  },
  good: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    icon: "🟢",
    label: "מצוין",
  },
};

const STAGE_LABELS: Record<FunnelStage, { label: string; icon: string }> = {
  delivery: { label: "הפצה וחשיפות", icon: "📡" },
  creative: { label: "קריאייטיב ומודעה", icon: "🎨" },
  landing_page: { label: "דף נחיתה", icon: "📄" },
  conversion: { label: "המרה", icon: "🎯" },
  sales: { label: "מכירות ורווחיות", icon: "💰" },
  efficiency: { label: "יעילות", icon: "⚡" },
  fatigue: { label: "עייפות מודעה", icon: "😴" },
};

export function DiagnosticView({
  sum,
  breakEvenRoas,
  onBack,
  accounts,
  activeAccountId,
  onChangeAccount,
  datePreset,
  onChangeDatePreset,
  isLoading,
  campaigns,
  activeCampaignId,
  onChangeCampaign,
}: {
  sum: Summary;
  breakEvenRoas: number;
  onBack: () => void;
  accounts: Account[];
  activeAccountId: string;
  onChangeAccount: (id: string) => void;
  datePreset: DatePreset;
  onChangeDatePreset: (preset: DatePreset) => void;
  isLoading?: boolean;
  campaigns?: Array<{ id: string; name: string; status: string }>;
  activeCampaignId?: string;
  onChangeCampaign?: (id: string) => void;
}) {
  const signals = useMemo(
    () => runDiagnostics(sum, breakEvenRoas),
    [sum, breakEvenRoas]
  );

  const criticals = signals.filter((s) => s.severity === "critical");
  const warnings = signals.filter((s) => s.severity === "warning");
  const goods = signals.filter((s) => s.severity === "good");
  const oks = signals.filter((s) => s.severity === "ok");

  // Overall health score
  const healthScore = useMemo(() => {
    if (signals.length === 0) return 0;
    const weights: Record<Severity, number> = {
      critical: 0,
      warning: 40,
      ok: 70,
      good: 100,
    };
    return Math.round(
      signals.reduce((s, sig) => s + weights[sig.severity], 0) / signals.length
    );
  }, [signals]);

  const healthColor =
    healthScore >= 70
      ? "text-emerald-600"
      : healthScore >= 40
        ? "text-amber-600"
        : "text-red-600";

  const healthLabel =
    healthScore >= 80
      ? "מצוין"
      : healthScore >= 60
        ? "טוב"
        : healthScore >= 40
          ? "צריך שיפור"
          : "קריטי";

  // Funnel steps
  const funnel: FunnelStep[] = useMemo(() => {
    const lpvRate =
      sum.totalUniqueClicks > 0
        ? (sum.totalLPV / sum.totalUniqueClicks) * 100
        : 0;

    const steps: FunnelStep[] = [
      {
        stage: "delivery",
        label: "חשיפות",
        icon: "👁",
        value: sum.totalImpressions,
        formatted: fmtN(sum.totalImpressions),
        status: sum.totalImpressions > 0 ? "ok" : "critical",
      },
      {
        stage: "creative",
        label: "קליקים",
        icon: "👆",
        value: sum.totalUniqueClicks,
        formatted: fmtN(sum.totalUniqueClicks),
        rate: sum.avgCtr,
        rateFormatted: `CTR ${fmtPct(sum.avgCtr)}`,
        status:
          sum.avgCtr >= 2 ? "good" : sum.avgCtr >= 1.3 ? "ok" : sum.avgCtr >= 0.8 ? "warning" : "critical",
      },
      {
        stage: "landing_page",
        label: "הגיעו לדף",
        icon: "📄",
        value: sum.totalLPV,
        formatted: fmtN(sum.totalLPV),
        rate: lpvRate,
        rateFormatted: `${lpvRate.toFixed(0)}% הגיעו`,
        status:
          lpvRate >= 85 ? "good" : lpvRate >= 70 ? "ok" : lpvRate >= 60 ? "warning" : "critical",
      },
      {
        stage: "conversion",
        label: "נרשמו",
        icon: "✍️",
        value: sum.totalRegistrations,
        formatted: fmtN(sum.totalRegistrations),
        rate: sum.avgRegRate,
        rateFormatted: `${fmtPct(sum.avgRegRate)} המרה`,
        status:
          sum.avgRegRate >= 10
            ? "good"
            : sum.avgRegRate >= 5
              ? "ok"
              : sum.avgRegRate >= 3
                ? "warning"
                : "critical",
      },
      {
        stage: "sales",
        label: "רכשו",
        icon: "💳",
        // When no leads are tracked but purchases are, measure purchase rate against landing page views
        value: sum.totalPurchases,
        formatted: fmtN(sum.totalPurchases),
        rate:
          sum.totalRegistrations > 0
            ? sum.avgPurchaseRate
            : sum.totalLPV > 0
              ? (sum.totalPurchases / sum.totalLPV) * 100
              : 0,
        rateFormatted:
          sum.totalRegistrations > 0
            ? `${fmtPct(sum.avgPurchaseRate)} מלידים`
            : sum.totalLPV > 0
              ? `${fmtPct((sum.totalPurchases / sum.totalLPV) * 100)} מביקורים`
              : `${sum.totalPurchases} רכישות`,
        status:
          sum.totalPurchases === 0 && sum.totalRegistrations > 0
            ? "critical"
            : sum.totalPurchases === 0
              ? "warning"
              : sum.totalRegistrations > 0
                ? sum.avgPurchaseRate >= 10
                  ? "good"
                  : sum.avgPurchaseRate >= 5
                    ? "ok"
                    : "warning"
                : "good",
      },
    ];
    return steps;
  }, [sum]);

  if (sum.activeDays === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-gray-500">אין נתונים לאבחון — אין ימים פעילים בתקופה הנבחרת</p>
        <button
          onClick={onBack}
          className="mt-4 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          חזור לדשבורד
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-extrabold text-gray-900">🩺 אבחון מצב</h2>
        <button
          onClick={onBack}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          ← חזור לדשבורד
        </button>
      </div>

      {/* Account Selector */}
      {accounts.length > 0 && (
        <div className={`mb-4 ${GLASS} p-1.5`}>
          <div className="flex items-center gap-1 overflow-x-auto">
            {accounts.length > 1 && (
              <>
                <button
                  onClick={() => onChangeAccount("summary")}
                  className={`flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                    activeAccountId === "summary"
                      ? "bg-blue-50 text-blue-700 shadow-sm"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }`}
                >
                  📊 כל החשבונות
                </button>
                <div className="h-6 w-px flex-shrink-0 bg-gray-200" />
              </>
            )}
            {accounts.map((acc) => (
              <button
                key={acc.id}
                onClick={() => onChangeAccount(acc.id)}
                className={`flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                  activeAccountId === acc.id
                    ? "bg-blue-50 text-blue-700 shadow-sm"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }`}
              >
                {acc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Campaign Selector */}
      {campaigns && campaigns.length > 0 && onChangeCampaign && activeAccountId !== "summary" && (
        <div className={`mb-4 ${GLASS} p-3`}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-600">🎯 קמפיין:</span>
            <select
              value={activeCampaignId || ""}
              onChange={(e) => onChangeCampaign(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs"
            >
              <option value="">כל הקמפיינים בחשבון</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.status !== "ACTIVE" ? `(${c.status})` : ""}
                </option>
              ))}
            </select>
            {activeCampaignId && (
              <button
                onClick={() => onChangeCampaign("")}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-50"
              >
                נקה
              </button>
            )}
          </div>
        </div>
      )}

      {/* Date Presets */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">📅 תקופה:</span>
        {DATE_PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onChangeDatePreset(p.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              datePreset === p.key
                ? "bg-gray-900 text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="mb-6 flex items-center justify-center py-10">
          <div className="text-center">
            <div className="mb-3 h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mx-auto" />
            <p className="text-sm text-gray-400">טוען נתונים...</p>
          </div>
        </div>
      )}

      {/* Health Score + Summary */}
      <div className={`mb-8 ${GLASS} p-6`}>
        <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative h-24 w-24">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={healthScore >= 70 ? "#10b981" : healthScore >= 40 ? "#f59e0b" : "#ef4444"}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 42}
                  strokeDashoffset={2 * Math.PI * 42 * (1 - healthScore / 100)}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-extrabold ${healthColor}`}>{healthScore}</span>
                <span className="text-[10px] text-gray-400">/100</span>
              </div>
            </div>
            <div>
              <div className={`text-xl font-bold ${healthColor}`}>{healthLabel}</div>
              <div className="text-sm text-gray-400">ציון בריאות קמפיין</div>
            </div>
          </div>
          <div className="flex gap-4 text-center text-sm">
            <div>
              <div className="text-2xl font-bold text-red-600">{criticals.length}</div>
              <div className="text-xs text-gray-400">קריטי</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-600">{warnings.length}</div>
              <div className="text-xs text-gray-400">אזהרות</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">{goods.length}</div>
              <div className="text-xs text-gray-400">תקין</div>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Funnel */}
      <div className={`mb-8 ${GLASS} p-6`}>
        <h3 className="mb-5 text-lg font-bold text-gray-900">📊 משפך — איפה נשבר?</h3>
        <div className="flex flex-col gap-1">
          {funnel.map((step, i) => {
            const s = SEVERITY_STYLES[step.status];
            const maxVal = funnel[0].value || 1;
            const w = Math.max(5, (step.value / maxVal) * 100);
            return (
              <div key={step.stage}>
                <div className="flex items-center gap-3">
                  <div className="w-20 flex-shrink-0 text-left text-sm font-medium text-gray-700">
                    {step.icon} {step.label}
                  </div>
                  <div className="relative flex-1">
                    <div className="h-10 overflow-hidden rounded-lg bg-gray-100">
                      <div
                        className={`flex h-full items-center rounded-lg px-3 transition-all duration-700 ${s.bg} border ${s.border}`}
                        style={{ width: `${w}%` }}
                      >
                        <span className="text-xs font-bold text-gray-900">{step.formatted}</span>
                      </div>
                    </div>
                  </div>
                  {step.rateFormatted && (
                    <div
                      className={`min-w-[90px] rounded-lg px-2 py-1 text-center text-xs font-semibold ${s.bg} ${s.text}`}
                    >
                      {step.rateFormatted}
                    </div>
                  )}
                  <span className="text-sm">{s.icon}</span>
                </div>
                {i < funnel.length - 1 && (
                  <div className="mr-10 flex items-center gap-1 py-0.5 text-xs text-gray-400">
                    <span>↓</span>
                    {funnel[i + 1].value > 0 && step.value > 0 && (
                      <span>
                        {(((step.value - funnel[i + 1].value) / step.value) * 100).toFixed(0)}% נשרו
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Diagnostic Signals */}
      {criticals.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-lg font-bold text-red-700">🔴 בעיות קריטיות — לטפל מיד</h3>
          <div className="space-y-3">
            {criticals.map((sig, i) => (
              <SignalCard key={i} signal={sig} />
            ))}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-lg font-bold text-amber-700">🟡 אזהרות — לשים לב</h3>
          <div className="space-y-3">
            {warnings.map((sig, i) => (
              <SignalCard key={i} signal={sig} />
            ))}
          </div>
        </div>
      )}

      {goods.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-lg font-bold text-emerald-700">🟢 מה עובד טוב</h3>
          <div className="space-y-3">
            {goods.map((sig, i) => (
              <SignalCard key={i} signal={sig} />
            ))}
          </div>
        </div>
      )}

      {oks.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-lg font-bold text-gray-600">⚪ תקין</h3>
          <div className="space-y-3">
            {oks.map((sig, i) => (
              <SignalCard key={i} signal={sig} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SignalCard({ signal }: { signal: DiagnosticSignal }) {
  const s = SEVERITY_STYLES[signal.severity];
  const stage = STAGE_LABELS[signal.stage];

  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className={`text-sm font-bold ${s.text}`}>{signal.title}</div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-gray-500">
              {stage.icon} {stage.label}
            </span>
          </div>
        </div>
        <div className="text-left">
          <div className={`text-lg font-extrabold ${s.text}`}>{signal.value}</div>
          <div className="text-[10px] text-gray-400">בנצ׳מרק: {signal.benchmark}</div>
        </div>
      </div>
      <p className="mb-2 text-sm text-gray-600">{signal.message}</p>
      <div className="rounded-lg bg-white/60 px-3 py-2">
        <div className="text-xs font-semibold text-gray-500">💡 מה לעשות:</div>
        <div className="mt-0.5 text-sm text-gray-700">{signal.action}</div>
      </div>
    </div>
  );
}
