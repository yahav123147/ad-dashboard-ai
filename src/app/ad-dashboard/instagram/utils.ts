import type { InstagramMedia } from "../lib/instagram-api";

export function fmtK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("he-IL");
}

export function fmtPct(n: number): string {
  return n.toFixed(2) + "%";
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

// ─── Content Score (1-100) ───

export function calcContentScore(
  post: InstagramMedia,
  avgEngRate: number,
  avgSavesRate: number,
  avgSharesRate: number
): number {
  const reach = post.reach || 1;
  const engRate = (post.engagement || 0) / reach;
  const savesRate = (post.saved || 0) / reach;
  const sharesRate = (post.shares || 0) / reach;

  const engScore = avgEngRate > 0 ? Math.min(engRate / avgEngRate, 3) / 3 : 0;
  const savesScore = avgSavesRate > 0 ? Math.min(savesRate / avgSavesRate, 3) / 3 : 0;
  const sharesScore = avgSharesRate > 0 ? Math.min(sharesRate / avgSharesRate, 3) / 3 : 0;

  const weighted = (engScore * 2 + savesScore * 3 + sharesScore * 5) / 10;
  return Math.round(Math.min(weighted * 100, 100));
}

export function scoreColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-green-400";
  if (score >= 40) return "bg-amber-400";
  if (score >= 20) return "bg-orange-400";
  return "bg-red-400";
}

export interface ScoredPost {
  post: InstagramMedia;
  score: number;
}

export interface ContentTypeStat {
  type: string;
  count: number;
  avgReach: number;
  engRate: number;
  savesRate: number;
  sharesRate: number;
  avgScore: number;
}
