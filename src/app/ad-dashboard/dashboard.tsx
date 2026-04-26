"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type {
  DayData,
  DayMetrics,
  Settings,
  Account,
  CampaignGoal,
  SyncStatus,
  AdUser,
  ScaleLevel,
  MetricScale,
  SmartRecommendation,
} from "./lib/types";
import {
  safe,
  calcDay,
  calcSummary,
  mergeDays,
  aggregateDays,
  groupByWeek,
  calcAdLeaderboard,
  getSmartRecommendations,
  generateEmptyDays,
  generateDemo,
  getDaysInMonth,
  dbRowToDayData,
} from "./lib/calculations";
import {
  MONTHS_HE,
  DEFAULT_SETTINGS,
  EMPTY_DAY,
  CAMPAIGN_GOAL_LABELS,
  LEAD_ACTION_TYPES,
  GLASS,
  GLASS_HOVER,
} from "./lib/constants";
import {
  fmtN,
  fmtCurrency,
  fmtSigned,
  fmtPct,
  fmtRoas,
  fmtDec,
} from "./lib/format";
import type { AdInsight } from "./lib/meta-api";
import dynamic from "next/dynamic";

const DiagnosticView = dynamic(() => import("./diagnostic-view").then(m => ({ default: m.DiagnosticView })), { loading: () => <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" /></div> });
const InstagramView = dynamic(() => import("./instagram-view").then(m => ({ default: m.InstagramView })), { loading: () => <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" /></div> });
const SeoView = dynamic(() => import("./seo-view").then(m => ({ default: m.SeoView })), { loading: () => <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" /></div> });
const AIChatPanel = dynamic(() => import("./ai-chat").then(m => ({ default: m.AIChatPanel })), { ssr: false });
import { type DatePreset, DATE_PRESETS, getDateRange } from "./lib/date-presets";

// ═══════════════════════════════════════════════════════════
// WINNING ADS VIEW
// ═══════════════════════════════════════════════════════════

function rankLabel(rank: string): string {
  if (rank.includes("ABOVE")) return "מעל הממוצע";
  if (rank.includes("AVERAGE") && !rank.includes("BELOW")) return "ממוצע";
  if (rank.includes("BELOW")) return "מתחת לממוצע";
  return "—";
}

// Debug: show all action types Meta returns
function MetaActionsDebug({
  accounts,
  activeAccountId,
  datePreset,
}: {
  accounts: Account[];
  activeAccountId: string;
  datePreset: DatePreset;
}) {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    period?: { since: string; until: string };
    actions?: { type: string; count: number }[];
    actionValues?: { type: string; value: number }[];
    error?: string;
  } | null>(null);

  const load = async () => {
    const targetIds =
      activeAccountId === "all"
        ? accounts.map((a) => a.id)
        : [activeAccountId];
    const { since, until } = getDateRange(datePreset);

    setLoading(true);
    setShow(true);
    try {
      // Fetch for first account (debug is per-account)
      const res = await fetch("/api/ad-dashboard/debug-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: targetIds[0], since, until }),
      });
      setData(await res.json());
    } catch {
      setData({ error: "שגיאה בטעינה" });
    } finally {
      setLoading(false);
    }
  };

  // Known action types and their Hebrew labels
  const actionLabels: Record<string, string> = {
    lead: "ליד (Lead)",
    "offsite_conversion.fb_pixel_lead": "ליד - Pixel",
    "onsite_conversion.lead_grouped": "ליד - טופס מיידי",
    complete_registration: "השלמת רישום (Complete Registration)",
    "offsite_conversion.fb_pixel_complete_registration": "רישום - Pixel",
    landing_page_view: "צפייה בדף נחיתה",
    purchase: "רכישה",
    "offsite_conversion.fb_pixel_purchase": "רכישה - Pixel",
    link_click: "קליק על לינק",
    page_engagement: "מעורבות בדף",
    post_engagement: "מעורבות בפוסט",
    video_view: "צפייה בוידאו",
    comment: "תגובה",
    like: "לייק",
    share: "שיתוף",
    post_reaction: "ריאקשן",
  };

  return (
    <>
      <button
        onClick={load}
        className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
      >
        🔍 בדוק אירועי המרה
      </button>

      {show && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setShow(false)}
        >
          <div
            className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                🔍 כל האירועים שMeta מחזיר
              </h3>
              <button
                onClick={() => setShow(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {loading && (
              <div className="py-8 text-center">
                <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mx-auto" />
                <p className="text-sm text-gray-400">מושך נתונים מ-Meta...</p>
              </div>
            )}

            {data?.error && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
                {data.error}
              </div>
            )}

            {data?.actions && (
              <>
                {data.period && (
                  <p className="mb-4 text-xs text-gray-400">
                    תקופה: {data.period.since} עד {data.period.until}
                  </p>
                )}

                <div className="mb-4 space-y-2">
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                    💡 <strong>לידים:</strong> הדשבורד סופר את האירוע הראשון שמוצא מתוך: lead, fb_pixel_lead, lead_grouped, complete_registration.
                  </div>
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
                    🛒 <strong>רכישות:</strong> הדשבורד סופר את: purchase, fb_pixel_purchase, onsite_conversion.purchase. אם יש לך <strong>המרה מותאמת אישית</strong> שמתאימה לרכישות (offsite_conversion.fb_pixel_custom וכו') - תבדוק בטבלה איזה אירוע מתאים.
                  </div>
                </div>

                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-3 py-2 text-right text-xs font-bold text-gray-600">
                        סוג אירוע (action_type)
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-gray-600">
                        תיאור
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-bold text-gray-600">
                        כמות
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-bold text-gray-600">
                        נספר כ
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.actions.map((a, i) => {
                      const isLeadType = [
                        "lead",
                        "offsite_conversion.fb_pixel_lead",
                        "onsite_conversion.lead_grouped",
                        "complete_registration",
                        "offsite_conversion.fb_pixel_complete_registration",
                      ].includes(a.type);

                      const isPurchaseType = [
                        "purchase",
                        "offsite_conversion.fb_pixel_purchase",
                        "onsite_conversion.purchase",
                      ].includes(a.type);

                      const isCustom = a.type.includes("custom");

                      return (
                        <tr
                          key={i}
                          className={`border-b border-gray-100 ${isLeadType ? "bg-amber-50" : isPurchaseType ? "bg-emerald-50" : isCustom ? "bg-blue-50" : ""}`}
                        >
                          <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">
                            {a.type}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-gray-500">
                            {actionLabels[a.type] || (isCustom ? "המרה מותאמת" : "—")}
                          </td>
                          <td className="px-3 py-2 text-center text-sm font-bold text-gray-900">
                            {a.count}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {isLeadType && (
                              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                👥 ליד
                              </span>
                            )}
                            {isPurchaseType && (
                              <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                🛒 רכישה
                              </span>
                            )}
                            {isCustom && !isLeadType && !isPurchaseType && (
                              <span className="rounded-full bg-blue-200 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                                ⚙️ מותאם
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {data.actionValues && data.actionValues.length > 0 && (
                  <>
                    <h4 className="mb-2 mt-6 text-sm font-bold text-gray-700">
                      ערכים כספיים (action_values)
                    </h4>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-3 py-2 text-right text-xs font-bold text-gray-600">
                            סוג
                          </th>
                          <th className="px-3 py-2 text-center text-xs font-bold text-gray-600">
                            ערך ₪
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.actionValues.map((a, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">
                              {a.type}
                            </td>
                            <td className="px-3 py-2 text-center text-sm font-bold text-gray-900">
                              ₪{a.value.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function WinningAdsView({
  ads,
  isLoading,
  error,
  onBack,
  accounts,
  activeAccountId,
  onChangeAccount,
  datePreset,
  onChangeDatePreset,
  campaignId,
  onChangeCampaign,
  availableCampaigns,
}: {
  ads: AdInsight[];
  isLoading: boolean;
  error: string | null;
  onBack: () => void;
  accounts: Account[];
  activeAccountId: string;
  onChangeAccount: (id: string) => void;
  datePreset: DatePreset;
  onChangeDatePreset: (preset: DatePreset) => void;
  campaignId: string;
  onChangeCampaign: (id: string) => void;
  availableCampaigns: { id: string; name: string }[];
}) {
  // Sort by results (most first), then by cost-per-result (cheapest first)
  const sorted = useMemo(
    () =>
      [...ads].sort((a, b) => {
        const aResults = a.leads + a.purchases;
        const bResults = b.leads + b.purchases;
        if (bResults !== aResults) return bResults - aResults;
        // Same results — cheaper cost per result wins
        return (a.costPerResult || Infinity) - (b.costPerResult || Infinity);
      }),
    [ads]
  );

  // Category winners — with minimum thresholds for reliability
  const bestResults = useMemo(
    () => sorted.find((a) => (a.leads + a.purchases) > 0) || null,
    [sorted]
  );
  const bestCtr = useMemo(
    () =>
      ads.length > 0
        ? [...ads]
            .filter((a) => a.spend >= 10 && a.impressions >= 100)
            .sort((a, b) => b.ctr - a.ctr)[0] || null
        : null,
    [ads]
  );
  const bestCostPerResult = useMemo(
    () =>
      [...ads]
        .filter((a) => a.costPerResult > 0 && (a.leads + a.purchases) >= 1)
        .sort((a, b) => a.costPerResult - b.costPerResult)[0] || null,
    [ads]
  );

  // Ads that are losing money: 0 results, or very high cost per result
  const moneyBurners = useMemo(() => {
    const avgCpr =
      ads.filter((a) => a.costPerResult > 0).reduce((s, a) => s + a.costPerResult, 0) /
        (ads.filter((a) => a.costPerResult > 0).length || 1) || 0;
    const threshold = avgCpr * 2; // 2x average = expensive

    return [...ads]
      .filter((a) => {
        if (a.spend <= 0) return false;
        const results = a.leads + a.purchases;
        // Zero results
        if (results === 0) return true;
        // Cost per result > 2x average
        if (threshold > 0 && a.costPerResult > threshold) return true;
        return false;
      })
      .sort((a, b) => b.spend - a.spend);
  }, [ads]);

  const totalAds = ads.length;
  const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
  const totalLeads = ads.reduce((s, a) => s + a.leads, 0);
  const totalPurchases = ads.reduce((s, a) => s + a.purchases, 0);
  const totalRevenue = ads.reduce((s, a) => s + (a.revenue || 0), 0);
  const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const avgCtr =
    ads.length > 0 ? ads.reduce((s, a) => s + a.ctr, 0) / ads.length : 0;
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mx-auto" />
          <p className="text-sm text-gray-400">טוען נתוני מודעות...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10">
        <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-bold text-red-700">שגיאה בטעינת מודעות</p>
          <p className="mt-1 text-sm text-red-600">{error}</p>
          <button onClick={onBack} className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
            חזור
          </button>
        </div>
      </div>
    );
  }

  if (ads.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-gray-500">אין מודעות לתקופה הנבחרת</p>
        <button onClick={onBack} className="mt-4 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
          חזור לדשבורד
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-extrabold text-gray-900">🏆 מודעה מנצחת</h2>
        <button
          onClick={onBack}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          ← חזור לדשבורד
        </button>
      </div>

      {/* Account Selector */}
      {accounts.length > 0 && (
        <div className={`mb-6 ${GLASS} p-1.5`}>
          <div className="flex items-center gap-1 overflow-x-auto">
            {accounts.length > 1 && (
              <>
                <button
                  onClick={() => onChangeAccount("all")}
                  className={`flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                    activeAccountId === "all"
                      ? "bg-amber-50 text-amber-700 shadow-sm"
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
                    ? "bg-amber-50 text-amber-700 shadow-sm"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }`}
              >
                {acc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Date Range Presets */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
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

      {/* Campaign Filter */}
      {availableCampaigns.length > 1 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">🎯 קמפיין:</span>
          <select
            value={campaignId}
            onChange={(e) => onChangeCampaign(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 outline-none transition-all focus:border-blue-400 max-w-[300px]"
          >
            <option value="">כל הקמפיינים ({availableCampaigns.length})</option>
            {availableCampaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {campaignId && (
            <button
              onClick={() => onChangeCampaign("")}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
            >
              ✕ נקה
            </button>
          )}
        </div>
      )}

      {/* KPI Row */}
      <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          <div>
            <div className="text-xs font-bold text-amber-800">לא בטוח שהמדידה נכונה?</div>
            <div className="text-[10px] text-amber-700">לחץ כדי לראות אילו אירועים Meta מחזיר ולוודא שלידים ורכישות נספרים נכון (כולל המרות מותאמות אישית)</div>
          </div>
        </div>
        <MetaActionsDebug
          accounts={accounts}
          activeAccountId={activeAccountId}
          datePreset={datePreset}
        />
      </div>
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-7">
        {[
          { label: "מודעות", value: String(totalAds), icon: "📢" },
          { label: "הוצאה כוללת", value: fmtCurrency(totalSpend), icon: "💰" },
          { label: 'סה"כ לידים', value: String(totalLeads), icon: "👥" },
          { label: 'סה"כ רכישות', value: String(totalPurchases), icon: "🛒" },
          { label: "CTR ממוצע", value: fmtPct(avgCtr), icon: "📊" },
          { label: "CPL ממוצע", value: avgCpl > 0 ? fmtCurrency(avgCpl) : "—", icon: "🎯" },
          { label: "החזר השקעה (ROAS)", value: overallRoas > 0 ? fmtRoas(overallRoas) : "—", icon: "📈" },
        ].map((kpi) => (
          <div key={kpi.label} className={`${GLASS} p-4 text-center`}>
            <div className="text-xs text-gray-500">{kpi.icon} {kpi.label}</div>
            <div className="mt-1 text-2xl font-extrabold text-gray-900">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Category Winners */}
      <div className="mb-8">
        <h3 className="mb-4 text-lg font-bold text-gray-900">מודעות מנצחות</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Best Results */}
          {bestResults && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-lg">🥇</span>
                <span className="text-xs font-bold text-amber-700">הכי הרבה תוצאות</span>
              </div>
              <div className="flex gap-3">
                {bestResults.thumbnailUrl && (
                  <img src={bestResults.thumbnailUrl} alt="" className="h-16 w-16 flex-shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 truncate text-sm font-bold text-gray-900">{bestResults.adName}</div>
                  <div className="mb-3 truncate text-xs text-gray-400">{bestResults.campaignName}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
                <div>
                  <div className="text-gray-400">תוצאות</div>
                  <div className="text-lg font-extrabold text-gray-900">{bestResults.leads + bestResults.purchases}</div>
                </div>
                <div>
                  <div className="text-gray-400">הוצאה</div>
                  <div className="font-bold text-gray-900">{fmtCurrency(bestResults.spend)}</div>
                </div>
                <div>
                  <div className="text-gray-400">עלות/תוצאה</div>
                  <div className="font-bold text-gray-900">{bestResults.costPerResult > 0 ? fmtDec(bestResults.costPerResult) : "—"}</div>
                </div>
              </div>
            </div>
          )}

          {/* Best CTR */}
          {bestCtr && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-lg">🎯</span>
                <span className="text-xs font-bold text-blue-700">CTR הכי גבוה — ההוק עובד</span>
              </div>
              <div className="flex gap-3">
                {bestCtr.thumbnailUrl && (
                  <img src={bestCtr.thumbnailUrl} alt="" className="h-16 w-16 flex-shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 truncate text-sm font-bold text-gray-900">{bestCtr.adName}</div>
                  <div className="mb-3 truncate text-xs text-gray-400">{bestCtr.campaignName}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
                <div>
                  <div className="text-gray-400">CTR</div>
                  <div className="text-lg font-extrabold text-blue-700">{fmtPct(bestCtr.ctr)}</div>
                </div>
                <div>
                  <div className="text-gray-400">קליקים</div>
                  <div className="font-bold text-gray-900">{fmtN(bestCtr.clicks)}</div>
                </div>
                <div>
                  <div className="text-gray-400">חשיפות</div>
                  <div className="font-bold text-gray-900">{fmtN(bestCtr.impressions)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Best Cost Per Result */}
          {bestCostPerResult && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-lg">💰</span>
                <span className="text-xs font-bold text-emerald-700">עלות לתוצאה הכי נמוכה</span>
              </div>
              <div className="flex gap-3">
                {bestCostPerResult.thumbnailUrl && (
                  <img src={bestCostPerResult.thumbnailUrl} alt="" className="h-16 w-16 flex-shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 truncate text-sm font-bold text-gray-900">{bestCostPerResult.adName}</div>
                  <div className="mb-3 truncate text-xs text-gray-400">{bestCostPerResult.campaignName}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
                <div>
                  <div className="text-gray-400">עלות/תוצאה</div>
                  <div className="text-lg font-extrabold text-emerald-700">{fmtDec(bestCostPerResult.costPerResult)}</div>
                </div>
                <div>
                  <div className="text-gray-400">תוצאות</div>
                  <div className="font-bold text-gray-900">{bestCostPerResult.leads + bestCostPerResult.purchases}</div>
                </div>
                <div>
                  <div className="text-gray-400">הוצאה</div>
                  <div className="font-bold text-gray-900">{fmtCurrency(bestCostPerResult.spend)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Money Burners */}
      {moneyBurners.length > 0 && (
        <div className="mb-8">
          <h3 className="mb-4 text-lg font-bold text-gray-900">🔥 מודעות שמפסידות כסף</h3>
          <div className="overflow-hidden rounded-2xl border border-red-200 bg-red-50/50">
            <table className="w-full">
              <thead>
                <tr className="border-b border-red-200 bg-red-50">
                  {["שם מודעה", "קמפיין", "הוצאה", "תוצאות", "עלות/תוצאה", "חשיפות", "CTR", "CPC", "סיבה"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-center text-xs font-bold text-red-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {moneyBurners.slice(0, 10).map((ad, i) => {
                  const results = ad.leads + ad.purchases;
                  const isZero = results === 0;
                  return (
                    <tr key={ad.adName + i} className={`border-b border-red-100 ${i % 2 === 0 ? "bg-white" : "bg-red-50/30"}`}>
                      <td className="max-w-[200px] truncate px-3 py-2 text-right text-sm font-medium text-gray-900">{ad.adName}</td>
                      <td className="max-w-[150px] truncate px-3 py-2 text-right text-xs text-gray-500">{ad.campaignName}</td>
                      <td className="px-3 py-2 text-center text-sm font-bold text-red-700">{fmtCurrency(ad.spend)}</td>
                      <td className={`px-3 py-2 text-center text-sm font-bold ${isZero ? "text-red-600" : "text-gray-900"}`}>
                        {isZero ? "0" : results}
                      </td>
                      <td className="px-3 py-2 text-center text-sm font-semibold text-red-600">
                        {ad.costPerResult > 0 ? fmtDec(ad.costPerResult) : "—"}
                      </td>
                      <td className="px-3 py-2 text-center text-sm text-gray-700">{fmtN(ad.impressions)}</td>
                      <td className="px-3 py-2 text-center text-sm text-gray-700">{fmtPct(ad.ctr)}</td>
                      <td className="px-3 py-2 text-center text-sm text-gray-700">{fmtDec(ad.cpc)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isZero ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                          {isZero ? "0 תוצאות" : "עלות גבוהה"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-red-200 bg-red-50">
                  <td colSpan={2} className="px-3 py-2.5 text-right text-xs font-bold text-red-700">
                    סה״כ: {moneyBurners.length} מודעות מפסידות
                  </td>
                  <td className="px-3 py-2.5 text-center text-sm font-extrabold text-red-700">
                    {fmtCurrency(moneyBurners.reduce((s, a) => s + a.spend, 0))}
                  </td>
                  <td colSpan={6} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* All Ads Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">כל המודעות</h3>
            <span className="text-xs text-gray-400">{totalAds} מודעות · ממוין לפי תוצאות</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {["#", "תצוגה", "שם מודעה", "קמפיין", "הוצאה", "חשיפות", "CTR", "CPC", "CPM", "לידים", "רכישות", "עלות/תוצאה", "איכות", "מעורבות", "המרה"].map((h) => (
                  <th key={h} className="px-3 py-3 text-center text-xs font-bold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((ad, i) => {
                const results = ad.leads + ad.purchases;
                return (
                  <tr key={ad.adName + i} className={`border-b border-gray-100 transition-colors hover:bg-blue-50/50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}>
                    <td className="px-3 py-2.5 text-center text-sm font-bold text-gray-400">{i + 1}</td>
                    <td className="px-2 py-1.5 text-center">
                      {ad.thumbnailUrl ? (
                        <img src={ad.thumbnailUrl} alt="" className="mx-auto h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded bg-gray-100 text-gray-400 text-xs">📷</div>
                      )}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 text-right text-sm font-medium text-gray-900">{ad.adName}</td>
                    <td className="max-w-[150px] truncate px-3 py-2.5 text-right text-xs text-gray-500">{ad.campaignName}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-semibold text-gray-900">{fmtCurrency(ad.spend)}</td>
                    <td className="px-3 py-2.5 text-center text-sm text-gray-700">{fmtN(ad.impressions)}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-semibold text-gray-900">{fmtPct(ad.ctr)}</td>
                    <td className="px-3 py-2.5 text-center text-sm text-gray-700">{fmtDec(ad.cpc)}</td>
                    <td className="px-3 py-2.5 text-center text-sm text-gray-700">{fmtDec(ad.cpm)}</td>
                    <td className={`px-3 py-2.5 text-center text-sm font-bold ${ad.leads > 0 ? "text-gray-900" : "text-gray-400"}`}>{ad.leads || "—"}</td>
                    <td className={`px-3 py-2.5 text-center text-sm font-bold ${ad.purchases > 0 ? "text-gray-900" : "text-gray-400"}`}>{ad.purchases || "—"}</td>
                    <td className={`px-3 py-2.5 text-center text-sm font-semibold ${ad.costPerResult > 0 ? "text-gray-900" : "text-gray-400"}`}>{ad.costPerResult > 0 ? fmtDec(ad.costPerResult) : "—"}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500">{rankLabel(ad.quality)}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500">{rankLabel(ad.engagement)}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500">{rankLabel(ad.conversion)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-bold text-gray-900">{title}</h3>
        <p className="mb-6 text-sm leading-relaxed text-gray-500">
          {message}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all ${danger ? "bg-red-600 hover:bg-red-500" : "bg-blue-600 hover:bg-blue-500"}`}
          >
            אישור
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-600 transition-all hover:bg-gray-100"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

function KPICard({
  label,
  value,
  sub,
  color,
  icon,
  status,
  large,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: string;
  status?: "good" | "warning" | "bad";
  large?: boolean;
}) {
  const accents: Record<string, { bar: string; iconBg: string }> = {
    blue: { bar: "bg-blue-500", iconBg: "bg-blue-50" },
    green: { bar: "bg-emerald-500", iconBg: "bg-emerald-50" },
    red: { bar: "bg-red-500", iconBg: "bg-red-50" },
    amber: { bar: "bg-amber-500", iconBg: "bg-amber-50" },
    purple: { bar: "bg-purple-500", iconBg: "bg-purple-50" },
    cyan: { bar: "bg-cyan-500", iconBg: "bg-cyan-50" },
  };
  const a = accents[color] || accents.blue;
  const statusColors = {
    good: "bg-emerald-500",
    warning: "bg-amber-500",
    bad: "bg-red-500",
  };

  return (
    <div
      className={`group relative overflow-hidden ${GLASS} ${GLASS_HOVER} p-5 md:p-6`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-[2px] ${a.bar} opacity-60`}
      />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2.5">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${a.iconBg} text-lg`}
          >
            {icon}
          </div>
          <span className="text-sm font-medium text-gray-500">{label}</span>
          {status && (
            <span
              className={`h-2 w-2 rounded-full ${statusColors[status]}`}
            />
          )}
        </div>
        <div
          className={`font-bold tracking-tight text-gray-900 ${large ? "text-4xl md:text-5xl" : "text-3xl md:text-4xl"}`}
        >
          {value}
        </div>
        {sub && (
          <div className="mt-2.5 text-[13px] leading-relaxed text-gray-400">
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
      <div
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {step}
      </div>
      <div className="w-28 flex-shrink-0 text-left text-sm font-medium text-gray-700">
        {label}
      </div>
      <div className="relative flex-1">
        <div className="h-10 overflow-hidden rounded-xl bg-gray-100">
          <div
            className="flex h-full items-center rounded-xl pr-3 transition-all duration-700"
            style={{
              width: `${w}%`,
              background: `linear-gradient(90deg, ${color}cc, ${color}55)`,
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
      {w <= 15 && (
        <span className="min-w-[40px] text-left text-xs font-semibold text-gray-900">
          {fmtN(value)}
        </span>
      )}
      {rate && (
        <div
          className="min-w-[70px] rounded-lg px-2 py-1 text-center text-xs font-semibold"
          style={{ backgroundColor: `${color}15`, color: color }}
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
        <h2 className="text-lg font-bold text-gray-900">מגמת רווח יומי</h2>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            רווח
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" />
            הפסד
          </span>
        </div>
      </div>
      <div className="flex items-end gap-[3px]" style={{ height: 100 }}>
        {bars.map((b, i) => {
          if (!b.active) {
            return (
              <div key={i} className="flex-1" title={b.date}>
                <div className="mx-auto h-[2px] w-full rounded-full bg-gray-100" />
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
                className={`w-full rounded-t-md transition-all duration-200 group-hover/bar:opacity-100 ${isProfit ? "bg-emerald-500 group-hover/bar:bg-emerald-400" : "bg-red-400 group-hover/bar:bg-red-500"}`}
                style={{ height: `${h}%` }}
              />
            </div>
          );
        })}
      </div>
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

// 5-level scale gauge
function ScaleGauge({ level }: { level: ScaleLevel }) {
  const segments: { key: ScaleLevel; color: string; activeColor: string }[] = [
    { key: "poor", color: "bg-red-500/20", activeColor: "bg-red-500" },
    { key: "below_avg", color: "bg-orange-500/20", activeColor: "bg-orange-500" },
    { key: "average", color: "bg-yellow-500/20", activeColor: "bg-yellow-500" },
    { key: "good", color: "bg-emerald-500/20", activeColor: "bg-emerald-500" },
    { key: "excellent", color: "bg-blue-500/20", activeColor: "bg-blue-500" },
  ];
  const activeIdx = segments.findIndex((s) => s.key === level);
  return (
    <div className="flex gap-1">
      {segments.map((s, i) => (
        <div
          key={s.key}
          className={`h-1.5 flex-1 rounded-full transition-all ${
            i <= activeIdx ? s.activeColor : s.color
          }`}
        />
      ))}
    </div>
  );
}

// Overall health score (circular SVG)
function OverallHealthScore({
  score,
  level,
}: {
  score: number;
  level: ScaleLevel;
}) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const colors: Record<ScaleLevel, string> = {
    poor: "#ef4444",
    below_avg: "#f97316",
    average: "#eab308",
    good: "#22c55e",
    excellent: "#3b82f6",
  };
  const color = colors[level];
  return (
    <div className="relative h-20 w-20 flex-shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth="6"
        />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-gray-900">{score}</span>
        <span className="text-[9px] text-gray-400">/100</span>
      </div>
    </div>
  );
}

// Individual metric recommendation card
function SmartRecommendationCard({ metric }: { metric: MetricScale }) {
  const levelLabels: Record<ScaleLevel, string> = {
    poor: "חלש",
    below_avg: "מתחת לממוצע",
    average: "ממוצע",
    good: "טוב",
    excellent: "מצוין",
  };
  const levelStyles: Record<
    ScaleLevel,
    { text: string; bg: string; border: string; pill: string }
  > = {
    poor: {
      text: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-200",
      pill: "bg-red-100 text-red-700",
    },
    below_avg: {
      text: "text-orange-600",
      bg: "bg-orange-50",
      border: "border-orange-200",
      pill: "bg-orange-100 text-orange-700",
    },
    average: {
      text: "text-yellow-600",
      bg: "bg-yellow-50",
      border: "border-yellow-200",
      pill: "bg-yellow-100 text-yellow-700",
    },
    good: {
      text: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      pill: "bg-emerald-100 text-emerald-700",
    },
    excellent: {
      text: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-200",
      pill: "bg-blue-100 text-blue-700",
    },
  };
  const s = levelStyles[metric.level];
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${s.border} ${s.bg} p-5 transition-all hover:border-opacity-40`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{metric.icon}</span>
          <span className="text-sm font-medium text-gray-600">
            {metric.label}
          </span>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.pill}`}
        >
          {levelLabels[metric.level]}
        </span>
      </div>
      <div className={`mb-3 text-3xl font-bold ${s.text}`}>
        {metric.formattedValue}
      </div>
      <div className="mb-4">
        <ScaleGauge level={metric.level} />
      </div>
      <p className="text-[13px] leading-relaxed text-gray-500">
        {metric.recommendation}
      </p>
    </div>
  );
}

// Funnel drop-off indicator
function FunnelDropoff({ from, to }: { from: number; to: number }) {
  if (from <= 0) return null;
  const dropPct = ((from - to) / from) * 100;
  return (
    <div className="flex items-center gap-2 py-0.5 pr-12 text-xs">
      <span className="text-gray-600">↓</span>
      <span
        className={dropPct > 50 ? "text-red-400/60" : "text-gray-500/60"}
      >
        {dropPct.toFixed(1)}% נשרו
      </span>
    </div>
  );
}

// Campaign Results — prominent results display
function CampaignResultsBanner({
  goalLabel,
  totalResults,
  costPerResult,
  totalLeads,
  cpl,
  totalPurchases,
  cpa,
  totalRevenue,
  campaignGoal,
}: {
  goalLabel: string;
  totalResults: number;
  costPerResult: number;
  totalLeads: number;
  cpl: number;
  totalPurchases: number;
  cpa: number;
  totalRevenue: number;
  campaignGoal: CampaignGoal;
}) {
  const hasData = totalResults > 0 || totalLeads > 0 || totalPurchases > 0;
  if (!hasData) return null;

  return (
    <div
      className={`mb-5 overflow-hidden ${GLASS} relative`}
    >
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-l from-blue-500 via-purple-500 to-cyan-500" />
      <div className="p-5 md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900">📊 תוצאות הקמפיין</span>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-500">
            מטרה: {goalLabel}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="mb-1 text-xs font-medium text-blue-600">
              {goalLabel} (סה״כ)
            </div>
            <div className="text-2xl font-extrabold text-blue-700 md:text-3xl">
              {campaignGoal === "revenue"
                ? fmtCurrency(totalResults)
                : fmtN(totalResults)}
            </div>
          </div>

          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
            <div className="mb-1 text-xs font-medium text-purple-600">
              עלות ל{goalLabel.replace("₪", "").trim()}
            </div>
            <div className="text-2xl font-extrabold text-purple-700 md:text-3xl">
              {costPerResult > 0 ? fmtDec(costPerResult) : "-"}
            </div>
          </div>

          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
            <div className="mb-1 text-xs font-medium text-cyan-600">
              לידים (נרשמו)
            </div>
            <div className="text-2xl font-extrabold text-cyan-700 md:text-3xl">
              {fmtN(totalLeads)}
            </div>
          </div>

          <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
            <div className="mb-1 text-xs font-medium text-teal-600">
              עלות ליד (CPL)
            </div>
            <div className="text-2xl font-extrabold text-teal-700 md:text-3xl">
              {cpl > 0 ? fmtDec(cpl) : "-"}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="mb-1 text-xs font-medium text-emerald-600">
              רכישות
            </div>
            <div className="text-2xl font-extrabold text-emerald-700 md:text-3xl">
              {fmtN(totalPurchases)}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="mb-1 text-xs font-medium text-amber-600">
              עלות לרכישה (CPA)
            </div>
            <div className="text-2xl font-extrabold text-amber-700 md:text-3xl">
              {cpa > 0 ? fmtDec(cpa) : "-"}
            </div>
          </div>
        </div>
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
      className="w-full bg-transparent px-2 py-2 text-center text-sm text-gray-800 outline-none transition-colors [appearance:textfield] hover:bg-blue-50/60 focus:bg-blue-50 focus:ring-1 focus:ring-blue-400/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
      className={`px-2 py-2 text-center text-sm font-semibold ${c} ${best ? "bg-amber-50 ring-2 ring-inset ring-amber-400/50" : "bg-violet-50/40"}`}
    >
      <div className="flex items-center justify-center gap-1">
        {best && <span className="text-[10px]">🏆</span>}
        <span>{f(v)}</span>
      </div>
    </td>
  );
}

function StaticCell({ value }: { value: string }) {
  return (
    <td className="px-2 py-2 text-center text-sm text-gray-800">
      {value || "—"}
    </td>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════

export function Dashboard({
  user,
}: {
  user: AdUser | null;
}) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState("summary");
  const [timeView, setTimeView] = useState<"daily" | "weekly" | "monthly">(
    "daily"
  );
  const [showAI, setShowAI] = useState(false);
  const [showWinningAds, setShowWinningAds] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [showInstagram, setShowInstagram] = useState(false);
  const [showSeo, setShowSeo] = useState(false);
  const [diagDatePreset, setDiagDatePreset] = useState<DatePreset>("this_month");
  const [diagAccountId, setDiagAccountId] = useState("summary");
  const [diagCampaignId, setDiagCampaignId] = useState<string>("");
  const [diagCampaigns, setDiagCampaigns] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [diagSum, setDiagSum] = useState<typeof sum | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [winningAds, setWinningAds] = useState<AdInsight[]>([]);
  const [winningAdsLoading, setWinningAdsLoading] = useState(false);
  const [winningAdsError, setWinningAdsError] = useState<string | null>(null);
  const [winningAdsAccountId, setWinningAdsAccountId] = useState("all");
  const [winningAdsDatePreset, setWinningAdsDatePreset] = useState<DatePreset>("this_month");
  const [winningAdsCampaignId, setWinningAdsCampaignId] = useState<string>("");
  const [winningAdsCampaigns, setWinningAdsCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [aiTab, setAiTab] = useState<"import" | "export">("import");
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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenSubmitting, setTokenSubmitting] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<
    Record<string, SyncStatus>
  >({});
  const [isBackgroundSync, setIsBackgroundSync] = useState(false);
  const [activeDatePreset, setActiveDatePreset] = useState<DatePreset>("this_month");
  const [mainCampaignId, setMainCampaignId] = useState<string>("");
  const [mainCampaigns, setMainCampaigns] = useState<Array<{ id: string; name: string; status: string }>>([]);

  // ─── Cache helpers ───
  const CACHE_KEY = "ad-dashboard-cache";

  const saveToCache = useCallback((accs: Account[], s: Settings) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        accounts: accs,
        settings: s,
        cachedAt: Date.now(),
      }));
    } catch { /* ignore */ }
  }, []);

  const loadFromCache = useCallback((): { accounts: Account[]; settings: Settings; cachedAt: number } | null => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.accounts?.length) return parsed;
    } catch { /* ignore */ }
    return null;
  }, []);

  // ─── Load data from API ───
  useEffect(() => {
    if (!user) {
      // No user — use localStorage fallback (demo mode)
      try {
        const saved = localStorage.getItem("ad-dashboard-v4");
        if (saved) {
          const d = JSON.parse(saved);
          if (d.settings) setSettings(d.settings);
          if (d.accounts?.length) setAccounts(d.accounts);
        }
      } catch {
        /* ignore */
      }
      setIsLoading(false);
      return;
    }

    // Authenticated — try cache first, then sync in background
    const cached = loadFromCache();

    if (cached) {
      // Instant load from cache
      setAccounts(cached.accounts);
      if (cached.settings) setSettings(cached.settings);
      setIsLoading(false);
      setIsBackgroundSync(true);
    }

    const loadData = async () => {
      try {
        // 1. Fetch accounts from Meta
        const accountsRes = await fetch("/api/ad-dashboard/accounts");
        if (!accountsRes.ok) throw new Error("Failed to fetch accounts");
        const { accounts: accs } = await accountsRes.json();

        if (accs?.length) {
          const s = settings;

          // 2. If no cache, show accounts with empty days first
          if (!cached) {
            const emptyAccounts: Account[] = accs.map((acc: { id: string; name: string; metaAccountId?: string }) => ({
              id: acc.id,
              name: acc.name,
              metaAccountId: acc.metaAccountId,
              days: generateEmptyDays(s.month, s.year),
            }));
            setAccounts(emptyAccounts);
            setIsLoading(false);
          }

          // 3. Sync ALL accounts in parallel from Meta (background)
          const syncIds = accs.map((acc: { id: string }) => acc.id);
          await Promise.all(
            syncIds.map((id: string) => syncAccount(id, s.month, s.year))
          );
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
        if (!cached) {
          setLoadError(err instanceof Error ? err.message : "שגיאה בטעינת נתונים");
        }
      } finally {
        setIsLoading(false);
        setIsBackgroundSync(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ─── Persistence for non-authenticated users ───
  useEffect(() => {
    if (user) return; // Don't use localStorage when authenticated
    try {
      localStorage.setItem(
        "ad-dashboard-v4",
        JSON.stringify({ settings, accounts })
      );
    } catch {
      /* ignore */
    }
  }, [settings, accounts, user]);

  // ─── Sync from Meta ───
  const syncAccount = useCallback(
    async (accountId: string, month: number, year: number, force = false, opts?: { since?: string; until?: string; campaignId?: string }) => {
      setSyncStatus((prev) => ({
        ...prev,
        [accountId]: { lastSynced: null, isSyncing: true, error: null },
      }));

      try {
        const body: Record<string, unknown> = {
          accountId,
          force,
          leadActionType: settings.leadActionTypes?.[accountId] || settings.leadActionType || "auto",
        };
        if (opts?.since && opts?.until) {
          body.since = opts.since;
          body.until = opts.until;
        } else {
          body.month = month;
          body.year = year;
        }
        if (opts?.campaignId) {
          body.campaignId = opts.campaignId;
        }

        const res = await fetch("/api/ad-dashboard/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || `שגיאה בסנכרון (${res.status})`);
        }

        if (data.synced && data.data) {
          // Merge sync data directly into account days
          setAccounts((prev) =>
            prev.map((acc) => {
              if (acc.id !== accountId) return acc;
              const days = [...acc.days];
              for (const insight of data.data) {
                // "2026-03-15" → day 15
                const parts = insight.date.split("-");
                if (parts.length !== 3) continue;
                const dayNum = parseInt(parts[2]);
                if (dayNum >= 1 && dayNum <= days.length) {
                  days[dayNum - 1] = {
                    ...days[dayNum - 1],
                    adSpend: insight.adSpend || 0,
                    impressions: insight.impressions || 0,
                    uniqueClicks: insight.uniqueClicks || 0,
                    landingPageViews: insight.landingPageViews || 0,
                    registrations: insight.registrations || 0,
                    purchases: insight.purchases || 0,
                    revenue: insight.revenue || 0,
                  };
                }
              }
              return { ...acc, days };
            })
          );
        }

        setSyncStatus((prev) => ({
          ...prev,
          [accountId]: {
            lastSynced: data.lastSynced || data.last_synced || null,
            isSyncing: false,
            error: null,
          },
        }));

        // Save to cache after successful sync
        setAccounts((current) => {
          saveToCache(current, settings);
          return current;
        });
      } catch (err) {
        setSyncStatus((prev) => ({
          ...prev,
          [accountId]: {
            lastSynced: null,
            isSyncing: false,
            error: err instanceof Error ? err.message : "Sync failed",
          },
        }));
      }
    },
    [settings.leadActionTypes, settings.leadActionType, settings, saveToCache]
  );

  // ─── Load campaigns when account changes ───
  const loadCampaigns = useCallback(async (accountId: string) => {
    if (!user || accountId === "summary") {
      setMainCampaigns([]);
      return;
    }
    try {
      const res = await fetch(`/api/ad-dashboard/campaigns?accountId=${accountId}`);
      if (res.ok) {
        const { campaigns } = await res.json();
        setMainCampaigns(campaigns || []);
      }
    } catch {
      setMainCampaigns([]);
    }
  }, [user]);

  // ─── Re-sync all accounts with current preset + campaign ───
  const syncWithPreset = useCallback((preset: DatePreset, campaignId?: string) => {
    const { since, until } = getDateRange(preset);
    // Update month/year from preset for the grid
    const m = parseInt(since.split("-")[1]);
    const y = parseInt(since.split("-")[0]);
    setSettings((p) => ({ ...p, month: m, year: y }));
    // Regenerate days grid for the month
    setAccounts((prev) => prev.map((acc) => ({
      ...acc,
      days: generateEmptyDays(m, y),
    })));
    // Sync with date range
    for (const acc of accounts) {
      syncAccount(acc.id, m, y, true, { since, until, campaignId });
    }
  }, [accounts, syncAccount]);

  // ─── Handle date preset change ───
  const handleDatePresetChange = useCallback((preset: DatePreset) => {
    setActiveDatePreset(preset);
    syncWithPreset(preset, mainCampaignId || undefined);
  }, [syncWithPreset, mainCampaignId]);

  // ─── Handle campaign change ───
  const handleCampaignChange = useCallback((campaignId: string) => {
    setMainCampaignId(campaignId);
    syncWithPreset(activeDatePreset, campaignId || undefined);
  }, [syncWithPreset, activeDatePreset]);

  // ─── Load campaigns on account change ───
  useEffect(() => {
    if (activeAccountId && activeAccountId !== "summary") {
      loadCampaigns(activeAccountId);
      setMainCampaignId(""); // Reset campaign filter
    } else {
      setMainCampaigns([]);
      setMainCampaignId("");
    }
  }, [activeAccountId, loadCampaigns]);

  // ─── Computed data ───
  const activeAccount = accounts.find((a) => a.id === activeAccountId);
  const isEditable =
    timeView === "daily" &&
    (activeAccountId !== "summary" || accounts.length === 1);

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

  const adLeaderboard = useMemo(
    () => calcAdLeaderboard(activeDays, settings.campaignGoal),
    [activeDays, settings.campaignGoal]
  );

  const smartRecs = useMemo(
    () => getSmartRecommendations(activeDays, settings.vatRate),
    [activeDays, settings.vatRate]
  );

  // Campaign results — computed based on campaign goal
  const campaignResults = useMemo(() => {
    const goal = settings.campaignGoal;
    let totalResults = 0;
    if (goal === "clicks") totalResults = sum.totalUniqueClicks;
    else if (goal === "landingPageViews") totalResults = sum.totalLPV;
    else if (goal === "registrations") totalResults = sum.totalRegistrations;
    else if (goal === "purchases") totalResults = sum.totalPurchases;
    else if (goal === "revenue") totalResults = sum.totalRevenue;
    const costPerResult = totalResults > 0 ? sum.totalSpend / totalResults : 0;
    const cpl = sum.totalRegistrations > 0 ? sum.totalSpend / sum.totalRegistrations : 0;
    return { totalResults, costPerResult, cpl };
  }, [sum, settings.campaignGoal]);

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
    return {
      label: "סה״כ חודשי",
      day: agg,
      metrics: calcDay(agg, settings.vatRate),
    };
  }, [timeView, activeDays, settings.vatRate]);

  // ─── Handlers ───
  const upDay = useCallback(
    (i: number, field: keyof DayData, val: number | string) => {
      // Determine which account to update
      const targetAccountId =
        activeAccountId === "summary" && accounts.length === 1
          ? accounts[0].id
          : activeAccountId;
      if (!targetAccountId || targetAccountId === "summary") return;

      setAccounts((prev) =>
        prev.map((acc) =>
          acc.id === targetAccountId
            ? {
                ...acc,
                days: acc.days.map((d, j) =>
                  j === i ? { ...d, [field]: val } : d
                ),
              }
            : acc
        )
      );

      // Persist to API if authenticated
      if (user) {
        const day = activeDays[i];
        if (day) {
          // Convert date "15.3" to "2026-03-15"
          const dayNum = parseInt(day.date.split(".")[0]);
          const dateStr = `${settings.year}-${String(settings.month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
          fetch("/api/ad-dashboard/daily-data", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accountId: targetAccountId,
              date: dateStr,
              [field]: val,
            }),
          }).catch(() => {});
        }
      }
    },
    [activeAccountId, user, activeDays, settings.month, settings.year]
  );

  const upSet = useCallback(
    <K extends keyof Settings>(k: K, v: Settings[K]) => {
      setSettings((p) => ({ ...p, [k]: v }));
      if (user) {
        fetch("/api/ad-dashboard/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [k]: v }),
        }).catch(() => {});
      }
    },
    [user]
  );

  const chMonth = useCallback(
    (month: number, year: number) => {
      const hasData = accounts.some((acc) =>
        acc.days.some(
          (d) => d.adSpend > 0 || d.revenue > 0 || d.purchases > 0
        )
      );
      const doChange = () => {
        setSettings((p) => ({ ...p, month, year }));
        if (user) {
          // Show empty grid immediately (no blocking spinner)
          setAccounts((prev) => prev.map((acc) => ({
            ...acc,
            days: generateEmptyDays(month, year),
          })));
          // Sync in background
          Promise.all(
            accounts.map(async (acc) => {
              const dataRes = await fetch(
                `/api/ad-dashboard/daily-data?accountId=${acc.id}&month=${month}&year=${year}`
              );
              let days = generateEmptyDays(month, year);
              if (dataRes.ok) {
                const { rows } = await dataRes.json();
                for (const row of rows) {
                  const dayData = dbRowToDayData(row);
                  const dayNum = parseInt(dayData.date.split(".")[0]);
                  if (dayNum >= 1 && dayNum <= days.length) {
                    days[dayNum - 1] = dayData;
                  }
                }
              }
              return { ...acc, days };
            })
          ).then((updated) => {
            setAccounts(updated);
            // Auto-sync for new month
            for (const acc of updated) {
              syncAccount(acc.id, month, year);
            }
          });
          fetch("/api/ad-dashboard/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ month, year }),
          }).catch(() => {});
        } else {
          setAccounts((prev) =>
            prev.map((acc) => ({
              ...acc,
              days: generateEmptyDays(month, year),
            }))
          );
        }
      };
      if (hasData && !user) {
        setConfirmDialog({
          title: "שינוי חודש",
          message: "שינוי חודש ימחק את כל הנתונים הקיימים. להמשיך?",
          onConfirm: () => {
            doChange();
            setConfirmDialog(null);
          },
          danger: true,
        });
      } else {
        doChange();
      }
    },
    [accounts, user, syncAccount]
  );

  const loadDemo = useCallback(() => {
    setConfirmDialog({
      title: "טעינת דאטה לדוגמה",
      message:
        "פעולה זו תחליף את כל הנתונים הקיימים בדאטה לדוגמה. להמשיך?",
      onConfirm: () => {
        const demoAccounts =
          accounts.length > 0
            ? accounts
            : [
                {
                  id: "1",
                  name: "חשבון 1",
                  days: generateEmptyDays(settings.month, settings.year),
                },
              ];
        setAccounts(
          demoAccounts.map((acc, idx) => ({
            ...acc,
            days: generateDemo(settings.month, settings.year, idx),
          }))
        );
        setSettings((p) => ({
          ...p,
          businessName: p.businessName || "העסק שלי",
        }));
        setConfirmDialog(null);
      },
    });
  }, [settings.month, settings.year, accounts]);

  const clearAll = useCallback(() => {
    setConfirmDialog({
      title: "ניקוי נתונים",
      message:
        activeAccountId === "summary"
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
                ? {
                    ...acc,
                    days: generateEmptyDays(
                      settings.month,
                      settings.year
                    ),
                  }
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

  const doExport = useCallback(() => {
    if (user) {
      // Download from API
      window.open("/api/ad-dashboard/export", "_blank");
      return "";
    }
    if (activeAccountId === "summary") {
      const accsWithData = accounts.map((acc) => ({
        id: acc.id,
        name: acc.name,
        days: acc.days.filter(
          (d) => d.adSpend > 0 || d.revenue > 0 || d.purchases > 0
        ),
      }));
      return JSON.stringify(
        {
          settings,
          accounts: accsWithData,
          _lastUpdated: new Date().toISOString(),
        },
        null,
        2
      );
    }
    const act = (activeAccount?.days || []).filter(
      (d: DayData) => d.adSpend > 0 || d.revenue > 0 || d.purchases > 0
    );
    return JSON.stringify(
      {
        settings,
        accountId: activeAccountId,
        accountName: activeAccount?.name,
        days: act,
      },
      null,
      2
    );
  }, [accounts, activeAccount, activeAccountId, settings, user]);

  const doImport = useCallback(() => {
    try {
      const data = JSON.parse(jsonIn);

      if (user) {
        // Send to API
        fetch("/api/ad-dashboard/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: jsonIn,
        })
          .then((res) => res.json())
          .then((result) => {
            if (result.ok) {
              setImportMsg({
                ok: true,
                msg: result.message || "יובא בהצלחה",
              });
              setJsonIn("");
              // Reload
              window.location.reload();
            } else {
              setImportMsg({
                ok: false,
                msg: result.error || "שגיאה בייבוא",
              });
            }
          });
        return;
      }

      // Local import (no auth)
      if (data.settings) setSettings((p) => ({ ...p, ...data.settings }));
      const mo = data.settings?.month || settings.month;
      const yr = data.settings?.year || settings.year;

      if (data.accounts && Array.isArray(data.accounts)) {
        let importedCount = 0;
        setAccounts((prev) => {
          const updated = [...prev];
          for (const fileAcc of data.accounts) {
            if (!fileAcc.days?.length) continue;
            const idx = updated.findIndex((a) => a.id === fileAcc.id);
            const days = generateEmptyDays(mo, yr);
            for (const d of fileAcc.days) {
              const num = parseInt(d.date?.split(".")[0]);
              if (num >= 1 && num <= days.length) {
                days[num - 1] = { ...EMPTY_DAY, ...d, date: d.date || `${num}.${mo}` };
              }
            }
            if (idx >= 0) {
              updated[idx] = {
                ...updated[idx],
                name: fileAcc.name || updated[idx].name,
                days,
              };
            } else {
              updated.push({
                id: fileAcc.id || String(Date.now()),
                name: fileAcc.name || `חשבון ${updated.length + 1}`,
                days,
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

      if (!data.days || !Array.isArray(data.days)) {
        setImportMsg({ ok: false, msg: 'חסר שדה "days" או "accounts"' });
        return;
      }
      setImportMsg({ ok: true, msg: `יובאו ${data.days.length} ימים` });
      setJsonIn("");
    } catch {
      setImportMsg({ ok: false, msg: "JSON לא תקין" });
    }
  }, [jsonIn, settings.month, settings.year, user]);

  const loadDiagnostic = useCallback(async (forAccountId?: string, preset?: DatePreset, campaignId?: string) => {
    if (!user || accounts.length === 0) return;

    const accId = forAccountId ?? diagAccountId;
    const dateP = preset ?? diagDatePreset;
    const campId = campaignId !== undefined ? campaignId : diagCampaignId;
    setDiagAccountId(accId);
    setDiagDatePreset(dateP);
    setDiagCampaignId(campId);
    setShowDiagnostic(true);
    setShowWinningAds(false);
    setShowInstagram(false);

    // Load campaigns list when account changes (only for single account, not "summary")
    if (forAccountId && forAccountId !== "summary") {
      try {
        const campRes = await fetch(`/api/ad-dashboard/campaigns?accountId=${forAccountId}`);
        const campData = await campRes.json();
        if (campData.campaigns) setDiagCampaigns(campData.campaigns);
      } catch {
        setDiagCampaigns([]);
      }
    } else if (forAccountId === "summary") {
      setDiagCampaigns([]);
    }

    // Use existing dashboard data only when no campaign filter and matches main view
    if (dateP === "this_month" && accId === activeAccountId && !campId) {
      setDiagSum(null);
      return;
    }

    setDiagLoading(true);
    const { since, until } = getDateRange(dateP);
    const targetIds = accId === "summary" ? accounts.map(a => a.id) : [accId];

    try {
      // Fetch all accounts in parallel
      const results = await Promise.all(
        targetIds.map(async (id) => {
          const res = await fetch("/api/ad-dashboard/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountId: id, since, until, leadActionType: getLeadActionType(id), campaignId: campId || undefined }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          if (!data.synced || !data.data) return [];
          return data.data.map((insight: Record<string, unknown>) => ({
            date: insight.date as string,
            adSpend: (insight.adSpend as number) || 0,
            impressions: (insight.impressions as number) || 0,
            uniqueClicks: (insight.uniqueClicks as number) || 0,
            landingPageViews: (insight.landingPageViews as number) || 0,
            registrations: (insight.registrations as number) || 0,
            purchases: (insight.purchases as number) || 0,
            revenue: (insight.revenue as number) || 0,
            adName: "",
            notes: "",
          }));
        })
      );
      setDiagSum(calcSummary(results.flat(), settings.vatRate));
    } catch {
      setDiagSum(null);
    } finally {
      setDiagLoading(false);
    }
  }, [user, accounts, diagAccountId, diagDatePreset, diagCampaignId, activeAccountId, settings.vatRate, settings.leadActionType]);

  const loadWinningAds = useCallback(async (forAccountId?: string, preset?: DatePreset, campId?: string) => {
    if (!user || accounts.length === 0) return;

    const targetAccId = forAccountId || winningAdsAccountId || "all";
    const dateP = preset || winningAdsDatePreset;
    const campaignFilter = campId !== undefined ? campId : winningAdsCampaignId;
    setWinningAdsAccountId(targetAccId);
    setWinningAdsDatePreset(dateP);
    setWinningAdsCampaignId(campaignFilter);

    const { since, until } = getDateRange(dateP);

    // Determine which accounts to fetch
    const targetIds: string[] =
      targetAccId === "all"
        ? accounts.map((a) => a.id)
        : [targetAccId];

    setShowWinningAds(true);
    setWinningAdsLoading(true);
    setWinningAdsError(null);
    try {
      // Fetch all accounts in parallel
      const results = await Promise.all(
        targetIds.map(async (accId) => {
          const res = await fetch("/api/ad-dashboard/ads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accountId: accId,
              since,
              until,
              campaignId: campaignFilter || undefined,
              leadActionType: getLeadActionType(accId),
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "שגיאה");
          return data.ads || [];
        })
      );
      const flatAds = results.flat();
      setWinningAds(flatAds);
      // Only refresh the full campaigns list when we're NOT filtering by a specific campaign,
      // so the filter stays available after the user picks one.
      if (!campaignFilter) {
        const uniq = Array.from(
          new Map(
            flatAds
              .filter((a: AdInsight) => a.campaignId)
              .map((a: AdInsight) => [a.campaignId, a.campaignName])
          ).entries()
        )
          .map(([id, name]) => ({ id: id as string, name: name as string }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setWinningAdsCampaigns(uniq);
      }
    } catch (err) {
      setWinningAdsError(
        err instanceof Error ? err.message : "שגיאה בטעינת מודעות"
      );
    } finally {
      setWinningAdsLoading(false);
    }
  }, [user, accounts, winningAdsAccountId, winningAdsDatePreset, winningAdsCampaignId, settings.leadActionType]);

  const clip = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const profitColor =
    sum.totalNetProfit > 0
      ? "green"
      : sum.totalNetProfit < 0
        ? "red"
        : "blue";
  const roasColor =
    sum.overallRoas >= settings.breakEvenRoas
      ? "green"
      : sum.overallRoas > 0
        ? "amber"
        : "red";

  const levelToStatus = (level: ScaleLevel): "good" | "warning" | "bad" =>
    level === "poor" || level === "below_avg"
      ? "bad"
      : level === "average"
        ? "warning"
        : "good";

  const inputCls =
    "rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 outline-none transition-all focus:border-blue-400 focus:ring-1 focus:ring-blue-100";
  const numInputCls = `${inputCls} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

  const isSyncing = Object.values(syncStatus).some((s) => s.isSyncing);

  // Get lead action type for a specific account (per-account override or global default)
  const getLeadActionType = useCallback((accountId: string) => {
    return settings.leadActionTypes?.[accountId] || settings.leadActionType || "auto";
  }, [settings.leadActionTypes, settings.leadActionType]);

  // Set lead action type for a specific account + auto resync
  const setAccountLeadActionType = useCallback((accountId: string, actionType: string) => {
    const updated = { ...settings.leadActionTypes, [accountId]: actionType };
    upSet("leadActionTypes", updated);
    // Auto resync this account with current preset
    const { since, until } = getDateRange(activeDatePreset);
    syncAccount(accountId, settings.month, settings.year, true, { since, until, campaignId: mainCampaignId || undefined });
  }, [settings.leadActionTypes, settings.month, settings.year, upSet, syncAccount, activeDatePreset, mainCampaignId]);
  const syncErrors = Object.entries(syncStatus).filter(([, s]) => s.error);
  const hasSyncErrors = syncErrors.length > 0;

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  if (isLoading) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-gray-50"
        dir="rtl"
      >
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mx-auto" />
          <p className="text-sm text-gray-400">טוען נתונים...</p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="relative min-h-screen bg-gray-50 text-gray-900"
      dir="rtl"
    >
      <ConfirmDialog
        open={!!confirmDialog}
        title={confirmDialog?.title || ""}
        message={confirmDialog?.message || ""}
        onConfirm={confirmDialog?.onConfirm || (() => {})}
        onCancel={() => setConfirmDialog(null)}
        danger={confirmDialog?.danger}
      />

      {showTokenModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          dir="rtl"
          onClick={(e) => {
            if (e.target === e.currentTarget && !tokenSubmitting) {
              setShowTokenModal(false);
            }
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                🔗 התחבר ל-Meta עם Access Token
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                הדבק את ה-User Access Token שלך מ-Meta. הוא יישמר מקומית
                בקובץ <code className="rounded bg-gray-100 px-1 text-xs">.meta-token.json</code>{" "}
                בתיקיית הפרויקט.
              </p>
              <a
                href="https://developers.facebook.com/tools/explorer/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-blue-600 underline hover:text-blue-800"
              >
                הפק טוקן ב-Graph API Explorer ↗
              </a>
            </div>

            <textarea
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              disabled={tokenSubmitting}
              placeholder="EAAB...   (User Access Token)"
              rows={4}
              className="w-full rounded-xl border border-gray-300 bg-gray-50 p-3 font-mono text-xs text-gray-900 focus:border-blue-400 focus:bg-white focus:outline-none disabled:opacity-50"
              dir="ltr"
              autoFocus
            />

            {tokenError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                ❌ {tokenError}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowTokenModal(false)}
                disabled={tokenSubmitting}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 transition-all hover:bg-gray-50 disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={async () => {
                  const token = tokenInput.trim();
                  if (!token) {
                    setTokenError("הדבק טוקן לפני שמירה");
                    return;
                  }
                  setTokenSubmitting(true);
                  setTokenError(null);
                  try {
                    const res = await fetch(
                      "/api/ad-dashboard/auth/token",
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ token }),
                      }
                    );
                    const data = await res.json();
                    if (!res.ok) {
                      setTokenError(data.error || "שמירת הטוקן נכשלה");
                      setTokenSubmitting(false);
                      return;
                    }
                    try {
                      localStorage.removeItem("ad-dashboard-cache");
                    } catch {
                      /* ignore */
                    }
                    window.location.reload();
                  } catch (err) {
                    setTokenError(
                      err instanceof Error ? err.message : "שגיאת רשת"
                    );
                    setTokenSubmitting(false);
                  }
                }}
                disabled={tokenSubmitting}
                className="rounded-xl border border-blue-300 bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-blue-700 disabled:opacity-50"
              >
                {tokenSubmitting ? "מאמת..." : "אישור ושמירה"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background sync indicator */}
      {isBackgroundSync && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-blue-50 px-4 py-1.5 text-xs text-blue-600">
          <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-blue-500 border-t-transparent" />
          מעדכן נתונים מ-Meta ברקע...
        </div>
      )}

      <div className="mx-auto max-w-[1700px] px-4 py-8 md:px-8 md:py-12">
        {/* HEADER */}
        <header className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Meta Ads Dashboard
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 md:text-5xl">
              אצבע על הדופק
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-gray-500">
              דשבורד מעקב Meta Ads + משפך המרות + רווחיות
              {user && (
                <span className="mr-2 text-blue-600">
                  · מחובר כ-{user.name}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {user && (
              <>
                <button
                  onClick={() => {
                    const { since, until } = getDateRange(activeDatePreset);
                    for (const acc of accounts) {
                      syncAccount(acc.id, settings.month, settings.year, true, { since, until, campaignId: mainCampaignId || undefined });
                    }
                  }}
                  disabled={isSyncing}
                  className={`rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${
                    isSyncing
                      ? "border-blue-300 bg-blue-50 text-blue-600"
                      : "border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50"
                  }`}
                >
                  {isSyncing ? "מסנכרן..." : "🔄 סנכרן מ-Meta"}
                </button>
                <button
                  onClick={() => { setShowDiagnostic(false); setShowInstagram(false); setShowSeo(false); loadWinningAds(); }}
                  className={`rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${
                    showWinningAds
                      ? "border-amber-300 bg-amber-50 text-amber-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-amber-300 hover:bg-amber-50"
                  }`}
                >
                  🏆 מודעה מנצחת
                </button>
                <button
                  onClick={() => { setShowInstagram(false); setShowSeo(false); loadDiagnostic(); }}
                  className={`rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${
                    showDiagnostic
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50"
                  }`}
                >
                  🩺 אבחון מצב
                </button>
                <button
                  onClick={() => { setShowWinningAds(false); setShowDiagnostic(false); setShowSeo(false); setShowInstagram(!showInstagram); }}
                  className={`rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${
                    showInstagram
                      ? "border-purple-300 bg-purple-50 text-purple-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-purple-300 hover:bg-purple-50"
                  }`}
                >
                  📸 אינסטגרם
                </button>
                <button
                  onClick={() => { setShowWinningAds(false); setShowDiagnostic(false); setShowInstagram(false); setShowSeo(!showSeo); }}
                  className={`rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${
                    showSeo
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-emerald-300 hover:bg-emerald-50"
                  }`}
                >
                  📊 SEO
                </button>
              </>
            )}
            {!user && (
              <>
                <button
                  onClick={() => {
                    setTokenInput("");
                    setTokenError(null);
                    setShowTokenModal(true);
                  }}
                  className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 transition-all hover:bg-blue-100"
                >
                  🔗 התחבר ל-Meta
                </button>
                <button
                  onClick={loadDemo}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 transition-all hover:border-gray-300 hover:bg-gray-50"
                >
                  טען דאטה לדוגמה
                </button>
              </>
            )}
            <button
              onClick={clearAll}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 transition-all hover:border-gray-300 hover:bg-gray-50"
            >
              נקה הכל
            </button>
            <button
              onClick={() => setShowAI(!showAI)}
              className={`rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${
                showAI
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50"
              }`}
            >
              📥 ייבוא / ייצוא
            </button>
            {user && (
              <button
                onClick={() =>
                  fetch("/api/ad-dashboard/auth/logout", {
                    method: "POST",
                  }).then(() => (window.location.href = "/ad-dashboard/login"))
                }
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 transition-all hover:border-red-300 hover:bg-red-50"
              >
                התנתק
              </button>
            )}
          </div>
        </header>

        {/* WINNING ADS VIEW */}
        {showWinningAds && (
          <WinningAdsView
            ads={winningAds}
            isLoading={winningAdsLoading}
            error={winningAdsError}
            onBack={() => setShowWinningAds(false)}
            accounts={accounts}
            activeAccountId={winningAdsAccountId}
            onChangeAccount={(id) => { setWinningAdsCampaignId(""); loadWinningAds(id); }}
            datePreset={winningAdsDatePreset}
            onChangeDatePreset={(preset) => loadWinningAds(undefined, preset)}
            campaignId={winningAdsCampaignId}
            onChangeCampaign={(id) => loadWinningAds(undefined, undefined, id)}
            availableCampaigns={winningAdsCampaigns}
          />
        )}

        {/* DIAGNOSTIC VIEW */}
        {showDiagnostic && (
          <DiagnosticView
            sum={diagSum ?? sum}
            breakEvenRoas={settings.breakEvenRoas}
            onBack={() => setShowDiagnostic(false)}
            accounts={accounts}
            activeAccountId={diagAccountId}
            onChangeAccount={(id) => loadDiagnostic(id, undefined, "")}
            datePreset={diagDatePreset}
            onChangeDatePreset={(preset) => loadDiagnostic(undefined, preset)}
            isLoading={diagLoading}
            campaigns={diagCampaigns}
            activeCampaignId={diagCampaignId}
            onChangeCampaign={(id) => loadDiagnostic(undefined, undefined, id)}
          />
        )}

        {/* INSTAGRAM VIEW */}
        {showInstagram && (
          <InstagramView onBack={() => setShowInstagram(false)} />
        )}

        {/* SEO VIEW */}
        {showSeo && (
          <SeoView onBack={() => setShowSeo(false)} />
        )}

        {/* MAIN DASHBOARD (hidden when viewing winning ads, diagnostic, instagram, or seo) */}
        {!showWinningAds && !showDiagnostic && !showInstagram && !showSeo && <>

        {/* LOAD ERROR */}
        {loadError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="text-lg">❌</span>
              <div>
                <div className="text-sm font-bold text-red-700">שגיאה בטעינת נתונים</div>
                <p className="mt-0.5 text-sm text-red-600">{loadError}</p>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="mr-auto rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-all hover:bg-red-100"
              >
                רענן
              </button>
            </div>
          </div>
        )}

        {/* DATE PRESETS */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">📅</span>
          {DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => handleDatePresetChange(p.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                activeDatePreset === p.key
                  ? "bg-gray-900 text-white"
                  : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* SETTINGS */}
        <div
          className={`mb-8 flex flex-wrap items-center gap-4 ${GLASS} p-4 md:gap-6 md:p-5`}
        >
          <label className="flex items-center gap-2 text-sm text-gray-600">
            שם העסק
            <input
              type="text"
              value={settings.businessName}
              onChange={(e) => upSet("businessName", e.target.value)}
              className={inputCls}
              placeholder="הכנס שם..."
            />
          </label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                let m = settings.month - 1;
                let y = settings.year;
                if (m < 1) {
                  m = 12;
                  y--;
                }
                chMonth(m, y);
              }}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-600 transition-all hover:bg-gray-50"
            >
              ←
            </button>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              חודש
              <select
                value={settings.month}
                onChange={(e) =>
                  chMonth(parseInt(e.target.value), settings.year)
                }
                className={inputCls}
              >
                {MONTHS_HE.map((m, i) => (
                  <option key={i} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => {
                let m = settings.month + 1;
                let y = settings.year;
                if (m > 12) {
                  m = 1;
                  y++;
                }
                chMonth(m, y);
              }}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-600 transition-all hover:bg-gray-50"
            >
              →
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
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
          <label className="flex items-center gap-2 text-sm text-gray-600">
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
          <label className="flex items-center gap-2 text-sm text-gray-600">
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
          <label className="flex items-center gap-2 text-sm text-gray-600">
            מטרת קמפיין
            <select
              value={settings.campaignGoal}
              onChange={(e) =>
                upSet("campaignGoal", e.target.value as CampaignGoal)
              }
              className={inputCls}
            >
              {(
                Object.entries(CAMPAIGN_GOAL_LABELS) as [
                  CampaignGoal,
                  string,
                ][]
              ).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {activeAccountId !== "summary" ? (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              אירוע ליד ({activeAccount?.name})
              <select
                value={getLeadActionType(activeAccountId)}
                onChange={(e) => setAccountLeadActionType(activeAccountId, e.target.value)}
                className={inputCls}
              >
                {LEAD_ACTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          ) : accounts.length === 1 ? (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              אירוע ליד
              <select
                value={getLeadActionType(accounts[0].id)}
                onChange={(e) => setAccountLeadActionType(accounts[0].id, e.target.value)}
                className={inputCls}
              >
                {LEAD_ACTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              אירוע ליד (ברירת מחדל)
              <select
                value={settings.leadActionType || "auto"}
                onChange={(e) => upSet("leadActionType", e.target.value)}
                className={inputCls}
              >
                {LEAD_ACTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* SYNC ERROR BANNER */}
        {hasSyncErrors && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-lg">⚠️</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-red-700">
                  שגיאה במשיכת נתונים מ-Meta
                </div>
                <p className="mt-1 text-sm text-red-600">
                  הנתונים המוצגים עלולים להיות חלקיים או לא מעודכנים. החישובים עלולים להיות לא מדויקים.
                </p>
                <div className="mt-2 space-y-1">
                  {syncErrors.map(([accId, status]) => {
                    const accName = accounts.find(a => a.id === accId)?.name || accId;
                    return (
                      <div key={accId} className="text-xs text-red-500">
                        <span className="font-medium">{accName}:</span> {status.error}
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={() => {
                    for (const acc of accounts) {
                      syncAccount(acc.id, settings.month, settings.year, true);
                    }
                  }}
                  className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-all hover:bg-red-100"
                >
                  🔄 נסה שוב
                </button>
              </div>
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
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
            >
              📊 סיכום כולל
            </button>
            <div className="h-6 w-px flex-shrink-0 bg-gray-200" />
            {accounts.map((acc) => {
              const accSum = calcSummary(acc.days, settings.vatRate);
              return (
                <button
                  key={acc.id}
                  onClick={() => setActiveAccountId(acc.id)}
                  className={`group relative flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                    activeAccountId === acc.id
                      ? "bg-purple-50 text-purple-700 shadow-sm"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }`}
                >
                  <span>{acc.name}</span>
                  {accSum.totalSpend > 0 && (
                    <span className="mr-2 text-[10px] text-gray-500">
                      {fmtCurrency(accSum.totalSpend)}
                    </span>
                  )}
                  {accounts.length > 1 && !user && (
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
            {!user && (
              <button
                onClick={addAccount}
                className="flex-shrink-0 rounded-xl px-3 py-2.5 text-lg text-gray-400 transition-all hover:bg-gray-50 hover:text-gray-600"
              >
                +
              </button>
            )}
          </div>
        </div>

        {/* ACCOUNT NAME */}
        {activeAccount && (
          <div className="-mt-4 mb-8 flex items-center gap-3 px-2">
            <span className="text-xs text-gray-500">שם חשבון:</span>
            <input
              type="text"
              value={activeAccount.name}
              onChange={(e) =>
                renameAccount(activeAccountId, e.target.value)
              }
              className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-sm text-gray-900 outline-none transition-all focus:border-purple-400"
              readOnly={!!user}
            />
            {syncStatus[activeAccountId] && (
              <span className={`text-xs ${syncStatus[activeAccountId].error ? "text-red-600 font-medium" : "text-gray-500"}`}>
                {syncStatus[activeAccountId].isSyncing
                  ? "מסנכרן..."
                  : syncStatus[activeAccountId].error
                    ? `⚠ שגיאה בסנכרון: ${syncStatus[activeAccountId].error}`
                    : syncStatus[activeAccountId].lastSynced
                      ? `סונכרן לאחרונה: ${new Date(syncStatus[activeAccountId].lastSynced!).toLocaleString("he-IL")}`
                      : ""}
              </span>
            )}

            {/* Campaign Filter */}
            {user && mainCampaigns.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">🎯 קמפיין:</span>
                <select
                  value={mainCampaignId}
                  onChange={(e) => handleCampaignChange(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-sm text-gray-900 outline-none transition-all focus:border-blue-400 max-w-[250px]"
                >
                  <option value="">כל הקמפיינים</option>
                  {mainCampaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.status !== "ACTIVE" ? `(${c.status === "PAUSED" ? "מושהה" : c.status})` : ""}
                    </option>
                  ))}
                </select>
                {mainCampaignId && (
                  <button
                    onClick={() => handleCampaignChange("")}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    ✕ נקה
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* PER-ACCOUNT BREAKDOWN (Summary) */}
        {activeAccountId === "summary" && sum.activeDays > 0 && (
          <div className="mb-8">
            <h3 className="mb-4 text-lg font-bold text-gray-900">
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
                    <div className="mb-1 text-sm font-medium text-gray-500">
                      {acc.name}
                    </div>
                    <div className="text-lg font-bold text-gray-900">
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

        {/* SECTION: Financial Overview */}
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="text-sm font-bold text-gray-900">💼 סיכום כספי</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>
        <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
          <KPICard
            icon="💰"
            label="הוצאה על מודעות"
            value={fmtCurrency(sum.totalSpend)}
            sub={`${sum.activeDays} ימים פעילים`}
            color="blue"
            large={true}
          />
          <KPICard
            icon="📈"
            label="הכנסה ברוטו"
            value={fmtCurrency(sum.totalRevenue)}
            sub={`לפני מע״מ: ${fmtCurrency(sum.totalRevenueBeforeVat)}`}
            color="cyan"
            large={true}
            status={sum.totalRevenue > sum.totalSpend ? "good" : "bad"}
          />
          <KPICard
            icon={sum.totalNetProfit >= 0 ? "✅" : "⚠️"}
            label="רווח נקי (אחרי מע״מ)"
            value={fmtSigned(sum.totalNetProfit)}
            sub={`${sum.profitableDays} מתוך ${sum.activeDays} ימים ברווח`}
            color={profitColor}
            large={true}
            status={sum.totalNetProfit > 0 ? "good" : sum.totalNetProfit === 0 ? "warning" : "bad"}
          />
          <KPICard
            icon="🔄"
            label="החזר על הוצאה (ROAS)"
            value={fmtRoas(sum.overallRoas)}
            sub={`איזון: ${fmtRoas(settings.breakEvenRoas)} · ROI: ${fmtPct(sum.overallRoi)}`}
            color={roasColor}
            large={true}
            status={levelToStatus(smartRecs.metrics.find(m => m.metric === "roas")?.level || "average")}
          />
        </div>

        {/* CAMPAIGN RESULTS */}
        <CampaignResultsBanner
          goalLabel={CAMPAIGN_GOAL_LABELS[settings.campaignGoal]}
          totalResults={campaignResults.totalResults}
          costPerResult={campaignResults.costPerResult}
          totalLeads={sum.totalRegistrations}
          cpl={campaignResults.cpl}
          totalPurchases={sum.totalPurchases}
          cpa={sum.avgCpa}
          totalRevenue={sum.totalRevenue}
          campaignGoal={settings.campaignGoal}
        />

        {/* SECTION: Performance Metrics */}
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="text-sm font-bold text-gray-900">📊 מדדי ביצוע</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>
        <div className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
          <KPICard
            icon="📢"
            label="אחוז הקלקה (CTR)"
            value={fmtPct(sum.avgCtr)}
            sub={`עלות קליק: ${fmtDec(sum.avgCpc)} · CPM: ${fmtDec(sum.avgCpm)}`}
            color="purple"
            status={levelToStatus(smartRecs.metrics.find(m => m.metric === "ctr")?.level || "average")}
          />
          <KPICard
            icon="📝"
            label="אחוז המרה בדף (לידים)"
            value={fmtPct(sum.avgRegRate)}
            sub={`${fmtN(sum.totalRegistrations)} נרשמו מתוך ${fmtN(sum.totalLPV)} שהגיעו`}
            color="cyan"
            status={levelToStatus(smartRecs.metrics.find(m => m.metric === "regRate")?.level || "average")}
          />
          <KPICard
            icon="🛒"
            label="אחוז רכישה (מלידים)"
            value={fmtPct(sum.avgPurchaseRate)}
            sub={`${fmtN(sum.totalPurchases)} רכשו · ממוצע הזמנה: ${fmtCurrency(sum.avgAov)}`}
            color="green"
            status={levelToStatus(smartRecs.metrics.find(m => m.metric === "purchaseRate")?.level || "average")}
          />
          <KPICard
            icon="🎯"
            label="עלות לרכישה (CPA)"
            value={fmtDec(sum.avgCpa)}
            sub={sum.totalPurchases > 0 ? `${fmtN(sum.totalPurchases)} רכישות בסה״כ` : "אין רכישות עדיין"}
            color="amber"
            status={sum.avgCpa > 0 && sum.overallRoas >= settings.breakEvenRoas ? "good" : "bad"}
          />
        </div>

        {/* AD LEADERBOARD */}
        {adLeaderboard.length > 0 && (
          <div className={`mb-10 ${GLASS} p-5 md:p-6`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                🏆 מודעה ווינרית (לפי{" "}
                {CAMPAIGN_GOAL_LABELS[settings.campaignGoal]})
              </h2>
              <span className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
                {adLeaderboard.length} מודעות
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {adLeaderboard.slice(0, 3).map((ad, i) => {
                const medals = ["🥇", "🥈", "🥉"];
                const borderColors = [
                  "border-amber-300",
                  "border-gray-200",
                  "border-orange-200",
                ];
                const bgColors = [
                  "bg-amber-50",
                  "bg-white",
                  "bg-white",
                ];
                return (
                  <div
                    key={ad.adName}
                    className={`rounded-xl border ${borderColors[i]} ${bgColors[i]} p-4`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-lg">{medals[i]}</span>
                      <span className="text-sm font-bold text-gray-900">
                        {ad.adName}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">
                          {CAMPAIGN_GOAL_LABELS[settings.campaignGoal]}:{" "}
                        </span>
                        <span className="font-bold text-gray-900">
                          {settings.campaignGoal === "revenue"
                            ? fmtCurrency(ad.results)
                            : fmtN(ad.results)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">הוצאה: </span>
                        <span className="font-bold text-gray-900">
                          {fmtCurrency(ad.spend)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">ROAS: </span>
                        <span
                          className={`font-bold ${ad.roas >= settings.breakEvenRoas ? "text-emerald-600" : "text-red-600"}`}
                        >
                          {fmtRoas(ad.roas)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">CPA: </span>
                        <span className="font-bold text-gray-900">
                          {fmtDec(ad.cpa)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-gray-500">
                      {ad.days} ימים פעילים
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* IMPORT/EXPORT PANEL */}
        {showAI && (
          <div
            className={`mb-8 overflow-hidden ${GLASS}`}
          >
            <div className="flex border-b border-gray-200">
              {(
                [
                  { key: "import" as const, label: "ייבוא JSON", icon: "📥" },
                  { key: "export" as const, label: "ייצוא JSON", icon: "📤" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setAiTab(t.key)}
                  className={`flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium transition-all ${
                    aiTab === t.key
                      ? "border-b-2 border-blue-500 bg-blue-50 text-blue-700"
                      : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
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
                  <p className="mb-3 text-sm text-gray-500">
                    הדבק JSON כדי לייבא נתונים לדשבורד.
                  </p>
                  <textarea
                    value={jsonIn}
                    onChange={(e) => {
                      setJsonIn(e.target.value);
                      setImportMsg(null);
                    }}
                    className="h-48 w-full rounded-xl border border-gray-200 bg-gray-50 p-4 font-mono text-sm text-gray-700 outline-none transition-all focus:border-blue-400 focus:bg-white"
                    placeholder='{"settings":{...},"accounts":[...]}'
                    dir="ltr"
                  />
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={doImport}
                      disabled={!jsonIn.trim()}
                      className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-500 hover:shadow-md disabled:opacity-40 disabled:shadow-none"
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
                  <p className="mb-3 text-sm text-gray-500">
                    נתונים נוכחיים כ-JSON.
                  </p>
                  {user ? (
                    <button
                      onClick={() => doExport()}
                      className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-500"
                    >
                      הורד JSON
                    </button>
                  ) : (
                    <>
                      <pre
                        className="max-h-64 overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-4 font-mono text-sm text-gray-700"
                        dir="ltr"
                      >
                        {doExport()}
                      </pre>
                      <button
                        onClick={() => clip(doExport())}
                        className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-500"
                      >
                        {copied ? "הועתק! ✓" : "העתק JSON"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* DAILY TABLE */}
        <div className="mb-10 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl shadow-black/5">
          <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-7">
            <h2 className="text-xl font-bold text-gray-900">
              {activeAccountId === "summary"
                ? "סיכום כולל"
                : activeAccount?.name || "מעקב"}{" "}
              — {MONTHS_HE[settings.month - 1]} {settings.year}
            </h2>
            <div className="flex items-center gap-4">
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
              <div className="hidden items-center gap-3 text-xs md:flex">
                <span className="flex items-center gap-1.5 text-gray-400">
                  <span className="inline-block h-2 w-4 rounded-sm bg-gray-200" />
                  קלט
                </span>
                <span className="flex items-center gap-1.5 text-gray-400">
                  <span className="inline-block h-2 w-4 rounded-sm bg-violet-100" />
                  מחושב אוטומטית
                </span>
              </div>
            </div>
          </div>

          {/* Multi-account edit hint */}
          {activeAccountId === "summary" && accounts.length > 1 && timeView === "daily" && (
            <div className="border-b border-gray-100 bg-amber-50 px-5 py-2.5 md:px-7">
              <p className="text-xs text-amber-700">
                ✏️ כדי לערוך נתונים, בחר חשבון ספציפי מהטאבים למעלה.
              </p>
            </div>
          )}

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
            <table className="w-full min-w-[1000px] table-fixed">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="w-[60px] bg-gray-50 px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500">תאריך</th>
                  <th colSpan={4} className="bg-blue-50/70 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-blue-600/70">Meta Ads Manager</th>
                  <th colSpan={2} className="bg-violet-50/70 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-violet-600/70">משפך (CRM / אתר)</th>
                  <th colSpan={1} className="bg-emerald-50/70 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-emerald-600/70">כספים</th>
                  <th colSpan={9} className="bg-purple-50/70 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-purple-600/70">מדדי ביצוע (אוטומטי)</th>
                </tr>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="sticky right-0 z-10 w-[60px] bg-gray-50 px-2 py-3 text-center text-xs font-bold text-gray-600">תאריך</th>
                  {["הוצאה ₪", "חשיפות", "קליקים יחודיים", "הגיעו לדף"].map((h) => (
                    <th key={h} className="bg-blue-50/30 px-2 py-3 text-center text-xs font-bold text-gray-600">{h}</th>
                  ))}
                  {["נרשמו", "רכשו"].map((h) => (
                    <th key={h} className="bg-violet-50/30 px-2 py-3 text-center text-xs font-bold text-gray-600">{h}</th>
                  ))}
                  {["הכנסה ₪"].map((h) => (
                    <th key={h} className="bg-emerald-50/30 px-2 py-3 text-center text-xs font-bold text-gray-600">{h}</th>
                  ))}
                  {["CTR %", "CPC ₪", "CPM ₪", "% הגעה", "% רישום", "% רכישה", "CPA ₪", "רווח נקי", "ROAS"].map((h) => (
                    <th key={h} className="bg-purple-50/30 px-2 py-3 text-center text-xs font-bold text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* DAILY — editable */}
                {timeView === "daily" &&
                  isEditable &&
                  activeDays.map((day, i) => {
                    const m = metrics[i];
                    const active = day.adSpend > 0 || day.revenue > 0 || day.purchases > 0;
                    const dayNum = parseInt(day.date.split(".")[0]);
                    const now = new Date();
                    const isToday = dayNum === now.getDate() && settings.month === now.getMonth() + 1 && settings.year === now.getFullYear();
                    const bg = isToday ? "bg-blue-50" : i % 2 === 0 ? "bg-white" : "bg-gray-50/60";
                    const stickyBg = isToday ? "bg-blue-50" : i % 2 === 0 ? "bg-white" : "bg-gray-50";
                    return (
                      <tr key={i} className={`border-b border-gray-100 ${bg} transition-colors hover:bg-blue-50/50 ${isToday ? "ring-2 ring-inset ring-blue-400/60" : ""}`}>
                        <td className={`sticky right-0 z-10 ${stickyBg} px-2 py-1 text-center text-sm font-semibold ${isToday ? "text-blue-600" : active ? "text-gray-900" : "text-gray-400"}`}>
                          <div className="flex items-center gap-1">
                            {isToday && <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />}
                            <span>{day.date}</span>
                            {bestDays.bestCtrIdx === i && <span className="inline-block rounded-full bg-amber-100 px-1 py-px text-[7px] font-bold leading-tight text-amber-700">CTR</span>}
                            {bestDays.bestCostLpvIdx === i && <span className="inline-block rounded-full bg-emerald-100 px-1 py-px text-[7px] font-bold leading-tight text-emerald-700">CPV</span>}
                            {bestDays.bestRegRateIdx === i && <span className="inline-block rounded-full bg-purple-100 px-1 py-px text-[7px] font-bold leading-tight text-purple-700">CVR</span>}
                          </div>
                        </td>
                        <td className="px-0 py-0"><NumCell value={day.adSpend} onChange={(v) => upDay(i, "adSpend", v)} /></td>
                        <td className="px-0 py-0"><NumCell value={day.impressions} onChange={(v) => upDay(i, "impressions", v)} /></td>
                        <td className="px-0 py-0"><NumCell value={day.uniqueClicks} onChange={(v) => upDay(i, "uniqueClicks", v)} /></td>
                        <td className="px-0 py-0"><NumCell value={day.landingPageViews} onChange={(v) => upDay(i, "landingPageViews", v)} /></td>
                        <td className="px-0 py-0"><NumCell value={day.registrations} onChange={(v) => upDay(i, "registrations", v)} /></td>
                        <td className="px-0 py-0"><NumCell value={day.purchases} onChange={(v) => upDay(i, "purchases", v)} /></td>
                        <td className="px-0 py-0"><NumCell value={day.revenue} onChange={(v) => upDay(i, "revenue", v)} /></td>
                        <CC v={m.ctr} f={fmtPct} best={bestDays.bestCtrIdx === i} />
                        <CC v={m.cpc} f={fmtDec} />
                        <CC v={m.cpm} f={fmtDec} />
                        <CC v={m.lpvRate} f={fmtPct} best={bestDays.bestCostLpvIdx === i} />
                        <CC v={m.regRate} f={fmtPct} best={bestDays.bestRegRateIdx === i} />
                        <CC v={m.purchaseRate} f={fmtPct} />
                        <CC v={m.cpa} f={fmtDec} />
                        <CC v={m.netProfit} f={fmtSigned} pos={m.netProfit > 0} />
                        <CC v={m.roas} f={fmtRoas} pos={m.roas >= settings.breakEvenRoas} />
                      </tr>
                    );
                  })}

                {/* DAILY — readonly (summary) */}
                {timeView === "daily" &&
                  !isEditable &&
                  activeDays.map((day, i) => {
                    const m = metrics[i];
                    const active = day.adSpend > 0 || day.revenue > 0;
                    const bg = i % 2 === 0 ? "bg-white" : "bg-gray-50/60";
                    const stickyBg = i % 2 === 0 ? "bg-white" : "bg-gray-50";
                    return (
                      <tr key={i} className={`border-b border-gray-100 ${bg} transition-colors hover:bg-blue-50/50`}>
                        <td className={`sticky right-0 z-10 ${stickyBg} px-2 py-2 text-center text-sm font-semibold ${active ? "text-gray-900" : "text-gray-400"}`}>{day.date}</td>
                        <StaticCell value={day.adSpend ? fmtCurrency(day.adSpend) : ""} />
                        <StaticCell value={day.impressions ? fmtN(day.impressions) : ""} />
                        <StaticCell value={day.uniqueClicks ? fmtN(day.uniqueClicks) : ""} />
                        <StaticCell value={day.landingPageViews ? fmtN(day.landingPageViews) : ""} />
                        <StaticCell value={day.registrations ? fmtN(day.registrations) : ""} />
                        <StaticCell value={day.purchases ? fmtN(day.purchases) : ""} />
                        <StaticCell value={day.revenue ? fmtCurrency(day.revenue) : ""} />
                        <CC v={m.ctr} f={fmtPct} />
                        <CC v={m.cpc} f={fmtDec} />
                        <CC v={m.cpm} f={fmtDec} />
                        <CC v={m.lpvRate} f={fmtPct} />
                        <CC v={m.regRate} f={fmtPct} />
                        <CC v={m.purchaseRate} f={fmtPct} />
                        <CC v={m.cpa} f={fmtDec} />
                        <CC v={m.netProfit} f={fmtSigned} pos={m.netProfit > 0} />
                        <CC v={m.roas} f={fmtRoas} pos={m.roas >= settings.breakEvenRoas} />
                      </tr>
                    );
                  })}

                {/* WEEKLY */}
                {timeView === "weekly" &&
                  weeklyRows.map((row, i) => {
                    const d = row.day;
                    const m = row.metrics;
                    const bg = i % 2 === 0 ? "bg-white" : "bg-gray-50/60";
                    const stickyBg = i % 2 === 0 ? "bg-white" : "bg-gray-50";
                    return (
                      <tr key={i} className={`border-b border-gray-100 ${bg} transition-colors hover:bg-blue-50/50`}>
                        <td className={`sticky right-0 z-10 ${stickyBg} px-2 py-3 text-center text-sm font-bold text-gray-900`}>{row.label}</td>
                        <StaticCell value={fmtCurrency(d.adSpend)} />
                        <StaticCell value={fmtN(d.impressions)} />
                        <StaticCell value={fmtN(d.uniqueClicks)} />
                        <StaticCell value={fmtN(d.landingPageViews)} />
                        <StaticCell value={fmtN(d.registrations)} />
                        <StaticCell value={fmtN(d.purchases)} />
                        <StaticCell value={fmtCurrency(d.revenue)} />
                        <CC v={m.ctr} f={fmtPct} />
                        <CC v={m.cpc} f={fmtDec} />
                        <CC v={m.cpm} f={fmtDec} />
                        <CC v={m.lpvRate} f={fmtPct} />
                        <CC v={m.regRate} f={fmtPct} />
                        <CC v={m.purchaseRate} f={fmtPct} />
                        <CC v={m.cpa} f={fmtDec} />
                        <CC v={m.netProfit} f={fmtSigned} pos={m.netProfit > 0} />
                        <CC v={m.roas} f={fmtRoas} pos={m.roas >= settings.breakEvenRoas} />
                      </tr>
                    );
                  })}

                {/* MONTHLY */}
                {timeView === "monthly" &&
                  monthlyRow &&
                  (() => {
                    const d = monthlyRow.day;
                    const m = monthlyRow.metrics;
                    return (
                      <tr className="border-b border-gray-100 bg-white transition-colors hover:bg-blue-50/50">
                        <td className="sticky right-0 z-10 bg-white px-2 py-3 text-center text-sm font-bold text-gray-900">{monthlyRow.label}</td>
                        <StaticCell value={fmtCurrency(d.adSpend)} />
                        <StaticCell value={fmtN(d.impressions)} />
                        <StaticCell value={fmtN(d.uniqueClicks)} />
                        <StaticCell value={fmtN(d.landingPageViews)} />
                        <StaticCell value={fmtN(d.registrations)} />
                        <StaticCell value={fmtN(d.purchases)} />
                        <StaticCell value={fmtCurrency(d.revenue)} />
                        <CC v={m.ctr} f={fmtPct} />
                        <CC v={m.cpc} f={fmtDec} />
                        <CC v={m.cpm} f={fmtDec} />
                        <CC v={m.lpvRate} f={fmtPct} />
                        <CC v={m.regRate} f={fmtPct} />
                        <CC v={m.purchaseRate} f={fmtPct} />
                        <CC v={m.cpa} f={fmtDec} />
                        <CC v={m.netProfit} f={fmtSigned} pos={m.netProfit > 0} />
                        <CC v={m.roas} f={fmtRoas} pos={m.roas >= settings.breakEvenRoas} />
                      </tr>
                    );
                  })()}

                {/* TOTALS */}
                <tr className="border-t-2 border-blue-300 bg-blue-50 font-bold">
                  <td className="sticky right-0 z-10 bg-blue-50 px-2 py-3.5 text-center text-sm font-extrabold text-blue-700">סה״כ</td>
                  <td className="px-2 py-3.5 text-center text-sm font-bold text-gray-900">{fmtCurrency(sum.totalSpend)}</td>
                  <td className="px-2 py-3.5 text-center text-sm font-bold text-gray-900">{fmtN(sum.totalImpressions)}</td>
                  <td className="px-2 py-3.5 text-center text-sm font-bold text-gray-900">{fmtN(sum.totalUniqueClicks)}</td>
                  <td className="px-2 py-3.5 text-center text-sm font-bold text-gray-900">{fmtN(sum.totalLPV)}</td>
                  <td className="px-2 py-3.5 text-center text-sm font-bold text-gray-900">{fmtN(sum.totalRegistrations)}</td>
                  <td className="px-2 py-3.5 text-center text-sm font-bold text-gray-900">{fmtN(sum.totalPurchases)}</td>
                  <td className="px-2 py-3.5 text-center text-sm font-bold text-gray-900">{fmtCurrency(sum.totalRevenue)}</td>
                  <CC v={sum.avgCtr} f={fmtPct} />
                  <CC v={sum.avgCpc} f={fmtDec} />
                  <CC v={sum.avgCpm} f={fmtDec} />
                  <CC v={sum.avgLpvRate} f={fmtPct} />
                  <CC v={sum.avgRegRate} f={fmtPct} />
                  <CC v={sum.avgPurchaseRate} f={fmtPct} />
                  <CC v={sum.avgCpa} f={fmtDec} />
                  <CC v={sum.totalNetProfit} f={fmtSigned} pos={sum.totalNetProfit > 0} />
                  <CC v={sum.overallRoas} f={fmtRoas} pos={sum.overallRoas >= settings.breakEvenRoas} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        </>}

        {/* FOOTER */}
        <footer className="mt-10 flex items-center justify-center gap-2 text-xs text-gray-400">
          <div className="h-px max-w-32 flex-1 bg-gray-200" />
          דשבורד ממומן v5.0 — אצבע על הדופק
          <div className="h-px max-w-32 flex-1 bg-gray-200" />
        </footer>
      </div>

      {/* AI Chat */}
      {user && (
        <AIChatPanel sum={sum} accounts={accounts} settings={settings} />
      )}
    </main>
  );
}
