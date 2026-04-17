"use client";

import { useState, useEffect, useMemo } from "react";
import { GLASS, GLASS_HOVER } from "./lib/constants";
import { type DatePreset, DATE_PRESETS, getDateRange } from "./lib/date-presets";
import type {
  InstagramAccount,
  InstagramMedia,
  InstagramDayInsight,
  InstagramAudienceInsight,
} from "./lib/instagram-api";

// ═══════════════════════════════════════════════════════════
// Instagram Analytics View — v2 (Content Strategy Edition)
// ═══════════════════════════════════════════════════════════

function fmtK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("he-IL");
}

function fmtPct(n: number): string {
  return n.toFixed(2) + "%";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("he-IL", { weekday: "short" });
}

function fmtHour(iso: string): number {
  return new Date(iso).getHours();
}

// ─── Content Score (1-100) ───
// Based on: engagement rate vs avg, saves rate (3x weight), shares rate (5x weight)

function calcContentScore(
  post: InstagramMedia,
  avgEngRate: number,
  avgSavesRate: number,
  avgSharesRate: number
): number {
  const reach = post.reach || 1;
  const engRate = (post.engagement || 0) / reach;
  const savesRate = (post.saved || 0) / reach;
  const sharesRate = (post.shares || 0) / reach;

  // Score components (0-1 each, weighted)
  const engScore = avgEngRate > 0 ? Math.min(engRate / avgEngRate, 3) / 3 : 0;
  const savesScore = avgSavesRate > 0 ? Math.min(savesRate / avgSavesRate, 3) / 3 : 0;
  const sharesScore = avgSharesRate > 0 ? Math.min(sharesRate / avgSharesRate, 3) / 3 : 0;

  // Weighted: shares 5x, saves 3x, engagement 2x
  const weighted = (engScore * 2 + savesScore * 3 + sharesScore * 5) / 10;

  return Math.round(Math.min(weighted * 100, 100));
}

function scoreColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-green-400";
  if (score >= 40) return "bg-amber-400";
  if (score >= 20) return "bg-orange-400";
  return "bg-red-400";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "מעולה";
  if (score >= 60) return "טוב";
  if (score >= 40) return "בסדר";
  if (score >= 20) return "חלש";
  return "נמוך";
}

// ─── KPI Card ───

function KpiCard({
  label,
  value,
  icon,
  sub,
  color = "blue",
}: {
  label: string;
  value: string;
  icon: string;
  sub?: string;
  color?: "blue" | "purple" | "pink" | "green" | "amber" | "rose";
}) {
  const colorMap = {
    blue: "from-blue-500 to-blue-600",
    purple: "from-purple-500 to-purple-600",
    pink: "from-pink-500 to-pink-600",
    green: "from-green-500 to-green-600",
    amber: "from-amber-500 to-amber-600",
    rose: "from-rose-500 to-rose-600",
  };

  return (
    <div className={`${GLASS} ${GLASS_HOVER} p-4`}>
      <div className="mb-2 flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${colorMap[color]} text-sm text-white`}
        >
          {icon}
        </div>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

// ─── Media Type Badge ───

function MediaTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; color: string }> = {
    IMAGE: { label: "תמונה", color: "bg-blue-100 text-blue-700" },
    VIDEO: { label: "וידאו", color: "bg-purple-100 text-purple-700" },
    CAROUSEL_ALBUM: { label: "קרוסלה", color: "bg-amber-100 text-amber-700" },
    REEL: { label: "ריל", color: "bg-pink-100 text-pink-700" },
  };
  const info = map[type] || { label: type, color: "bg-gray-100 text-gray-700" };

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${info.color}`}>
      {info.label}
    </span>
  );
}

// ─── Post Card (v2 with rates + score) ───

function PostCard({
  post,
  rank,
  score,
}: {
  post: InstagramMedia;
  rank: number;
  score: number;
}) {
  const reach = post.reach || 0;
  const engRate = reach > 0 ? ((post.engagement || 0) / reach) * 100 : 0;
  const savesRate = reach > 0 ? ((post.saved || 0) / reach) * 100 : 0;
  const sharesRate = reach > 0 ? ((post.shares || 0) / reach) * 100 : 0;

  return (
    <div className={`${GLASS} overflow-hidden transition-all hover:shadow-md`}>
      {/* Thumbnail */}
      <div className="relative aspect-square bg-gray-100">
        {post.mediaUrl && post.mediaType !== "VIDEO" ? (
          <img src={post.mediaUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : post.thumbnailUrl ? (
          <img src={post.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-gray-300">📷</div>
        )}
        {/* Rank badge */}
        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-white">
          {rank}
        </div>
        {/* Type badge */}
        <div className="absolute left-2 top-2">
          <MediaTypeBadge type={post.mediaType} />
        </div>
        {/* Content Score */}
        <div className="absolute bottom-2 right-2">
          <div className={`flex items-center gap-1 rounded-full ${scoreColor(score)} px-2 py-0.5`}>
            <span className="text-[10px] font-bold text-white">{score}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="p-3">
        {/* Caption preview */}
        <p className="mb-2 line-clamp-2 text-xs text-gray-600" dir="rtl">
          {post.caption || "(ללא כיתוב)"}
        </p>

        {/* Key Algorithm Metrics */}
        <div className="mb-2 space-y-1">
          {/* Saves Rate — #2 algorithm signal */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400 w-14">שמירות</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full"
                style={{ width: `${Math.min(savesRate * 10, 100)}%` }}
              />
            </div>
            <span className="text-[10px] font-semibold text-gray-700 w-10 text-left">
              {savesRate > 0 ? fmtPct(savesRate) : "—"}
            </span>
          </div>
          {/* Shares Rate — #1 algorithm signal */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400 w-14">שיתופים</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-pink-400 rounded-full"
                style={{ width: `${Math.min(sharesRate * 20, 100)}%` }}
              />
            </div>
            <span className="text-[10px] font-semibold text-gray-700 w-10 text-left">
              {sharesRate > 0 ? fmtPct(sharesRate) : "—"}
            </span>
          </div>
        </div>

        {/* Basic metrics row */}
        <div className="grid grid-cols-4 gap-1 text-center">
          <div>
            <div className="text-xs font-bold text-gray-900">{fmtK(post.likeCount)}</div>
            <div className="text-[9px] text-gray-400">לייק</div>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-900">{fmtK(post.commentsCount)}</div>
            <div className="text-[9px] text-gray-400">תגובה</div>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-900">{fmtK(post.saved || 0)}</div>
            <div className="text-[9px] text-gray-400">שמירה</div>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-900">{fmtK(post.shares || 0)}</div>
            <div className="text-[9px] text-gray-400">שיתוף</div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[10px] text-gray-400">{fmtDate(post.timestamp)}</div>
          <div className="text-[10px] font-semibold text-gray-500">
            {reach > 0 ? `${fmtK(reach)} ריצ' | ${fmtPct(engRate)} eng` : `${fmtK(post.engagement || 0)} eng`}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Audience Bar ───

function AudienceBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 text-left text-xs text-gray-600 truncate">{label}</div>
      <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-l from-purple-500 to-pink-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-12 text-left text-xs font-semibold text-gray-700">{fmtK(value)}</div>
    </div>
  );
}

// ─── Daily Chart ───

