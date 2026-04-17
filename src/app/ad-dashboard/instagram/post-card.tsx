"use client";

import { GLASS } from "../lib/constants";
import type { InstagramMedia } from "../lib/instagram-api";
import { fmtK, fmtPct, fmtDate, scoreColor } from "./utils";

function MediaTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; color: string }> = {
    IMAGE: { label: "תמונה", color: "bg-blue-100 text-blue-700" },
    VIDEO: { label: "וידאו", color: "bg-purple-100 text-purple-700" },
    CAROUSEL_ALBUM: { label: "קרוסלה", color: "bg-amber-100 text-amber-700" },
    REEL: { label: "ריל", color: "bg-pink-100 text-pink-700" },
  };
  const info = map[type] || { label: type, color: "bg-gray-100 text-gray-700" };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${info.color}`}>{info.label}</span>;
}

export { MediaTypeBadge };

export function PostCard({ post, rank, score }: { post: InstagramMedia; rank: number; score: number }) {
  const reach = post.reach || 0;
  const engRate = reach > 0 ? ((post.engagement || 0) / reach) * 100 : 0;
  const savesRate = reach > 0 ? ((post.saved || 0) / reach) * 100 : 0;
  const sharesRate = reach > 0 ? ((post.shares || 0) / reach) * 100 : 0;

  return (
    <div className={`${GLASS} overflow-hidden transition-all hover:shadow-md`}>
      <div className="relative aspect-square bg-gray-100">
        {post.mediaUrl && post.mediaType !== "VIDEO" ? (
          <img src={post.mediaUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : post.thumbnailUrl ? (
          <img src={post.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-gray-300">📷</div>
        )}
        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-white">{rank}</div>
        <div className="absolute left-2 top-2"><MediaTypeBadge type={post.mediaType} /></div>
        <div className="absolute bottom-2 right-2">
          <div className={`flex items-center gap-1 rounded-full ${scoreColor(score)} px-2 py-0.5`}>
            <span className="text-[10px] font-bold text-white">{score}</span>
          </div>
        </div>
      </div>
      <div className="p-3">
        <p className="mb-2 line-clamp-2 text-xs text-gray-600" dir="rtl">{post.caption || "(ללא כיתוב)"}</p>
        <div className="mb-2 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400 w-14">שמירות</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(savesRate * 10, 100)}%` }} />
            </div>
            <span className="text-[10px] font-semibold text-gray-700 w-10 text-left">{savesRate > 0 ? fmtPct(savesRate) : "—"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400 w-14">שיתופים</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-pink-400 rounded-full" style={{ width: `${Math.min(sharesRate * 20, 100)}%` }} />
            </div>
            <span className="text-[10px] font-semibold text-gray-700 w-10 text-left">{sharesRate > 0 ? fmtPct(sharesRate) : "—"}</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1 text-center">
          <div><div className="text-xs font-bold text-gray-900">{fmtK(post.likeCount)}</div><div className="text-[9px] text-gray-400">לייק</div></div>
          <div><div className="text-xs font-bold text-gray-900">{fmtK(post.commentsCount)}</div><div className="text-[9px] text-gray-400">תגובה</div></div>
          <div><div className="text-xs font-bold text-gray-900">{fmtK(post.saved || 0)}</div><div className="text-[9px] text-gray-400">שמירה</div></div>
          <div><div className="text-xs font-bold text-gray-900">{fmtK(post.shares || 0)}</div><div className="text-[9px] text-gray-400">שיתוף</div></div>
        </div>
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
