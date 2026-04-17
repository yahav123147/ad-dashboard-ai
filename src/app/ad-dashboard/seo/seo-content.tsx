"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { GLASS, GLASS_HOVER } from "../lib/constants";
import type { WPArticle, SeoConnections, SCKeyword } from "../lib/seo-types";

function fmtK(n: number): string {
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("he-IL");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

interface SeoContentProps {
  articles: WPArticle[];
  loading: boolean;
  since: string;
  connections: SeoConnections;
  keywords: SCKeyword[];
}

export function SeoContent({ articles, loading, since, connections, keywords }: SeoContentProps) {
  const [generating, setGenerating] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0);
  const [genResult, setGenResult] = useState<{ title: string; url: string } | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (generating) {
      setGenElapsed(0);
      timerRef.current = setInterval(() => setGenElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [generating]);

  const generateArticle = async () => {
    if (!connections.wordpress.connected) return;
    setGenerating(true);
    setGenError(null);
    setGenResult(null);
    try {
      const res = await fetch("/api/ad-dashboard/seo/generate-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topArticles: articles.filter(a => (a.clicks || 0) > 0).slice(0, 10).map(a => ({
            title: a.title,
            url: a.url,
            clicks: a.clicks,
            position: a.position,
          })),
          topKeywords: keywords.slice(0, 20).map(k => ({
            query: k.query,
            clicks: k.clicks,
            position: k.position,
            impressions: k.impressions,
          })),
          wpCredentials: {
            siteUrl: connections.wordpress.siteUrl,
            user: connections.wordpress.user,
            appPassword: connections.wordpress.appPassword,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGenResult({ title: data.title, url: data.editUrl || data.url });
      } else {
        setGenError(data.error || "לא הצלחתי לייצר מאמר");
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setGenerating(false);
    }
  };
  const sortedArticles = useMemo(() => {
    return [...articles].sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
  }, [articles]);

  const newArticles = useMemo(() => {
    return articles.filter((a) => new Date(a.publishedAt) >= new Date(since));
  }, [articles, since]);

  const thinContent = useMemo(() => {
    return articles.filter((a) => a.trafficTrend === "down");
  }, [articles]);

  const noTraffic = useMemo(() => {
    return articles.filter((a) => a.status === "publish" && (a.clicks || 0) === 0);
  }, [articles]);

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
        <div className={`${GLASS} p-4 text-center`}>
          <div className="text-2xl font-bold text-gray-900">{articles.length}</div>
          <div className="text-xs text-gray-500">סה"כ מאמרים</div>
        </div>
        <div className={`${GLASS} p-4 text-center`}>
          <div className="text-2xl font-bold text-green-600">{newArticles.length}</div>
          <div className="text-xs text-gray-500">חדשים בתקופה</div>
        </div>
        <div className={`${GLASS} p-4 text-center`}>
          <div className="text-2xl font-bold text-red-500">{thinContent.length}</div>
          <div className="text-xs text-gray-500">טראפיק יורד</div>
        </div>
        <div className={`${GLASS} p-4 text-center`}>
          <div className="text-2xl font-bold text-gray-400">{noTraffic.length}</div>
          <div className="text-xs text-gray-500">בלי טראפיק</div>
        </div>
      </div>

      {/* Generate Article */}
      <div className={`${GLASS} p-5`}>
        {!generating && !genResult && (
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">כתוב מאמר חדש עם AI</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">מנתח את המאמרים והמילים המצליחים שלך ומפרסם מאמר חדש באתר</p>
            </div>
            <button
              onClick={generateArticle}
              disabled={!connections.wordpress.connected}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-700 disabled:opacity-50"
            >
              ✍️ כתוב מאמר חדש
            </button>
          </div>
        )}
        {generating && (
          <div className="flex items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-700">
                {genElapsed < 10 ? "מנתח מאמרים מצליחים..." :
                 genElapsed < 30 ? "בוחר נושא ומילות מפתח..." :
                 genElapsed < 60 ? "כותב את המאמר..." :
                 genElapsed < 90 ? "מפרסם באתר..." :
                 "כמעט מסיים..."}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {String(Math.floor(genElapsed / 60)).padStart(2, "0")}:{String(genElapsed % 60).padStart(2, "0")} | בדרך כלל 60-90 שניות
              </div>
            </div>
          </div>
        )}
        {genResult && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-green-700">✅ מאמר חדש פורסם!</div>
              <div className="text-xs text-gray-600 mt-0.5">{genResult.title}</div>
            </div>
            <div className="flex gap-2">
              <a
                href={genResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                צפה במאמר →
              </a>
              <button
                onClick={() => setGenResult(null)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
              >
                כתוב עוד
              </button>
            </div>
          </div>
        )}
        {genError && (
          <div className="text-xs text-red-600">{genError}
            <button onClick={() => setGenError(null)} className="mr-2 text-gray-400 hover:text-gray-600">✕</button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {sortedArticles.map((article) => {
          const isNew = new Date(article.publishedAt) >= new Date(since);
          return (
            <div key={article.id} className={`${GLASS} ${GLASS_HOVER} p-4`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-gray-900">{article.title}</h4>
                    {isNew && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">חדש</span>}
                    {article.trafficTrend === "down" && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">טראפיק יורד</span>}
                    {article.status === "draft" && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">טיוטה</span>}
                  </div>
                  <a href={article.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs text-blue-500 hover:underline">
                    {article.url.replace(/https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                  <div className="mt-1 text-xs text-gray-400">
                    פורסם {fmtDate(article.publishedAt)} ({daysAgo(article.publishedAt)} ימים)
                  </div>
                  {article.topKeywords && article.topKeywords.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {article.topKeywords.slice(0, 5).map((kw) => (
                        <span key={kw} className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">{kw}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-4 text-center">
                  <div>
                    <div className="text-lg font-bold text-gray-900">{fmtK(article.clicks || 0)}</div>
                    <div className="text-[10px] text-gray-400">קליקים</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-700">{(article.position || 0).toFixed(1)}</div>
                    <div className="text-[10px] text-gray-400">מיקום</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {articles.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">חבר את WordPress כדי לראות מאמרים</div>
        )}
      </div>
    </div>
  );
}
