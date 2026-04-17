"use client";

import { useState, useMemo } from "react";
import { GLASS } from "../lib/constants";
import type { SCKeyword } from "../lib/seo-types";

type KeywordFilter = "all" | "up" | "down" | "new" | "opportunity";
type SortField = "query" | "clicks" | "impressions" | "ctr" | "position" | "change";

function fmtK(n: number): string {
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("he-IL");
}

interface SeoKeywordsProps {
  keywords: SCKeyword[];
  loading: boolean;
}

export function SeoKeywords({ keywords, loading }: SeoKeywordsProps) {
  const [filter, setFilter] = useState<KeywordFilter>("all");
  const [sortField, setSortField] = useState<SortField>("clicks");
  const [sortDesc, setSortDesc] = useState(true);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let result = [...keywords];

    if (search) {
      result = result.filter((k) => k.query.includes(search));
    }

    switch (filter) {
      case "up":
        result = result.filter((k) => k.prevPosition !== undefined && k.position < k.prevPosition);
        break;
      case "down":
        result = result.filter((k) => k.prevPosition !== undefined && k.position > k.prevPosition);
        break;
      case "new":
        result = result.filter((k) => k.prevPosition === undefined);
        break;
      case "opportunity":
        result = result.filter((k) => k.position >= 8 && k.position <= 20 && k.impressions > 50);
        break;
    }

    result.sort((a, b) => {
      let va: number, vb: number;
      switch (sortField) {
        case "query": return sortDesc ? b.query.localeCompare(a.query, "he") : a.query.localeCompare(b.query, "he");
        case "change":
          va = (a.prevPosition || a.position) - a.position;
          vb = (b.prevPosition || b.position) - b.position;
          break;
        default:
          va = a[sortField] ?? 0;
          vb = b[sortField] ?? 0;
      }
      return sortDesc ? (vb ?? 0) - (va ?? 0) : (va ?? 0) - (vb ?? 0);
    });

    return result;
  }, [keywords, filter, sortField, sortDesc, search]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDesc(!sortDesc);
    else { setSortField(field); setSortDesc(true); }
  };

  const FILTERS: { key: KeywordFilter; label: string; count: number }[] = [
    { key: "all", label: "הכל", count: keywords.length },
    { key: "up", label: "↑ עולות", count: keywords.filter((k) => k.prevPosition !== undefined && k.position < k.prevPosition).length },
    { key: "down", label: "↓ יורדות", count: keywords.filter((k) => k.prevPosition !== undefined && k.position > k.prevPosition).length },
    { key: "new", label: "חדשות", count: keywords.filter((k) => k.prevPosition === undefined).length },
    { key: "opportunity", label: "הזדמנויות", count: keywords.filter((k) => k.position >= 8 && k.position <= 20 && k.impressions > 50).length },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              filter === f.key
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-white text-gray-600 hover:border-emerald-200"
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
        <input
          type="text"
          placeholder="חפש מילת מפתח..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mr-auto rounded-lg border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-emerald-300"
          dir="rtl"
        />
      </div>

      <div className={`${GLASS} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50 text-xs text-gray-500">
              {([
                ["query", "מילת מפתח"],
                ["position", "מיקום"],
                ["change", "שינוי"],
                ["clicks", "קליקים"],
                ["impressions", "חשיפות"],
                ["ctr", "CTR"],
              ] as [SortField, string][]).map(([field, label]) => (
                <th
                  key={field}
                  onClick={() => handleSort(field)}
                  className="cursor-pointer px-4 py-3 text-right font-medium hover:text-gray-700"
                >
                  {label} {sortField === field ? (sortDesc ? "▼" : "▲") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((kw) => {
              const change = kw.prevPosition !== undefined ? kw.prevPosition - kw.position : null;
              return (
                <tr key={kw.query} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{kw.query}</td>
                  <td className="px-4 py-2.5 text-gray-700">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      kw.position <= 3 ? "bg-green-100 text-green-700" :
                      kw.position <= 10 ? "bg-blue-100 text-blue-700" :
                      kw.position <= 20 ? "bg-amber-100 text-amber-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {kw.position.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {change !== null && (
                      <span className={`text-xs font-semibold ${change > 0 ? "text-green-600" : change < 0 ? "text-red-500" : "text-gray-400"}`}>
                        {change > 0 ? `↑${change.toFixed(1)}` : change < 0 ? `↓${Math.abs(change).toFixed(1)}` : "—"}
                      </span>
                    )}
                    {change === null && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">חדש</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700">{fmtK(kw.clicks)}</td>
                  <td className="px-4 py-2.5 text-gray-700">{fmtK(kw.impressions)}</td>
                  <td className="px-4 py-2.5 text-gray-700">{(kw.ctr * 100).toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">אין מילות מפתח בסינון הנוכחי</div>
        )}
      </div>
    </div>
  );
}
