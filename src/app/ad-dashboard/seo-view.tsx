"use client";

import { useState, useEffect, useCallback } from "react";
import { GLASS } from "./lib/constants";
import { type DatePreset, DATE_PRESETS, getDateRange } from "./lib/date-presets";
import type {
  SeoConnections,
  SeoTab,
  SCKeyword,
  SCDayData,
  GA4Metrics,
  GA4DayData,
  WPArticle,
  SeoTask,
  SCPageData,
} from "./lib/seo-types";
import { SeoOverview } from "./seo/seo-overview";
import { SeoKeywords } from "./seo/seo-keywords";
import { SeoContent } from "./seo/seo-content";
import { SeoTasks } from "./seo/seo-tasks";

const LS_KEY = "seo_connections";

function loadConnections(): SeoConnections {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    google: { connected: false },
    wordpress: { connected: false },
  };
}

function saveConnections(c: SeoConnections) {
  localStorage.setItem(LS_KEY, JSON.stringify(c));
}

export function SeoView({ onBack }: { onBack: () => void }) {
  const [connections, setConnections] = useState<SeoConnections>(() => loadConnections());
  const [connectingWp, setConnectingWp] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [showWpForm, setShowWpForm] = useState(false);
  const [wpFormUrl, setWpFormUrl] = useState("https://");
  const [wpFormUser, setWpFormUser] = useState("");
  const [wpFormPass, setWpFormPass] = useState("");
  const [showSitePicker, setShowSitePicker] = useState(false);
  const [availableSites, setAvailableSites] = useState<string[]>([]);
  const [availableProperties, setAvailableProperties] = useState<{ id: string; name: string }[]>([]);
  const [pendingGoogleToken, setPendingGoogleToken] = useState<{ accessToken: string; refreshToken?: string; expiresAt?: number } | null>(null);

  const [tab, setTab] = useState<SeoTab>("overview");
  const [datePreset, setDatePreset] = useState<DatePreset>("last_30d");

  const [ga4Metrics, setGa4Metrics] = useState<GA4Metrics | null>(null);
  const [ga4Daily, setGa4Daily] = useState<GA4DayData[]>([]);
  const [scSummary, setScSummary] = useState<{ clicks: number; impressions: number; ctr: number; position: number } | null>(null);
  const [scPrevSummary, setScPrevSummary] = useState<{ clicks: number; impressions: number; ctr: number; position: number } | null>(null);
  const [scDaily, setScDaily] = useState<SCDayData[]>([]);
  const [keywords, setKeywords] = useState<SCKeyword[]>([]);
  const [articles, setArticles] = useState<WPArticle[]>([]);
  const [scPages, setScPages] = useState<SCPageData[]>([]);
  const [tasks, setTasks] = useState<SeoTask[]>([]);
  const [tasksSummary, setTasksSummary] = useState<string>("");
  const [monthlyGrowth, setMonthlyGrowth] = useState<import("./lib/seo-types").MonthlyGrowthData[]>([]);

  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingKeywords, setLoadingKeywords] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const { since, until } = getDateRange(datePreset);

  const connectWp = useCallback(async () => {
    if (!wpFormUrl || !wpFormUser || !wpFormPass) {
      setConnectError("מלא את כל השדות");
      return;
    }
    setConnectingWp(true);
    setConnectError(null);
    try {
      const res = await fetch("/api/ad-dashboard/seo/wp-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl: wpFormUrl, user: wpFormUser, appPassword: wpFormPass }),
      });
      const data = await res.json();

      if (data.success) {
        const updated: SeoConnections = {
          ...connections,
          wordpress: {
            connected: true,
            siteUrl: data.siteUrl,
            user: data.user,
            appPassword: data.appPassword,
          },
        };
        setConnections(updated);
        saveConnections(updated);
        setShowWpForm(false);
      } else {
        setConnectError(data.error || "חיבור WordPress נכשל");
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnectingWp(false);
    }
  }, [connections, wpFormUrl, wpFormUser, wpFormPass]);

  // Exchange OAuth code for tokens (called after redirect back from Google)
  const exchangeGoogleCode = useCallback(async (code: string) => {
    setConnectingGoogle(true);
    setConnectError(null);
    try {
      const res = await fetch("/api/ad-dashboard/seo/google-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();

      if (data.success) {
        const sites = data.searchConsole?.sites || [];
        const properties = data.analytics?.properties || [];

        if (sites.length > 1 || properties.length > 1) {
          // Multiple sites — let user choose
          setAvailableSites(sites);
          setAvailableProperties(properties);
          setPendingGoogleToken({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            expiresAt: data.expiresAt,
          });
          setShowSitePicker(true);
        } else {
          // Single site — auto-connect
          const updated: SeoConnections = {
            ...connections,
            google: {
              connected: true,
              accessToken: data.accessToken,
              refreshToken: data.refreshToken,
              siteUrl: data.searchConsole?.siteUrl,
              propertyId: data.analytics?.propertyId,
              expiresAt: data.expiresAt,
            },
          };
          setConnections(updated);
          saveConnections(updated);
        }
      } else {
        setConnectError(data.error || "חיבור Google נכשל");
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setConnectingGoogle(false);
    }
  }, [connections]);

  // Auto-detect Google OAuth callback (code in cookie after redirect)
  useEffect(() => {
    if (connections.google.connected) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("seo_google") === "success") {
      // Read code from cookie
      const match = document.cookie.match(/google_oauth_code=([^;]+)/);
      if (match) {
        const code = decodeURIComponent(match[1]);
        // Clear the cookie
        document.cookie = "google_oauth_code=; path=/; max-age=0";
        // Clean URL
        window.history.replaceState({}, "", "/ad-dashboard");
        exchangeGoogleCode(code);
      }
    }
    if (params.get("seo_error")) {
      setConnectError(`Google: ${params.get("seo_error")}`);
      window.history.replaceState({}, "", "/ad-dashboard");
    }
  }, [connections.google.connected, exchangeGoogleCode]);

  // Confirm site selection from picker
  const confirmSiteSelection = useCallback((siteUrl: string, propertyId: string) => {
    if (!pendingGoogleToken) return;
    const updated: SeoConnections = {
      ...connections,
      google: {
        connected: true,
        accessToken: pendingGoogleToken.accessToken,
        refreshToken: pendingGoogleToken.refreshToken,
        siteUrl,
        propertyId,
        expiresAt: pendingGoogleToken.expiresAt,
      },
    };
    setConnections(updated);
    saveConnections(updated);
    setShowSitePicker(false);
    setPendingGoogleToken(null);
  }, [connections, pendingGoogleToken]);

  // Auto-refresh Google token if expired
  const getValidToken = useCallback(async (): Promise<string | null> => {
    const g = connections.google;
    if (!g.connected || !g.accessToken) return null;

    // Check if token expired
    if (g.expiresAt && Date.now() > g.expiresAt && g.refreshToken) {
      try {
        const res = await fetch("/api/ad-dashboard/seo/google-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: g.refreshToken }),
        });
        const data = await res.json();
        if (data.success && data.accessToken) {
          const updated: SeoConnections = {
            ...connections,
            google: { ...g, accessToken: data.accessToken, expiresAt: data.expiresAt },
          };
          setConnections(updated);
          saveConnections(updated);
          return data.accessToken;
        }
      } catch { /* fall through to return existing token */ }
    }

    return g.accessToken;
  }, [connections]);

  const fetchSCData = useCallback(async () => {
    if (!connections.google.connected) return;

    const accessToken = await getValidToken();
    if (!accessToken) {
      setConnectError("ה-token של Google פג תוקף ולא הצלחתי לרענן. נתק והתחבר מחדש.");
      return;
    }

    setLoadingOverview(true);
    setLoadingKeywords(true);
    try {
      const base = {
        accessToken,
        siteUrl: connections.google.siteUrl,
        since,
        until,
      };

      const scFetch = async (type: string) => {
        const r = await fetch("/api/ad-dashboard/seo/search-console", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, type }),
        });
        const data = await r.json();
        if (data.error) {
          console.error(`SC ${type} error:`, data.error);
          if (data.error.includes("401") || data.error.includes("403") || data.error.includes("UNAUTHENTICATED")) {
            setConnectError("ה-token של Google פג תוקף. נתק והתחבר מחדש.");
          }
          return null;
        }
        return data;
      };

      const [summaryRes, dailyRes, keywordsRes, pagesRes] = await Promise.all([
        scFetch("summary"),
        scFetch("daily"),
        scFetch("keywords"),
        scFetch("pages"),
      ]);

      if (summaryRes) setScSummary(summaryRes);
      if (dailyRes) setScDaily(dailyRes.daily || []);
      if (keywordsRes) setKeywords(keywordsRes.keywords || []);
      if (pagesRes) setScPages(pagesRes.pages || []);
    } catch (err) {
      console.error("SC fetch error:", err);
    } finally {
      setLoadingOverview(false);
      setLoadingKeywords(false);
    }
  }, [connections.google, since, until, getValidToken]);

  const fetchGA4Data = useCallback(async () => {
    if (!connections.google.connected) return;

    const accessToken = await getValidToken();
    if (!accessToken) return;

    try {
      const base = {
        accessToken,
        propertyId: connections.google.propertyId,
        since,
        until,
      };

      const ga4Fetch = async (type: string) => {
        const r = await fetch("/api/ad-dashboard/seo/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, type }),
        });
        const data = await r.json();
        if (data.error) {
          console.error(`GA4 ${type} error:`, data.error);
          return null;
        }
        return data;
      };

      const [metricsRes, dailyRes] = await Promise.all([
        ga4Fetch("summary"),
        ga4Fetch("daily"),
      ]);

      if (metricsRes) setGa4Metrics(metricsRes);
      if (dailyRes) setGa4Daily(dailyRes.daily || []);
    } catch (err) {
      console.error("GA4 fetch error:", err);
    }
  }, [connections.google, since, until, getValidToken]);

  // Fetch 12 months of growth data (runs once on connect)
  const fetchYearlyGrowth = useCallback(async () => {
    if (!connections.google.connected) return;
    const accessToken = await getValidToken();
    if (!accessToken) return;

    try {
      const MONTHS_HE = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];
      const now = new Date();
      const yearAgo = new Date(now);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      yearAgo.setDate(1);
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      // GA4 monthly users
      // Fetch GA4 + SC in parallel (not sequential)
      const [ga4Res, scRes] = await Promise.all([
        fetch("/api/ad-dashboard/seo/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken,
            propertyId: connections.google.propertyId,
            since: fmt(yearAgo),
            until: fmt(now),
            type: "daily",
          }),
        }),
        fetch("/api/ad-dashboard/seo/search-console", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken,
            siteUrl: connections.google.siteUrl,
            since: fmt(yearAgo),
            until: fmt(now),
            type: "daily",
          }),
        }),
      ]);
      const ga4Data = await ga4Res.json();
      const scData = await scRes.json();

      // Aggregate by month
      const monthMap = new Map<string, { users: number; sessions: number; clicks: number }>();

      for (const d of ga4Data.daily || []) {
        const m = d.date.slice(0, 7); // "2025-05"
        const prev = monthMap.get(m) || { users: 0, sessions: 0, clicks: 0 };
        prev.users += d.users || 0;
        prev.sessions += d.sessions || 0;
        monthMap.set(m, prev);
      }
      for (const d of scData.daily || []) {
        const m = d.date.slice(0, 7);
        const prev = monthMap.get(m) || { users: 0, sessions: 0, clicks: 0 };
        prev.clicks += d.clicks || 0;
        monthMap.set(m, prev);
      }

      const months = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month,
          label: MONTHS_HE[parseInt(month.split("-")[1]) - 1],
          ...data,
        }));

      setMonthlyGrowth(months);
    } catch (err) {
      console.error("Yearly growth fetch error:", err);
    }
  }, [connections.google, getValidToken]);

  const fetchArticles = useCallback(async () => {
    if (!connections.wordpress.connected) return;
    setLoadingContent(true);
    try {
      const res = await fetch("/api/ad-dashboard/seo/wp-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl: connections.wordpress.siteUrl,
          user: connections.wordpress.user,
          appPassword: connections.wordpress.appPassword,
        }),
      });
      const data = await res.json();

      const pageMap = new Map(scPages.map((p) => [p.page, p]));
      const enriched = (data.articles || []).map((article: WPArticle) => {
        const scData = pageMap.get(article.url) || pageMap.get(article.url + "/");
        return {
          ...article,
          clicks: scData?.clicks || 0,
          impressions: scData?.impressions || 0,
          position: scData?.position || 0,
        };
      });

      setArticles(enriched);
    } catch (err) {
      console.error("WP fetch error:", err);
    } finally {
      setLoadingContent(false);
    }
  }, [connections.wordpress, scPages]);

  const generateTasks = useCallback(async () => {
    if (!connections.google.connected) return;
    setLoadingTasks(true);
    setConnectError(null);
    try {
      const res = await fetch("/api/ad-dashboard/seo/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, articles, scPages }),
      });

      const data = await res.json();
      if (data.tasks) {
        setTasks(data.tasks);
        setTasksSummary(data.summary || "");
        setTab("tasks");
      } else if (data.error) {
        setConnectError(data.error);
        setTab("tasks");
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Tasks generation failed");
      console.error("Tasks generation error:", err);
    } finally {
      setLoadingTasks(false);
    }
  }, [keywords, articles, scPages, connections.google]);

  useEffect(() => {
    if (connections.google.connected) {
      fetchSCData();
      fetchGA4Data();
    }
  }, [connections.google.connected, datePreset, fetchSCData, fetchGA4Data]);

  // Fetch yearly growth once on connect
  useEffect(() => {
    if (connections.google.connected && monthlyGrowth.length === 0) {
      fetchYearlyGrowth();
    }
  }, [connections.google.connected, monthlyGrowth.length, fetchYearlyGrowth]);

  // Defer articles fetch until Content tab is opened (saves 1 API call on load)
  useEffect(() => {
    if (tab === "content" && connections.wordpress.connected && scPages.length > 0 && articles.length === 0) {
      fetchArticles();
    }
  }, [tab, connections.wordpress.connected, scPages, articles.length, fetchArticles]);

  const handleTaskUpdate = useCallback((taskId: string, updates: Partial<SeoTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t)));
  }, []);

  const disconnect = (type: "google" | "wordpress") => {
    const updated = {
      ...connections,
      [type]: { connected: false },
    };
    setConnections(updated);
    saveConnections(updated);
    if (type === "google") {
      setGa4Metrics(null);
      setGa4Daily([]);
      setScSummary(null);
      setScDaily([]);
      setKeywords([]);
      setScPages([]);
    }
    if (type === "wordpress") {
      setArticles([]);
    }
  };

  const TABS: { key: SeoTab; label: string; icon: string }[] = [
    { key: "overview", label: "סקירה כללית", icon: "📊" },
    { key: "keywords", label: "מילות מפתח", icon: "🔑" },
    { key: "content", label: "מאמרים", icon: "📄" },
    { key: "tasks", label: "משימות", icon: "✅" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
          >
            ← חזרה
          </button>
          <h2 className="text-lg font-bold text-gray-900">📊 SEO Dashboard</h2>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setDatePreset(p.key)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                datePreset === p.key
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`${GLASS} p-4`}>
        <div className="flex flex-wrap items-center gap-3">
          {connections.google.connected ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-1.5">
                <span className="text-xs font-medium text-green-700">✅ Google מחובר</span>
                <span className="text-[10px] text-green-600">SC: {connections.google.siteUrl || "לא נמצא"} | GA4: {connections.google.propertyId || "לא נמצא"}</span>
                <button onClick={() => disconnect("google")} className="text-[10px] text-red-400 hover:text-red-600">נתק</button>
                <button
                  onClick={async () => {
                    const res = await fetch("/api/ad-dashboard/seo/debug", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        accessToken: connections.google.accessToken,
                        siteUrl: connections.google.siteUrl,
                        propertyId: connections.google.propertyId,
                      }),
                    });
                    const data = await res.json();
                    setConnectError("DEBUG:\n" + JSON.stringify(data, null, 2));
                  }}
                  className="text-[10px] text-blue-500 hover:text-blue-700"
                >
                  בדוק חיבור
                </button>
              </div>
            </div>
          ) : (
            <a
              href="/api/ad-dashboard/seo/google-auth"
              className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-700 transition-all hover:bg-blue-100 inline-block"
            >
              {connectingGoogle ? "מתחבר..." : "🔗 חבר Google"}
            </a>
          )}

          {connections.wordpress.connected ? (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-1.5">
              <span className="text-xs font-medium text-green-700">✅ WordPress מחובר</span>
              <span className="text-[10px] text-green-600">{connections.wordpress.siteUrl}</span>
              <button onClick={() => disconnect("wordpress")} className="text-[10px] text-red-400 hover:text-red-600">נתק</button>
            </div>
          ) : (
            <button
              onClick={() => setShowWpForm(!showWpForm)}
              className="rounded-lg border border-purple-300 bg-purple-50 px-4 py-1.5 text-xs font-semibold text-purple-700 transition-all hover:bg-purple-100"
            >
              🔗 חבר WordPress
            </button>
          )}

          {connections.google.connected && keywords.length > 0 && (
            <button
              onClick={generateTasks}
              disabled={loadingTasks}
              className="mr-auto rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-700 transition-all hover:bg-emerald-100 disabled:opacity-50"
            >
              {loadingTasks ? "מנתח..." : "🤖 ייצר משימות AI"}
            </button>
          )}
        </div>

        {/* Google Site Picker */}
        {showSitePicker && pendingGoogleToken && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3">
            <div className="text-xs font-semibold text-blue-700">בחר אתר לחיבור</div>

            {availableSites.length > 0 && (
              <div>
                <div className="text-[11px] text-gray-500 mb-1">Search Console:</div>
                <div className="flex flex-wrap gap-2">
                  {availableSites.map((site) => (
                    <button
                      key={site}
                      onClick={() => {
                        const prop = availableProperties.find((p) =>
                          p.name.toLowerCase().includes(site.replace(/https?:\/\/|sc-domain:|\/$/g, "").split(".")[0])
                        ) || availableProperties[0];
                        confirmSiteSelection(site, prop?.id || "");
                      }}
                      className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-xs font-medium text-blue-700 transition-all hover:bg-blue-100"
                    >
                      {site.replace("sc-domain:", "").replace(/https?:\/\//, "")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {availableProperties.length > 1 && (
              <div>
                <div className="text-[11px] text-gray-500 mb-1">Google Analytics:</div>
                <div className="flex flex-wrap gap-2">
                  {availableProperties.map((prop) => (
                    <span key={prop.id} className="rounded bg-gray-100 px-2 py-1 text-[10px] text-gray-600">
                      {prop.name} ({prop.id})
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => { setShowSitePicker(false); setPendingGoogleToken(null); }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
            >
              ביטול
            </button>
          </div>
        )}

        {/* WordPress Connection Form */}
        {showWpForm && !connections.wordpress.connected && (
          <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50/50 p-4 space-y-3">
            <div className="text-xs font-semibold text-purple-700">חיבור WordPress</div>
            <p className="text-[11px] text-gray-500">
              צור Application Password ב-WordPress: Users → Profile → Application Passwords
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <input
                type="text"
                placeholder="https://your-website.com"
                value={wpFormUrl}
                onChange={(e) => setWpFormUrl(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-purple-300"
                dir="ltr"
              />
              <input
                type="text"
                placeholder="שם משתמש WordPress"
                value={wpFormUser}
                onChange={(e) => setWpFormUser(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-purple-300"
                dir="ltr"
              />
              <input
                type="password"
                placeholder="Application Password"
                value={wpFormPass}
                onChange={(e) => setWpFormPass(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-purple-300"
                dir="ltr"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={connectWp}
                disabled={connectingWp}
                className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white transition-all hover:bg-purple-700 disabled:opacity-50"
              >
                {connectingWp ? "בודק חיבור..." : "התחבר"}
              </button>
              <button
                onClick={() => setShowWpForm(false)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
              >
                ביטול
              </button>
            </div>
          </div>
        )}

        {connectError && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600 whitespace-pre-wrap">
            {connectError}
          </div>
        )}
      </div>

      <div className="flex gap-1.5 border-b border-gray-200 pb-px">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-t-lg px-4 py-2 text-xs font-medium transition-all ${
              tab === t.key
                ? "border-b-2 border-emerald-600 bg-emerald-50 text-emerald-700"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <SeoOverview
          ga4={ga4Metrics}
          scSummary={scSummary}
          scPrevSummary={scPrevSummary}
          ga4Daily={ga4Daily}
          scDaily={scDaily}
          loading={loadingOverview}
          monthlyGrowth={monthlyGrowth}
        />
      )}
      {tab === "keywords" && (
        <SeoKeywords keywords={keywords} loading={loadingKeywords} />
      )}
      {tab === "content" && (
        <SeoContent articles={articles} loading={loadingContent} since={since} connections={connections} keywords={keywords} />
      )}
      {tab === "tasks" && (
        <SeoTasks
          tasks={tasks}
          loading={loadingTasks}
          connections={connections}
          onTaskUpdate={handleTaskUpdate}
          summary={tasksSummary}
        />
      )}
    </div>
  );
}