function DailyChart({ data, metric, label, color = "#8b5cf6" }: {
  data: InstagramDayInsight[];
  metric: keyof InstagramDayInsight;
  label: string;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => (d[metric] as number) || 0), 1);
  return (
    <div className={`${GLASS} p-4`}>
      <div className="mb-3 text-sm font-bold text-gray-700">{label}</div>
      <div className="flex items-end gap-[2px]" style={{ height: 120 }}>
        {data.map((day, i) => {
          const val = (day[metric] as number) || 0;
          const h = Math.max((val / max) * 100, 2);
          return (
            <div key={i} className="group relative flex-1 cursor-default" style={{ height: "100%" }}>
              <div className="absolute bottom-0 w-full rounded-t transition-all hover:opacity-80" style={{ height: `${h}%`, backgroundColor: color }} />
              <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                {fmtDate(day.date)}: {fmtK(val)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-gray-400">
        <span>{data.length > 0 ? fmtDate(data[0].date) : ""}</span>
        <span>{data.length > 0 ? fmtDate(data[data.length - 1].date) : ""}</span>
      </div>
    </div>
  );
}

// ─── Best Time Heatmap ───

function BestTimeHeatmap({ posts }: { posts: InstagramMedia[] }) {
  // Build 7x24 grid: day of week × hour → avg engagement rate
  const grid: Record<string, { total: number; count: number }> = {};
  const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

  for (const post of posts) {
    const d = new Date(post.timestamp);
    const day = d.getDay(); // 0=Sun
    const hour = d.getHours();
    const key = `${day}-${hour}`;
    const eng = post.engagement || 0;
    if (!grid[key]) grid[key] = { total: 0, count: 0 };
    grid[key].total += eng;
    grid[key].count += 1;
  }

  const maxAvg = Math.max(
    ...Object.values(grid).map((g) => (g.count > 0 ? g.total / g.count : 0)),
    1
  );

  const hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

  return (
    <div className={`${GLASS} p-4`}>
      <div className="mb-3 text-sm font-bold text-gray-700">
        הזמן הטוב ביותר לפרסום
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[500px]">
          {/* Header hours */}
          <div className="flex gap-0.5 mb-0.5">
            <div className="w-12" />
            {hours.map((h) => (
              <div key={h} className="flex-1 text-center text-[8px] text-gray-400">
                {h}:00
              </div>
            ))}
          </div>
          {/* Days */}
          {[0, 1, 2, 3, 4, 5, 6].map((day) => (
            <div key={day} className="flex gap-0.5 mb-0.5">
              <div className="w-12 text-[10px] text-gray-500 flex items-center">{days[day]}</div>
              {hours.map((hour) => {
                const key = `${day}-${hour}`;
                const cell = grid[key];
                const avg = cell && cell.count > 0 ? cell.total / cell.count : 0;
                const intensity = avg / maxAvg;
                return (
                  <div
                    key={hour}
                    className="flex-1 aspect-square rounded-sm cursor-default group relative"
                    style={{
                      backgroundColor: intensity > 0
                        ? `rgba(139, 92, 246, ${0.1 + intensity * 0.8})`
                        : "#f3f4f6",
                    }}
                    title={cell ? `${days[day]} ${hour}:00 — ${cell.count} פוסטים, ממוצע ${fmtK(Math.round(avg))} eng` : ""}
                  >
                    {cell && cell.count > 0 && (
                      <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100 z-10">
                        {cell.count} פוסטים | {fmtK(Math.round(avg))} avg eng
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {/* Legend */}
          <div className="mt-2 flex items-center justify-end gap-1 text-[9px] text-gray-400">
            <span>נמוך</span>
            {[0.1, 0.3, 0.5, 0.7, 0.9].map((v) => (
              <div
                key={v}
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: `rgba(139, 92, 246, ${0.1 + v * 0.8})` }}
              />
            ))}
            <span>גבוה</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN INSTAGRAM VIEW
// ═══════════════════════════════════════════════════════════

export function InstagramView({ onBack }: { onBack: () => void }) {
  const [igAccounts, setIgAccounts] = useState<InstagramAccount[]>([]);
  const [activeIgId, setActiveIgId] = useState<string | null>(null);
  const [media, setMedia] = useState<InstagramMedia[]>([]);
  const [dailyInsights, setDailyInsights] = useState<InstagramDayInsight[]>([]);
  const [audience, setAudience] = useState<InstagramAudienceInsight | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("last_30d");
  const [loading, setLoading] = useState(true);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "posts" | "audience" | "ai">("overview");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [aiData, setAiData] = useState<Record<string, any> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAction, setAiAction] = useState<"analyze" | "generate" | "weekly">("analyze");
  const [brandContext, setBrandContext] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "engagement" | "saves_rate" | "shares_rate" | "reach" | "likes" | "comments">("score");
  const [postsPage, setPostsPage] = useState(1);

  useEffect(() => { loadAccounts(); }, []);

  async function loadAccounts() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ad-dashboard/instagram/accounts");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setIgAccounts(data.accounts || []);
      if (data.accounts?.length > 0) {
        setActiveIgId(data.accounts[0].id);
        await loadAllData(data.accounts[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת חשבונות");
    } finally {
      setLoading(false);
    }
  }

  async function loadAllData(accountId: string, preset?: DatePreset, insightsOnly = false) {
    const p = preset || datePreset;
    const { since, until } = getDateRange(p);
    setMediaLoading(true);
    setError(null);
    try {
      // Combined endpoint: single request, single getPages() call on the server
      const include = insightsOnly ? ["insights"] : ["insights", "media", "audience"];
      const res = await fetch("/api/ad-dashboard/instagram/all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, since, until, mediaLimit: 50, include }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.insights && !data.insights.error) setDailyInsights(data.insights);
      if (data.media && !data.media.error) setMedia(data.media);
      if (data.audience && !data.audience.error) setAudience(data.audience);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת נתונים");
    } finally {
      setMediaLoading(false);
    }
  }

  // ─── Computed ───
  const activeAccount = igAccounts.find((a) => a.id === activeIgId);
  const totalImpressions = dailyInsights.reduce((s, d) => s + d.impressions, 0);
  const totalReach = dailyInsights.reduce((s, d) => s + d.reach, 0);
  const totalProfileViews = dailyInsights.reduce((s, d) => s + d.profileViews, 0);
  const totalWebsiteClicks = dailyInsights.reduce((s, d) => s + d.websiteClicks, 0);
  const latestFollowers = dailyInsights.length > 0 ? dailyInsights[dailyInsights.length - 1].followerCount : activeAccount?.followersCount || 0;
  const firstFollowers = dailyInsights.length > 0 ? dailyInsights[0].followerCount : latestFollowers;
  const followerGrowth = latestFollowers - firstFollowers;

  // ─── Period Comparison (current vs previous) ───
  const periodComparison = useMemo(() => {
    if (media.length < 2) return null;

    // Split posts into two halves by time
    const sorted = [...media].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const midpoint = Math.floor(sorted.length / 2);
    const recent = sorted.slice(0, midpoint);
    const older = sorted.slice(midpoint);

    if (recent.length === 0 || older.length === 0) return null;

    const calcStats = (posts: typeof media) => {
      const totalEng = posts.reduce((s, p) => s + (p.engagement || 0), 0);
      const totalReach = posts.reduce((s, p) => s + (p.reach || 0), 0);
      const totalSaves = posts.reduce((s, p) => s + (p.saved || 0), 0);
      const totalShares = posts.reduce((s, p) => s + (p.shares || 0), 0);
      return {
        avgEng: totalEng / posts.length,
        engRate: totalReach > 0 ? (totalEng / totalReach) * 100 : 0,
        savesRate: totalReach > 0 ? (totalSaves / totalReach) * 100 : 0,
        sharesRate: totalReach > 0 ? (totalShares / totalReach) * 100 : 0,
        avgReach: totalReach / posts.length,
        count: posts.length,
      };
    };

    const recentStats = calcStats(recent);
    const olderStats = calcStats(older);

    const pctChange = (curr: number, prev: number) =>
      prev > 0 ? Math.round(((curr - prev) / prev) * 100) : 0;

    const recentDates = `${new Date(recent[recent.length - 1].timestamp).toLocaleDateString("he-IL", { day: "numeric", month: "short" })} - ${new Date(recent[0].timestamp).toLocaleDateString("he-IL", { day: "numeric", month: "short" })}`;
    const olderDates = `${new Date(older[older.length - 1].timestamp).toLocaleDateString("he-IL", { day: "numeric", month: "short" })} - ${new Date(older[0].timestamp).toLocaleDateString("he-IL", { day: "numeric", month: "short" })}`;

    return {
      recentDates,
      olderDates,
      metrics: [
        { label: "אנגייג'מנט ממוצע", recent: Math.round(recentStats.avgEng), older: Math.round(olderStats.avgEng), change: pctChange(recentStats.avgEng, olderStats.avgEng) },
        { label: "Eng Rate", recent: Number(recentStats.engRate.toFixed(2)), older: Number(olderStats.engRate.toFixed(2)), change: pctChange(recentStats.engRate, olderStats.engRate), isPct: true },
        { label: "Saves Rate", recent: Number(recentStats.savesRate.toFixed(2)), older: Number(olderStats.savesRate.toFixed(2)), change: pctChange(recentStats.savesRate, olderStats.savesRate), isPct: true },
        { label: "Shares Rate", recent: Number(recentStats.sharesRate.toFixed(2)), older: Number(olderStats.sharesRate.toFixed(2)), change: pctChange(recentStats.sharesRate, olderStats.sharesRate), isPct: true },
        { label: "ריצ' ממוצע", recent: Math.round(recentStats.avgReach), older: Math.round(olderStats.avgReach), change: pctChange(recentStats.avgReach, olderStats.avgReach) },
      ],
    };
  }, [media]);

  // Average rates across all posts (for scoring)
  const { avgEngRate, avgSavesRate, avgSharesRate, avgEngagement } = useMemo(() => {
    if (media.length === 0) return { avgEngRate: 0, avgSavesRate: 0, avgSharesRate: 0, avgEngagement: 0 };
    let totalEng = 0, totalSaves = 0, totalShares = 0, totalReach = 0, totalEngAbs = 0;
    for (const m of media) {
      const r = m.reach || 0;
      totalEng += m.engagement || 0;
      totalSaves += m.saved || 0;
      totalShares += m.shares || 0;
      totalReach += r;
      totalEngAbs += m.engagement || 0;
    }
    return {
      avgEngRate: totalReach > 0 ? totalEng / totalReach : 0,
      avgSavesRate: totalReach > 0 ? totalSaves / totalReach : 0,
      avgSharesRate: totalReach > 0 ? totalShares / totalReach : 0,
      avgEngagement: totalEngAbs / media.length,
    };
  }, [media]);

  // Score each post
  const scoredMedia = useMemo(() => {
    return media.map((post) => ({
      post,
      score: calcContentScore(post, avgEngRate, avgSavesRate, avgSharesRate),
    }));
  }, [media, avgEngRate, avgSavesRate, avgSharesRate]);

  const sortedMedia = useMemo(() => {
    return [...scoredMedia].sort((a, b) => {
      switch (sortBy) {
        case "score": return b.score - a.score;
        case "engagement": return (b.post.engagement || 0) - (a.post.engagement || 0);
        case "saves_rate": {
          const aR = a.post.reach || 1, bR = b.post.reach || 1;
          return ((b.post.saved || 0) / bR) - ((a.post.saved || 0) / aR);
        }
        case "shares_rate": {
          const aR = a.post.reach || 1, bR = b.post.reach || 1;
          return ((b.post.shares || 0) / bR) - ((a.post.shares || 0) / aR);
        }
        case "reach": return (b.post.reach || 0) - (a.post.reach || 0);
        case "likes": return b.post.likeCount - a.post.likeCount;
        case "comments": return b.post.commentsCount - a.post.commentsCount;
        default: return 0;
      }
    });
  }, [scoredMedia, sortBy]);

  // Content type stats
  const contentTypeStats = useMemo(() => {
    const types = ["IMAGE", "VIDEO", "CAROUSEL_ALBUM"] as const;
    return types.map((type) => {
      const posts = scoredMedia.filter((m) => m.post.mediaType === type);
      if (posts.length === 0) return null;
      const totalReach = posts.reduce((s, p) => s + (p.post.reach || 0), 0);
      const totalEng = posts.reduce((s, p) => s + (p.post.engagement || 0), 0);
      const totalSaves = posts.reduce((s, p) => s + (p.post.saved || 0), 0);
      const totalShares = posts.reduce((s, p) => s + (p.post.shares || 0), 0);
      const avgScore = posts.reduce((s, p) => s + p.score, 0) / posts.length;
      return {
        type,
        count: posts.length,
        avgReach: totalReach / posts.length,
        engRate: totalReach > 0 ? (totalEng / totalReach) * 100 : 0,
        savesRate: totalReach > 0 ? (totalSaves / totalReach) * 100 : 0,
        sharesRate: totalReach > 0 ? (totalShares / totalReach) * 100 : 0,
        avgScore: Math.round(avgScore),
      };
    }).filter(Boolean) as Array<{
      type: string; count: number; avgReach: number;
      engRate: number; savesRate: number; sharesRate: number; avgScore: number;
    }>;
  }, [scoredMedia]);

  // Audience data
  const topCities = useMemo(() => !audience?.cities ? [] : Object.entries(audience.cities).sort((a, b) => b[1] - a[1]).slice(0, 5), [audience]);
  const topCountries = useMemo(() => !audience?.countries ? [] : Object.entries(audience.countries).sort((a, b) => b[1] - a[1]).slice(0, 5), [audience]);
  const genderSplit = useMemo(() => {
    if (!audience?.genderAge) return { male: 0, female: 0, unknown: 0 };
    let male = 0, female = 0, unknown = 0;
    for (const [key, val] of Object.entries(audience.genderAge)) {
      if (key.startsWith("M.")) male += val;
      else if (key.startsWith("F.")) female += val;
      else unknown += val;
    }
    const total = male + female + unknown || 1;
    return { male: Math.round((male / total) * 100), female: Math.round((female / total) * 100), unknown: Math.round((unknown / total) * 100) };
  }, [audience]);
  const ageGroups = useMemo(() => {
    if (!audience?.genderAge) return [];
    const groups: Record<string, number> = {};
    for (const [key, val] of Object.entries(audience.genderAge)) {
      const age = key.split(".")[1];
      if (age) groups[age] = (groups[age] || 0) + val;
    }
    return Object.entries(groups).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  }, [audience]);

  // ─── Smart Insights (computed from data, no API call) ───
  const smartInsights = useMemo(() => {
    if (media.length < 3) return null;

    const insights: Array<{ icon: string; title: string; text: string; type: "success" | "warning" | "info" }> = [];

    // 1. Best day of week
    const dayMap: Record<string, { eng: number; count: number; reach: number }> = {};
    for (const post of media) {
      const d = new Date(post.timestamp);
      const dayName = d.toLocaleDateString("he-IL", { weekday: "long" });
      if (!dayMap[dayName]) dayMap[dayName] = { eng: 0, count: 0, reach: 0 };
      dayMap[dayName].eng += post.engagement || 0;
      dayMap[dayName].reach += post.reach || 0;
      dayMap[dayName].count += 1;
    }
    const dayEntries = Object.entries(dayMap).filter(([, v]) => v.count >= 2);
    if (dayEntries.length >= 2) {
      const bestDay = dayEntries.reduce((a, b) => {
        const aAvg = a[1].reach > 0 ? a[1].eng / a[1].reach : 0;
        const bAvg = b[1].reach > 0 ? b[1].eng / b[1].reach : 0;
        return aAvg > bAvg ? a : b;
      });
      const worstDay = dayEntries.reduce((a, b) => {
        const aAvg = a[1].reach > 0 ? a[1].eng / a[1].reach : 0;
        const bAvg = b[1].reach > 0 ? b[1].eng / b[1].reach : 0;
        return aAvg < bAvg ? a : b;
      });
      const bestRate = bestDay[1].reach > 0 ? ((bestDay[1].eng / bestDay[1].reach) * 100).toFixed(1) : "0";
      insights.push({
        icon: "📅",
        title: "היום הכי טוב לפרסם",
        text: `יום ${bestDay[0]} (${bestRate}% engagement, מ-${bestDay[1].count} פוסטים). הימנע מיום ${worstDay[0]}.`,
        type: "success",
      });
    }

    // 2. Best hour
    const hourMap: Record<number, { eng: number; count: number; reach: number }> = {};
    for (const post of media) {
      const h = new Date(post.timestamp).getHours();
      if (!hourMap[h]) hourMap[h] = { eng: 0, count: 0, reach: 0 };
      hourMap[h].eng += post.engagement || 0;
      hourMap[h].reach += post.reach || 0;
      hourMap[h].count += 1;
    }
    const hourEntries = Object.entries(hourMap)
      .map(([h, v]) => ({ hour: parseInt(h), ...v }))
      .filter((h) => h.count >= 2);
    if (hourEntries.length >= 2) {
      const bestHour = hourEntries.reduce((a, b) => {
        const aAvg = a.reach > 0 ? a.eng / a.reach : 0;
        const bAvg = b.reach > 0 ? b.eng / b.reach : 0;
        return aAvg > bAvg ? a : b;
      });
      insights.push({
        icon: "⏰",
        title: "השעה הכי טובה לפרסם",
        text: `${String(bestHour.hour).padStart(2, "0")}:00 (מ-${bestHour.count} פוסטים). הקהל שלך הכי פעיל בשעות האלה.`,
        type: "success",
      });
    }

    // 3. Best content type
    if (contentTypeStats.length >= 2) {
      const best = contentTypeStats.reduce((a, b) => a.avgScore > b.avgScore ? a : b);
      const typeLabels: Record<string, string> = { IMAGE: "תמונות", VIDEO: "רילס/וידאו", CAROUSEL_ALBUM: "קרוסלות" };
      insights.push({
        icon: "🏆",
        title: "סוג התוכן שהכי עובד",
        text: `${typeLabels[best.type]} (ציון ${best.avgScore}/100, ${fmtPct(best.savesRate)} שמירות). תעלה יותר מזה.`,
        type: "info",
      });
    }

    // 4. Saves vs shares signal
    if (avgSavesRate > 0 && avgSharesRate > 0) {
      if (avgSharesRate > avgSavesRate) {
        insights.push({
          icon: "📤",
          title: "התוכן שלך מייצר שיתופים",
          text: `שיתופים (${fmtPct(avgSharesRate * 100)}) גבוהים משמירות (${fmtPct(avgSavesRate * 100)}). זה אומר שהתוכן שלך מעורר הזדהות ורגש. נצל את זה.`,
          type: "info",
        });
      } else if (avgSavesRate > avgSharesRate * 2) {
        insights.push({
          icon: "🔖",
          title: "התוכן שלך מייצר שמירות",
          text: `שמירות (${fmtPct(avgSavesRate * 100)}) גבוהות הרבה משיתופים (${fmtPct(avgSharesRate * 100)}). התוכן שלך נתפס כ"ערך" - תמשיך עם טיפים ומדריכים.`,
          type: "info",
        });
      }
    }

    // 5. Engagement rate benchmark
    const engPct = avgEngRate * 100;
    if (engPct > 0) {
      if (engPct >= 5) {
        insights.push({ icon: "🔥", title: "Engagement מצוין", text: `${fmtPct(engPct)} - הרבה מעל הממוצע (1-3%). האלגוריתם אוהב אותך.`, type: "success" });
      } else if (engPct >= 3) {
        insights.push({ icon: "👍", title: "Engagement טוב", text: `${fmtPct(engPct)} - מעל הממוצע. תמשיך ככה.`, type: "success" });
      } else if (engPct < 1) {
        insights.push({ icon: "⚠️", title: "Engagement נמוך", text: `${fmtPct(engPct)} - מתחת לממוצע (1-3%). נסה הוקים חזקים יותר ו-CTA בסוף כל פוסט.`, type: "warning" });
      }
    }

    // 6. Posting frequency
    if (media.length >= 2) {
      const dates = media.map((m) => new Date(m.timestamp).getTime()).sort((a, b) => a - b);
      const spanDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
      const postsPerWeek = spanDays > 0 ? (media.length / spanDays) * 7 : 0;
      if (postsPerWeek < 2) {
        insights.push({
          icon: "📉",
          title: "תדירות פרסום נמוכה",
          text: `${postsPerWeek.toFixed(1)} פוסטים בשבוע. מומלץ לפחות 3-5 לשבוע כדי שהאלגוריתם יקדם אותך.`,
          type: "warning",
        });
      } else if (postsPerWeek >= 5) {
        insights.push({
          icon: "🚀",
          title: "תדירות פרסום מעולה",
          text: `${postsPerWeek.toFixed(1)} פוסטים בשבוע. קצב מצוין לצמיחה.`,
          type: "success",
        });
      }
    }

    return insights;
  }, [media, contentTypeStats, avgSavesRate, avgSharesRate, avgEngRate]);

  // ─── RENDER ───

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
        <p className="text-sm text-gray-400">מתחבר לאינסטגרם...</p>
      </div>
    );
  }

  if (igAccounts.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-amber-500 text-4xl shadow-lg">📸</div>
        <h3 className="mb-2 text-xl font-bold text-gray-900">חבר את האינסטגרם</h3>
        <p className="mb-6 text-sm text-gray-500">
          {error || "כדי לראות נתוני אינסטגרם, צריך להתחבר עם הרשאות אינסטגרם"}
        </p>
        <div className={`${GLASS} mx-auto mb-6 max-w-sm p-4 text-right`}>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-[10px] font-bold text-purple-700">1</span>
              <span>ודא שהאינסטגרם הוא חשבון <strong>Business</strong> או <strong>Creator</strong></span>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-[10px] font-bold text-purple-700">2</span>
              <span>ודא שהאינסטגרם מחובר ל<strong>דף פייסבוק</strong></span>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-[10px] font-bold text-purple-700">3</span>
              <span>לחץ <strong>חבר אינסטגרם</strong> ואשר את ההרשאות</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <a href="/api/ad-dashboard/auth/login-instagram" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl hover:brightness-110">
            📸 חבר אינסטגרם
          </a>
          <div className="flex gap-3">
            <button onClick={onBack} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 transition-all hover:bg-gray-50">חזרה לדשבורד</button>
            <button onClick={loadAccounts} className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-xs font-semibold text-purple-700 transition-all hover:bg-purple-100">כבר חיברתי, נסה שוב</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition-all hover:bg-gray-50">→ חזרה</button>
        <a href="/api/ad-dashboard/auth/login-instagram" className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 transition-all hover:bg-purple-100">🔄 חיבור מחדש</a>
        {activeAccount && (
          <div className="flex items-center gap-2">
            {activeAccount.profilePictureUrl && <img src={activeAccount.profilePictureUrl} alt="" className="h-8 w-8 rounded-full" />}
            <div>
              <div className="text-sm font-bold text-gray-900">@{activeAccount.username}</div>
              <div className="text-[10px] text-gray-400">{fmtK(activeAccount.followersCount)} עוקבים</div>
            </div>
          </div>
        )}
        {igAccounts.length > 1 && (
          <select value={activeIgId || ""} onChange={(e) => { setActiveIgId(e.target.value); loadAllData(e.target.value); }} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs">
            {igAccounts.map((acc) => <option key={acc.id} value={acc.id}>@{acc.username}</option>)}
          </select>
        )}
        <select value={datePreset} onChange={(e) => { const p = e.target.value as DatePreset; setDatePreset(p); if (activeIgId) loadAllData(activeIgId, p, true); }} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs">
          {DATE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <div className="mr-auto flex gap-1">
          {([
            { key: "overview", label: "סקירה כללית", icon: "📊" },
            { key: "posts", label: "פוסטים", icon: "📱" },
            { key: "ai", label: "AI ניתוח", icon: "🤖" },
            { key: "audience", label: "קהל", icon: "👥" },
          ] as const).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${tab === t.key ? "border-purple-300 bg-purple-50 text-purple-700" : "border-gray-200 bg-white text-gray-600 hover:border-purple-200 hover:bg-purple-50/50"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      {mediaLoading && (
        <div className="flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          <span className="text-xs text-purple-600">טוען נתוני אינסטגרם...</span>
        </div>
      )}

      {/* ═══ TAB: Overview ═══ */}
      {tab === "overview" && (
        <>
          {/* KPI Cards — focused on algorithm signals */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard icon="👥" label="עוקבים" value={fmtK(latestFollowers)}
              sub={followerGrowth !== 0 ? `${followerGrowth > 0 ? "+" : ""}${fmtK(followerGrowth)} בתקופה` : undefined}
              color="purple" />
            <KpiCard icon="📡" label="ריצ' כולל" value={fmtK(totalReach)} color="pink" />
            <KpiCard icon="🔖" label="ממוצע שמירות" value={media.length > 0 ? fmtPct(avgSavesRate * 100) : "—"} sub="saves/reach (סיגנל #2)" color="amber" />
            <KpiCard icon="📤" label="ממוצע שיתופים" value={media.length > 0 ? fmtPct(avgSharesRate * 100) : "—"} sub="shares/reach (סיגנל #1)" color="rose" />
            <KpiCard icon="💬" label="אנגייג'מנט" value={media.length > 0 ? fmtPct(avgEngRate * 100) : "—"} sub="eng/reach" color="blue" />
            <KpiCard icon="🎯" label="ציון תוכן" value={scoredMedia.length > 0 ? String(Math.round(scoredMedia.reduce((s, m) => s + m.score, 0) / scoredMedia.length)) + "/100" : "—"} sub="ממוצע כל הפוסטים" color="green" />
          </div>

          {/* Period Comparison */}
          {periodComparison && (
            <div className={`${GLASS} p-4`}>
              <div className="mb-3 text-sm font-bold text-gray-700">השוואת תקופות</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                      <th className="py-2 text-right font-medium">מדד</th>
                      <th className="py-2 text-center font-medium">
                        <span className="text-purple-600">אחרון</span>
                        <div className="text-[9px] text-gray-400 font-normal">{periodComparison.recentDates}</div>
                      </th>
                      <th className="py-2 text-center font-medium">
                        <span className="text-gray-500">קודם</span>
                        <div className="text-[9px] text-gray-400 font-normal">{periodComparison.olderDates}</div>
                      </th>
                      <th className="py-2 text-center font-medium">שינוי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodComparison.metrics.map((m) => (
                      <tr key={m.label} className="border-b border-gray-100">
                        <td className="py-2.5 text-right text-xs font-medium text-gray-700">{m.label}</td>
                        <td className="py-2.5 text-center font-semibold text-gray-900">
                          {m.isPct ? fmtPct(m.recent) : fmtK(m.recent)}
                        </td>
                        <td className="py-2.5 text-center text-gray-500">
                          {m.isPct ? fmtPct(m.older) : fmtK(m.older)}
                        </td>
                        <td className="py-2.5 text-center">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            m.change > 0
                              ? "bg-green-100 text-green-700"
                              : m.change < 0
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-500"
                          }`}>
                            {m.change > 0 ? "+" : ""}{m.change}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Smart Insights — actionable conclusions */}
          {smartInsights && smartInsights.length > 0 && (
            <div className={`${GLASS} p-4`}>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-base">💡</span>
                <span className="text-sm font-bold text-gray-800">תובנות חכמות</span>
                <span className="text-[10px] text-gray-400">מבוסס על {media.length} פוסטים</span>
              </div>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {smartInsights.map((insight, i) => (
                  <div
                    key={i}
                    className={`rounded-xl border px-3.5 py-3 ${
                      insight.type === "success"
                        ? "border-green-200 bg-green-50"
                        : insight.type === "warning"
                          ? "border-amber-200 bg-amber-50"
                          : "border-blue-200 bg-blue-50"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="text-sm">{insight.icon}</span>
                      <span className={`text-xs font-bold ${
                        insight.type === "success"
                          ? "text-green-800"
                          : insight.type === "warning"
                            ? "text-amber-800"
                            : "text-blue-800"
                      }`}>
                        {insight.title}
                      </span>
                    </div>
                    <p className={`text-[11px] leading-relaxed ${
                      insight.type === "success"
                        ? "text-green-700"
                        : insight.type === "warning"
                          ? "text-amber-700"
                          : "text-blue-700"
                    }`}>
                      {insight.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Content Type Comparison — the strategic view */}
          {contentTypeStats.length > 0 && (
            <div className={`${GLASS} p-4`}>
              <div className="mb-3 text-sm font-bold text-gray-700">ביצועים לפי סוג תוכן</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                      <th className="py-2 text-right font-medium">סוג</th>
                      <th className="py-2 text-center font-medium">פוסטים</th>
                      <th className="py-2 text-center font-medium">ממוצע ריצ'</th>
                      <th className="py-2 text-center font-medium">Eng Rate</th>
                      <th className="py-2 text-center font-medium">🔖 Saves Rate</th>
                      <th className="py-2 text-center font-medium">📤 Shares Rate</th>
                      <th className="py-2 text-center font-medium">ציון</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contentTypeStats.map((stat) => {
                      const typeLabels: Record<string, string> = { IMAGE: "תמונה", VIDEO: "וידאו / ריל", CAROUSEL_ALBUM: "קרוסלה" };
                      const best = contentTypeStats.reduce((a, b) => a.avgScore > b.avgScore ? a : b);
                      const isBest = stat.type === best.type;
                      return (
                        <tr key={stat.type} className={`border-b border-gray-100 ${isBest ? "bg-green-50" : ""}`}>
                          <td className="py-2.5 text-right">
                            <div className="flex items-center gap-2">
                              <MediaTypeBadge type={stat.type} />
                              <span className="font-medium text-gray-900">{typeLabels[stat.type]}</span>
                              {isBest && <span className="text-[10px] text-green-600 font-semibold">הכי טוב</span>}
                            </div>
                          </td>
                          <td className="py-2.5 text-center text-gray-700">{stat.count}</td>
                          <td className="py-2.5 text-center font-semibold text-gray-900">{fmtK(Math.round(stat.avgReach))}</td>
                          <td className="py-2.5 text-center font-semibold text-gray-900">{fmtPct(stat.engRate)}</td>
                          <td className="py-2.5 text-center font-semibold text-amber-700">{fmtPct(stat.savesRate)}</td>
                          <td className="py-2.5 text-center font-semibold text-pink-700">{fmtPct(stat.sharesRate)}</td>
                          <td className="py-2.5 text-center">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${scoreColor(stat.avgScore)}`}>
                              {stat.avgScore}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top 6 Posts by Score */}
          {sortedMedia.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-700">🏆 6 הפוסטים עם הציון הגבוה ביותר</h3>
                <button onClick={() => setTab("posts")} className="text-xs text-purple-600 hover:underline">ראה הכל →</button>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                {sortedMedia.slice(0, 6).map((item, i) => (
                  <PostCard key={item.post.id} post={item.post} rank={i + 1} score={item.score} />
                ))}
              </div>
            </div>
          )}

          {/* Best Time Heatmap */}
          {media.length >= 10 && <BestTimeHeatmap posts={media.map(m => m)} />}
        </>
      )}

      {/* ═══ TAB: Posts ═══ */}
      {tab === "posts" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">מיין לפי:</span>
            {([
              { key: "score", label: "ציון תוכן" },
              { key: "saves_rate", label: "🔖 Saves Rate" },
              { key: "shares_rate", label: "📤 Shares Rate" },
              { key: "engagement", label: "אנגייג'מנט" },
              { key: "reach", label: "ריצ'" },
              { key: "likes", label: "לייקים" },
              { key: "comments", label: "תגובות" },
            ] as const).map((s) => (
              <button key={s.key} onClick={() => setSortBy(s.key)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all ${sortBy === s.key ? "border-purple-300 bg-purple-50 text-purple-700" : "border-gray-200 bg-white text-gray-500 hover:border-purple-200"}`}>
                {s.label}
              </button>
            ))}
            <span className="mr-auto text-[10px] text-gray-400">{media.length} פוסטים</span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {sortedMedia.slice(0, postsPage * 20).map((item, i) => (
              <PostCard key={item.post.id} post={item.post} rank={i + 1} score={item.score} />
            ))}
          </div>
          {sortedMedia.length > postsPage * 20 && (
            <div className="text-center">
              <button
                onClick={() => setPostsPage(p => p + 1)}
                className="rounded-xl border border-purple-200 bg-purple-50 px-6 py-2 text-sm font-semibold text-purple-700 transition-all hover:bg-purple-100"
              >
                הצג עוד ({sortedMedia.length - postsPage * 20} נותרו)
              </button>
            </div>
          )}
          {media.length === 0 && !mediaLoading && <div className="py-12 text-center text-sm text-gray-400">לא נמצאו פוסטים</div>}
        </>
      )}

      {/* ═══ TAB: AI Analysis ═══ */}
      {tab === "ai" && (() => {
        const runAnalysis = async (action: "analyze" | "generate" | "weekly") => {
          setAiAction(action);
          setAiLoading(true);
          setAiData(null);
          try {
            const sortedPosts = [...media].sort((x, y) => (y.engagement || 0) - (x.engagement || 0));
            const res = await fetch("/api/ad-dashboard/instagram/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ posts: sortedPosts, action, username: activeAccount?.username || "", followersCount: activeAccount?.followersCount || 0, bio: activeAccount?.biography || "", brandContext }),
            });
            const data = await res.json();
            if (data.error) setAiData({ error: data.error });
            else setAiData(data);
          } catch (err) {
            setAiData({ error: err instanceof Error ? err.message : "failed" });
          } finally {
            setAiLoading(false);
          }
        };

        const statusColor = (s: string) => s === "מצוין" || s === "מעולה" ? "text-green-600 bg-green-50 border-green-200" : s === "טוב" ? "text-blue-600 bg-blue-50 border-blue-200" : s === "ממוצע" ? "text-amber-600 bg-amber-50 border-amber-200" : "text-red-600 bg-red-50 border-red-200";

        return (
        <>
          {/* Brand Context */}
          <div className={`${GLASS} p-3`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span>🎯</span>
              <span className="text-xs font-bold text-gray-600">מי אתה, מה הנישה, מי הקהל?</span>
            </div>
            <textarea
              value={brandContext}
              onChange={(e) => setBrandContext(e.target.value)}
              placeholder="תאר בקצרה: מי אתה, מה אתה מלמד/מוכר, מי הקהל שלך, מה הטון שלך..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-purple-300 focus:outline-none"
              rows={2}
              dir="rtl"
            />
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-3">
            {([
              { key: "analyze" as const, label: "נתח ביצועים", icon: "📊", desc: "דפוסי הצלחה, תזמון, אלגוריתם", gradient: "from-blue-500 to-purple-600" },
              { key: "generate" as const, label: "צור תוכן חדש", icon: "✍️", desc: "5 רעיונות מבוססי דאטה", gradient: "from-purple-500 to-pink-600" },
              { key: "weekly" as const, label: "דו\"ח שבועי", icon: "📋", desc: "סיכום + תוכנית פעולה", gradient: "from-amber-500 to-orange-600" },
            ]).map((a) => (
              <button
                key={a.key}
                onClick={() => runAnalysis(a.key)}
                disabled={aiLoading || media.length === 0}
                className={`rounded-2xl border p-5 text-right transition-all ${
                  aiAction === a.key && aiData && !aiData.error
                    ? "border-purple-300 bg-purple-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-purple-200 hover:shadow-md"
                } ${aiLoading ? "opacity-50 cursor-wait" : ""}`}
              >
                <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${a.gradient} text-lg text-white shadow`}>
                  {a.icon}
                </div>
                <div className="text-sm font-bold text-gray-900">{a.label}</div>
                <div className="mt-0.5 text-[11px] text-gray-400">{a.desc}</div>
              </button>
            ))}
          </div>

          {media.length === 0 && (
            <div className={`${GLASS} p-6 text-center text-sm text-gray-500`}>אין פוסטים לניתוח.</div>
          )}

          {aiLoading && (
            <div className={`${GLASS} p-10 text-center`}>
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-3 border-purple-500 border-t-transparent" />
              <p className="text-sm font-medium text-purple-700">
                {aiAction === "analyze" ? "מנתח דפוסי הצלחה..." : aiAction === "generate" ? "יוצר רעיונות תוכן..." : "מכין דו\"ח שבועי..."}
              </p>
            </div>
          )}

          {aiData?.error && !aiLoading && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{aiData.error}</div>
          )}

          {/* ── ANALYZE RESULTS ── */}
          {aiData && !aiData.error && !aiLoading && aiAction === "analyze" && (
            <div className="space-y-4">
              {/* Algorithm Signals */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Engagement Rate", value: aiData.engRate?.value + "%", status: aiData.engRate?.benchmark, icon: "💬" },
                  { label: "Saves Rate (סיגנל #2)", value: aiData.savesRate?.value + "%", status: aiData.savesRate?.status, icon: "🔖" },
                  { label: "Shares Rate (סיגנל #1)", value: aiData.sharesRate?.value + "%", status: aiData.sharesRate?.status, icon: "📤" },
                ].map((m) => (
                  <div key={m.label} className={`${GLASS} p-4`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span>{m.icon}</span>
                      <span className="text-xs text-gray-500">{m.label}</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{m.value}</div>
                    <div className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusColor(m.status)}`}>
                      {m.status}
                    </div>
                  </div>
                ))}
              </div>

              {/* Best Type + Timing */}
              <div className="grid grid-cols-2 gap-3">
                {/* Best Content Type */}
                <div className={`${GLASS} p-4`}>
                  <div className="mb-2 text-xs font-bold text-gray-500">סוג תוכן מנצח</div>
                  <div className="text-lg font-bold text-gray-900">{aiData.bestContentType?.label}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    ממוצע {aiData.bestContentType?.avgEng?.toLocaleString()} אנגייג'מנט | {aiData.bestContentType?.count} פוסטים
                  </div>
                  {aiData.contentTypes && (
                    <div className="mt-3 space-y-1.5">
                      {aiData.contentTypes.map((ct: { label: string; avgEng: number; count: number }, i: number) => {
                        const maxEng = aiData.contentTypes[0]?.avgEng || 1;
                        return (
                          <div key={ct.label} className="flex items-center gap-2">
                            <span className="w-16 text-[10px] text-gray-500">{ct.label}</span>
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${i === 0 ? "bg-purple-500" : "bg-gray-300"}`} style={{ width: `${(ct.avgEng / maxEng) * 100}%` }} />
                            </div>
                            <span className="text-[10px] font-semibold text-gray-600">{ct.avgEng.toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Best Timing */}
                <div className={`${GLASS} p-4`}>
                  <div className="mb-2 text-xs font-bold text-gray-500">תזמון אופטימלי</div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 p-3">
                      <span className="text-xl">📅</span>
                      <div>
                        <div className="text-sm font-bold text-green-800">יום {aiData.bestDay?.name}</div>
                        <div className="text-[10px] text-green-600">ממוצע {aiData.bestDay?.avgEng?.toLocaleString()} eng</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-200 p-3">
                      <span className="text-xl">🕐</span>
                      <div>
                        <div className="text-sm font-bold text-blue-800">{aiData.bestHour?.hour}:00</div>
                        <div className="text-[10px] text-blue-600">ממוצע {aiData.bestHour?.avgEng?.toLocaleString()} eng</div>
                      </div>
                    </div>
                    {aiData.worstDay && (
                      <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 p-3">
                        <span className="text-xl">⚠️</span>
                        <div>
                          <div className="text-sm font-bold text-red-800">הימנע מיום {aiData.worstDay.name}</div>
                          <div className="text-[10px] text-red-600">ממוצע {aiData.worstDay.avgEng?.toLocaleString()} eng</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Pattern Analysis */}
              {aiData.patternAnalysis && (
                <div className="flex items-start gap-3 rounded-xl bg-gradient-to-l from-purple-50 to-blue-50 border border-purple-200 p-4">
                  <span className="text-xl">🧠</span>
                  <div>
                    <div className="text-xs font-bold text-purple-700 mb-1">ניתוח דפוסים</div>
                    <div className="text-sm text-gray-800 leading-relaxed">{aiData.patternAnalysis}</div>
                  </div>
                </div>
              )}

              {/* Tips */}
              {aiData.tips && (
                <div className={`${GLASS} p-4`}>
                  <div className="mb-3 text-xs font-bold text-gray-500">המלצות מיידיות</div>
                  <div className="space-y-2">
                    {aiData.tips.map((tip: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3">
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-white">{i + 1}</span>
                        <span className="text-sm text-amber-900">{tip}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Best Post */}
              {aiData.bestPost && (
                <div className={`${GLASS} p-4`}>
                  <div className="mb-2 text-xs font-bold text-gray-500">הפוסט המוביל</div>
                  <div className="rounded-xl bg-gradient-to-l from-purple-50 to-pink-50 border border-purple-200 p-4">
                    <p className="text-sm text-gray-700 mb-2" dir="rtl">"{aiData.bestPost.caption}..."</p>
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>{aiData.bestPost.engagement?.toLocaleString()} eng</span>
                      <span>{aiData.bestPost.likes?.toLocaleString()} לייקים</span>
                      <span>{aiData.bestPost.comments?.toLocaleString()} תגובות</span>
                      {aiData.bestPost.saves > 0 && <span>{aiData.bestPost.saves?.toLocaleString()} שמירות</span>}
                      <span className="mr-auto">{aiData.bestPost.type}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── GENERATE RESULTS ── */}
          {aiData && !aiData.error && !aiLoading && aiAction === "generate" && aiData.ideas && (
            <div className="space-y-3">
              {/* Brand Identity + Voice */}
              <div className="grid gap-3 md:grid-cols-2">
                {aiData.brandIdentity && (
                  <div className="flex items-start gap-3 rounded-xl bg-gradient-to-l from-blue-50 to-purple-50 border border-purple-200 p-4">
                    <span className="text-xl">👤</span>
                    <div>
                      <div className="text-xs font-bold text-purple-700 mb-0.5">פרסונל ברנד</div>
                      <div className="text-sm text-gray-800">{aiData.brandIdentity}</div>
                    </div>
                  </div>
                )}
                {aiData.voiceAnalysis && (
                  <div className="flex items-start gap-3 rounded-xl bg-gradient-to-l from-pink-50 to-purple-50 border border-purple-200 p-4">
                    <span className="text-xl">🗣️</span>
                    <div>
                      <div className="text-xs font-bold text-purple-700 mb-0.5">Voice & Tone</div>
                      <div className="text-sm text-gray-800">{aiData.voiceAnalysis}</div>
                    </div>
                  </div>
                )}
              </div>
              {aiData.ideas.map((idea: { title: string; type: string; trend?: string; hook: string; caption: string; cta: string; bestTime: string; reason: string }, i: number) => (
                <div key={i} className={`${GLASS} overflow-hidden`}>
                  {/* Idea header */}
                  <div className="flex items-center gap-3 bg-gradient-to-l from-purple-50 to-pink-50 border-b border-purple-100 px-5 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 text-sm font-bold text-white">{i + 1}</div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-gray-900">{idea.title}</div>
                      <div className="text-[10px] text-gray-500">{idea.type} | {idea.bestTime}</div>
                    </div>
                    {idea.trend && (
                      <div className="rounded-full bg-pink-100 border border-pink-200 px-2.5 py-1 text-[10px] font-semibold text-pink-700">
                        🔥 {idea.trend}
                      </div>
                    )}
                  </div>
                  {/* Idea body */}
                  <div className="p-5 space-y-3">
                    <div>
                      <div className="text-[10px] font-bold text-purple-600 mb-1">הוק (שורה ראשונה)</div>
                      <div className="rounded-lg bg-purple-50 border border-purple-200 px-3 py-2 text-sm font-medium text-purple-900" dir="rtl">
                        "{idea.hook}"
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[10px] font-bold text-gray-500">כיתוב מוכן להעתקה</div>
                        <button
                          onClick={() => navigator.clipboard.writeText(idea.hook + "\n\n" + idea.caption + "\n\n" + idea.cta)}
                          className="rounded-lg border border-gray-200 px-2 py-0.5 text-[10px] text-gray-400 hover:bg-gray-50"
                        >
                          העתק
                        </button>
                      </div>
                      <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm text-gray-800 whitespace-pre-line leading-relaxed" dir="rtl">{idea.caption}</div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
                        <div className="text-[10px] font-bold text-blue-700">CTA</div>
                        <div className="text-xs text-blue-800">{idea.cta}</div>
                      </div>
                      <div className="flex-1 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                        <div className="text-[10px] font-bold text-green-700">למה יעבוד</div>
                        <div className="text-[11px] text-green-600">{idea.reason}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── WEEKLY RESULTS ── */}
          {aiData && !aiData.error && !aiLoading && aiAction === "weekly" && (
            <div className="space-y-4">
              {/* Weekly stats */}
              {aiData.weeklyStats && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[
                    { label: "Engagement", value: aiData.weeklyStats.engagement?.toLocaleString(), icon: "💬" },
                    { label: "Saves", value: aiData.weeklyStats.saves?.toLocaleString(), icon: "🔖" },
                    { label: "Shares", value: aiData.weeklyStats.shares?.toLocaleString(), icon: "📤" },
                    { label: "ממוצע לפוסט", value: aiData.weeklyStats.avgEng?.toLocaleString(), icon: "📊" },
                  ].map((s) => (
                    <div key={s.label} className={`${GLASS} p-4 text-center`}>
                      <div className="text-lg mb-1">{s.icon}</div>
                      <div className="text-xl font-bold text-gray-900">{s.value}</div>
                      <div className="text-[10px] text-gray-400">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Best post this week */}
              {aiData.weeklyBestPost && (
                <div className={`${GLASS} p-4`}>
                  <div className="mb-2 text-xs font-bold text-gray-500">הפוסט המוביל השבוע</div>
                  <div className="rounded-xl bg-gradient-to-l from-amber-50 to-yellow-50 border border-amber-200 p-4">
                    <p className="text-sm text-gray-700" dir="rtl">"{aiData.weeklyBestPost.caption}..."</p>
                    <div className="mt-2 flex gap-2 text-xs text-amber-700">
                      <span>{aiData.weeklyBestPost.engagement?.toLocaleString()} eng</span>
                      <span>{aiData.weeklyBestPost.type}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Posting frequency */}
              {aiData.postingFrequency && (
                <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4">
                  <span className="text-xl">📅</span>
                  <div>
                    <div className="text-xs font-bold text-amber-700 mb-0.5">תדירות פרסום</div>
                    <div className="text-sm text-amber-900">{aiData.postingFrequency}</div>
                  </div>
                </div>
              )}

              {/* What to improve */}
              {aiData.weeklyImprove && (
                <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-200 p-4">
                  <span className="text-xl">💡</span>
                  <div>
                    <div className="text-xs font-bold text-blue-700 mb-0.5">מה לשפר</div>
                    <div className="text-sm text-blue-800">{aiData.weeklyImprove}</div>
                  </div>
                </div>
              )}

              {/* Weekly insight */}
              {aiData.weeklyInsight && (
                <div className="flex items-start gap-3 rounded-xl bg-purple-50 border border-purple-200 p-4">
                  <span className="text-xl">🔮</span>
                  <div>
                    <div className="text-xs font-bold text-purple-700 mb-0.5">תובנה מפתיעה</div>
                    <div className="text-sm text-purple-900">{aiData.weeklyInsight}</div>
                  </div>
                </div>
              )}

              {/* Weekly plan */}
              {aiData.weeklyPlan && (
                <div className={`${GLASS} p-4`}>
                  <div className="mb-3 text-xs font-bold text-gray-500">תוכנית לשבוע הבא</div>
                  <div className="space-y-2">
                    {aiData.weeklyPlan.map((p: { day: string; time: string; type: string; topic: string; hookIdea?: string }, i: number) => (
                      <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-sm font-bold text-purple-700">{i + 1}</div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-gray-900">{p.topic}</div>
                            <div className="text-[10px] text-gray-400">{p.type}</div>
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-bold text-gray-900">יום {p.day}</div>
                            <div className="text-[10px] text-gray-400">{p.time}</div>
                          </div>
                        </div>
                        {p.hookIdea && (
                          <div className="rounded-lg bg-purple-50 border border-purple-200 px-3 py-1.5 text-xs text-purple-800" dir="rtl">
                            הוק: "{p.hookIdea}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
        );
      })()}

      {/* ═══ TAB: Audience ═══ */}
      {tab === "audience" && (
        <>
          {audience ? (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Gender */}
              <div className={`${GLASS} p-4`}>
                <h3 className="mb-3 text-sm font-bold text-gray-700">מגדר</h3>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-blue-500" /><span className="text-xs text-gray-600">גברים</span></div>
                    <div className="text-2xl font-bold text-gray-900">{genderSplit.male}%</div>
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-pink-500" /><span className="text-xs text-gray-600">נשים</span></div>
                    <div className="text-2xl font-bold text-gray-900">{genderSplit.female}%</div>
                  </div>
                </div>
                <div className="mt-3 flex h-3 overflow-hidden rounded-full">
                  <div className="bg-blue-500" style={{ width: `${genderSplit.male}%` }} />
                  <div className="bg-pink-500" style={{ width: `${genderSplit.female}%` }} />
                  {genderSplit.unknown > 0 && <div className="bg-gray-300" style={{ width: `${genderSplit.unknown}%` }} />}
                </div>
              </div>
              {/* Age */}
              <div className={`${GLASS} p-4`}>
                <h3 className="mb-3 text-sm font-bold text-gray-700">קבוצות גיל</h3>
                <div className="space-y-2">
                  {ageGroups.map(([age, count]) => <AudienceBar key={age} label={age} value={count} max={Math.max(...ageGroups.map((g) => g[1]))} />)}
                </div>
              </div>
              {/* Cities */}
              <div className={`${GLASS} p-4`}>
                <h3 className="mb-3 text-sm font-bold text-gray-700">ערים מובילות</h3>
                <div className="space-y-2">
                  {topCities.map(([city, count]) => <AudienceBar key={city} label={city} value={count} max={topCities[0]?.[1] || 1} />)}
                </div>
                {topCities.length === 0 && <p className="text-xs text-gray-400">אין מספיק נתונים</p>}
              </div>
              {/* Countries */}
              <div className={`${GLASS} p-4`}>
                <h3 className="mb-3 text-sm font-bold text-gray-700">מדינות מובילות</h3>
                <div className="space-y-2">
                  {topCountries.map(([country, count]) => <AudienceBar key={country} label={country} value={count} max={topCountries[0]?.[1] || 1} />)}
                </div>
                {topCountries.length === 0 && <p className="text-xs text-gray-400">אין מספיק נתונים</p>}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">{mediaLoading ? "טוען נתוני קהל..." : "נתוני קהל לא זמינים. צריך לפחות 100 עוקבים."}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
