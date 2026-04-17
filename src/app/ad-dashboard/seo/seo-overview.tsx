"use client";

import { useMemo } from "react";
import { GLASS, GLASS_HOVER } from "../lib/constants";
import type { GA4Metrics, GA4DayData, SCDayData, MonthlyGrowthData } from "../lib/seo-types";

function fmtK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("he-IL");
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Delta({ current, previous, invert }: { current: number; previous?: number; invert?: boolean }) {
  if (previous === undefined || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const isGood = invert ? pct < 0 : pct > 0;
  const color = isGood ? "text-green-600" : "text-red-500";
  const arrow = pct > 0 ? "↑" : "↓";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

interface SeoOverviewProps {
  ga4: GA4Metrics | null;
  scSummary: { clicks: number; impressions: number; ctr: number; position: number } | null;
  scPrevSummary?: { clicks: number; impressions: number; ctr: number; position: number } | null;
  ga4Daily: GA4DayData[];
  scDaily: SCDayData[];
  loading: boolean;
  monthlyGrowth: MonthlyGrowthData[];
}

export function SeoOverview({ ga4, scSummary, scPrevSummary, ga4Daily, scDaily, loading, monthlyGrowth }: SeoOverviewProps) {
  const chartData = useMemo(() => {
    if (!scDaily.length) return [];
    const ga4Map = new Map(ga4Daily.map((d) => [d.date, d]));
    return scDaily.map((d) => ({
      date: d.date,
      clicks: d.clicks,
      impressions: d.impressions,
      sessions: ga4Map.get(d.date)?.sessions || 0,
    }));
  }, [scDaily, ga4Daily]);

  const maxClicks = useMemo(() => Math.max(...chartData.map((d) => d.clicks), 1), [chartData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className={`${GLASS} ${GLASS_HOVER} p-5`}>
          <div className="text-xs font-medium text-gray-500">קליקים מגוגל</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{fmtK(scSummary?.clicks || 0)}</div>
          <Delta current={scSummary?.clicks || 0} previous={scPrevSummary?.clicks} />
        </div>
        <div className={`${GLASS} ${GLASS_HOVER} p-5`}>
          <div className="text-xs font-medium text-gray-500">חשיפות</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{fmtK(scSummary?.impressions || 0)}</div>
          <Delta current={scSummary?.impressions || 0} previous={scPrevSummary?.impressions} />
        </div>
        <div className={`${GLASS} ${GLASS_HOVER} p-5`}>
          <div className="text-xs font-medium text-gray-500">CTR</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{fmtPct(scSummary?.ctr || 0)}</div>
          <Delta current={scSummary?.ctr || 0} previous={scPrevSummary?.ctr} />
        </div>
        <div className={`${GLASS} ${GLASS_HOVER} p-5`}>
          <div className="text-xs font-medium text-gray-500">מיקום ממוצע</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{(scSummary?.position || 0).toFixed(1)}</div>
          <Delta current={scSummary?.position || 0} previous={scPrevSummary?.position} invert />
        </div>
        <div className={`${GLASS} ${GLASS_HOVER} p-5`}>
          <div className="text-xs font-medium text-gray-500">כניסות אורגניות</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{fmtK(ga4?.sessions || 0)}</div>
          <Delta current={ga4?.sessions || 0} previous={ga4?.prevSessions} />
        </div>
        <div className={`${GLASS} ${GLASS_HOVER} p-5`}>
          <div className="text-xs font-medium text-gray-500">משתמשים</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{fmtK(ga4?.users || 0)}</div>
          <Delta current={ga4?.users || 0} previous={ga4?.prevUsers} />
        </div>
        <div className={`${GLASS} ${GLASS_HOVER} p-5`}>
          <div className="text-xs font-medium text-gray-500">אחוז נטישה</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{fmtPct(ga4?.bounceRate || 0)}</div>
          <Delta current={ga4?.bounceRate || 0} previous={ga4?.prevBounceRate} invert />
        </div>
        <div className={`${GLASS} ${GLASS_HOVER} p-5`}>
          <div className="text-xs font-medium text-gray-500">זמן ממוצע</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{fmtDuration(ga4?.avgSessionDuration || 0)}</div>
          <Delta current={ga4?.avgSessionDuration || 0} previous={ga4?.prevAvgSessionDuration} />
        </div>
      </div>

      {chartData.length > 0 && (
        <div className={`${GLASS} p-6`}>
          <h3 className="mb-4 text-sm font-semibold text-gray-700">קליקים מגוגל לאורך זמן</h3>
          <div className="flex items-end gap-[2px]" style={{ height: 160 }}>
            {chartData.map((d) => {
              const h = Math.max((d.clicks / maxClicks) * 140, 2);
              const dateLabel = new Date(d.date).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
              return (
                <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end">
                  <div
                    className="w-full rounded-t bg-emerald-500 transition-all group-hover:bg-emerald-600"
                    style={{ height: h }}
                  />
                  <div className="pointer-events-none absolute -top-10 z-10 hidden rounded bg-gray-800 px-2 py-1 text-xs text-white group-hover:block">
                    {dateLabel}: {d.clicks} קליקים
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-gray-400">
            <span>{chartData[0]?.date}</span>
            <span>{chartData[chartData.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Yearly Growth — Simple & Clear */}
      {monthlyGrowth.length > 1 && (() => {
        const firstMonth = monthlyGrowth[0];
        const lastMonth = monthlyGrowth[monthlyGrowth.length - 1];
        const userGrowth = firstMonth.users > 0
          ? Math.round(((lastMonth.users - firstMonth.users) / firstMonth.users) * 100)
          : 0;
        const totalUsers = monthlyGrowth.reduce((s, m) => s + m.users, 0);
        const totalClicks = monthlyGrowth.reduce((s, m) => s + m.clicks, 0);
        const maxUsers = Math.max(...monthlyGrowth.map((m) => m.users), 1);
        const isGrowing = userGrowth > 0;

        return (
          <div className={`${GLASS} p-6`}>
            {/* Big headline */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-500">כמה אנשים מצאו אותך בגוגל בשנה האחרונה?</h3>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="text-4xl font-bold text-gray-900">{fmtK(totalUsers)}</span>
                  <span className="text-sm text-gray-400">מבקרים מגוגל</span>
                </div>
              </div>
              <div className={`text-center rounded-2xl px-5 py-3 ${isGrowing ? "bg-emerald-50" : "bg-red-50"}`}>
                <div className={`text-3xl font-bold ${isGrowing ? "text-emerald-600" : "text-red-500"}`}>
                  {isGrowing ? "↑" : "↓"} {Math.abs(userGrowth)}%
                </div>
                <div className={`text-[11px] mt-0.5 ${isGrowing ? "text-emerald-500" : "text-red-400"}`}>
                  {isGrowing ? "צמיחה" : "ירידה"} בשנה
                </div>
              </div>
            </div>

            {/* Simple bar chart — one bar per month, easy to read */}
            <div className="flex items-end gap-2" style={{ height: 120 }}>
              {monthlyGrowth.map((m, i) => {
                const h = Math.max((m.users / maxUsers) * 100, 4);
                const isLast = i === monthlyGrowth.length - 1;
                const isFirst = i === 0;
                return (
                  <div key={m.month} className="group relative flex flex-1 flex-col items-center justify-end">
                    {/* Bar */}
                    <div
                      className={`w-full rounded-t-lg transition-all ${
                        isLast ? "bg-emerald-500" : "bg-emerald-200 group-hover:bg-emerald-300"
                      }`}
                      style={{ height: h }}
                    />
                    {/* Month label */}
                    <span className={`text-[10px] mt-1.5 ${isLast || isFirst ? "font-medium text-gray-600" : "text-gray-400"}`}>
                      {m.label}
                    </span>
                    {/* Value on top of last and first bar */}
                    {(isFirst || isLast) && (
                      <span className={`absolute -top-5 text-[11px] font-bold ${isLast ? "text-emerald-600" : "text-gray-400"}`}>
                        {fmtK(m.users)}
                      </span>
                    )}
                    {/* Tooltip on hover */}
                    <div className="pointer-events-none absolute -top-12 z-10 hidden rounded-lg bg-gray-800 px-3 py-1.5 text-[11px] text-white group-hover:block whitespace-nowrap shadow-lg">
                      {fmtK(m.users)} מבקרים | {fmtK(m.clicks)} קליקים
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom summary */}
            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-400">
              <span>{fmtK(totalClicks)} קליקים סה"כ מגוגל</span>
              <span>מ-{monthlyGrowth[0]?.label} עד {monthlyGrowth[monthlyGrowth.length - 1]?.label}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
