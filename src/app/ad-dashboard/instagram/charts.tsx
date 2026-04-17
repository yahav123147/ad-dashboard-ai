"use client";

import { GLASS } from "../lib/constants";
import type { InstagramMedia, InstagramDayInsight } from "../lib/instagram-api";
import { fmtK, fmtDate } from "./utils";

// ─── Daily Chart ───

export function DailyChart({ data, metric, label, color = "#8b5cf6" }: {
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

export function BestTimeHeatmap({ posts }: { posts: InstagramMedia[] }) {
  const grid: Record<string, { total: number; count: number }> = {};
  const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

  for (const post of posts) {
    const d = new Date(post.timestamp);
    const day = d.getDay();
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
      <div className="mb-3 text-sm font-bold text-gray-700">הזמן הטוב ביותר לפרסום</div>
      <div className="overflow-x-auto">
        <div className="min-w-[500px]">
          <div className="flex gap-0.5 mb-0.5">
            <div className="w-12" />
            {hours.map((h) => (
              <div key={h} className="flex-1 text-center text-[8px] text-gray-400">{h}:00</div>
            ))}
          </div>
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
                    style={{ backgroundColor: intensity > 0 ? `rgba(139, 92, 246, ${0.1 + intensity * 0.8})` : "#f3f4f6" }}
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
          <div className="mt-2 flex items-center justify-end gap-1 text-[9px] text-gray-400">
            <span>נמוך</span>
            {[0.1, 0.3, 0.5, 0.7, 0.9].map((v) => (
              <div key={v} className="h-3 w-3 rounded-sm" style={{ backgroundColor: `rgba(139, 92, 246, ${0.1 + v * 0.8})` }} />
            ))}
            <span>גבוה</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Card ───

export function KpiCard({ label, value, icon, sub, color = "blue" }: {
  label: string; value: string; icon: string; sub?: string;
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
    <div className={`${GLASS} rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md p-4`}>
      <div className="mb-2 flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${colorMap[color]} text-sm text-white`}>{icon}</div>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

// ─── Audience Bar ───

export function AudienceBar({ label, value, max }: { label: string; value: number; max: number }) {
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
