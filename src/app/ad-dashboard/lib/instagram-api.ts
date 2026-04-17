import { META_API_BASE } from "./constants";

// ═══════════════════════════════════════════════════════════
// Instagram Graph API Client
// Uses Page Access Token approach — no instagram_basic or
// instagram_manage_insights scopes needed. Only requires:
// pages_show_list + pages_read_engagement
// ═══════════════════════════════════════════════════════════

class InstagramApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: number
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

const API_TIMEOUT_MS = 30_000;

async function igFetch<T>(url: string, accessToken: string): Promise<T> {
  const separator = url.includes("?") ? "&" : "?";
  const fullUrl = url.startsWith("http")
    ? `${url}${separator}access_token=${accessToken}`
    : `${META_API_BASE}${url}${separator}access_token=${accessToken}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(fullUrl, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body?.error?.message || `Instagram API error: ${res.status}`;
      throw new InstagramApiError(msg, res.status, body?.error?.code);
    }
    return res.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new InstagramApiError("Request timeout (30s)", 408);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Types ───

export interface InstagramAccount {
  id: string; // Instagram Business Account ID
  pageId: string; // Facebook Page ID (for token lookup)
  username: string;
  name: string;
  profilePictureUrl: string;
  followersCount: number;
  followsCount: number;
  mediaCount: number;
  biography: string;
  website: string;
}

export interface InstagramMedia {
  id: string;
  caption: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  mediaUrl: string;
  thumbnailUrl?: string;
  permalink: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
  // Insights (only for business/creator accounts)
  reach?: number;
  impressions?: number;
  saved?: number;
  shares?: number;
  engagement?: number;
  plays?: number; // for reels/video
}

export interface InstagramDayInsight {
  date: string; // YYYY-MM-DD
  impressions: number;
  reach: number;
  followerCount: number;
  profileViews: number;
  websiteClicks: number;
}

export interface InstagramAudienceInsight {
  cities: Record<string, number>;
  countries: Record<string, number>;
  genderAge: Record<string, number>; // e.g. "M.25-34": 150
}

// ─── Page Token Helper ───
// The key insight: we use Page Access Tokens (not User tokens)
// to access Instagram data. This only requires pages_show_list
// and pages_read_engagement — no instagram_* scopes needed.

interface FacebookPageWithToken {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

// In-memory cache for pages (avoids 3x duplicate API calls per request)
const pagesCache = new Map<string, { pages: FacebookPageWithToken[]; ts: number }>();
const CACHE_TTL = 60_000; // 1 minute

async function getPages(userAccessToken: string): Promise<FacebookPageWithToken[]> {
  const cacheKey = userAccessToken.slice(-20); // Use tail of token as key
  const cached = pagesCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.pages;
  }
  // Try direct page access first
  const res = await igFetch<{ data: FacebookPageWithToken[] }>(
    "/me/accounts?fields=id,name,access_token,instagram_business_account&limit=50",
    userAccessToken
  );

  if (res.data.length > 0) {
    pagesCache.set(cacheKey, { pages: res.data, ts: Date.now() });
    return res.data;
  }

  // If no direct pages, try via Business Manager
  try {
    const bizRes = await igFetch<{ data: Array<{ id: string; name: string }> }>(
      "/me/businesses?fields=id,name&limit=10",
      userAccessToken
    );

    const allPages: FacebookPageWithToken[] = [];

    for (const biz of bizRes.data) {
      try {
        const bizPages = await igFetch<{ data: FacebookPageWithToken[] }>(
          `/${biz.id}/owned_pages?fields=id,name,access_token,instagram_business_account&limit=50`,
          userAccessToken
        );
        allPages.push(...bizPages.data);
      } catch {
        // Try client_pages if owned_pages fails
        try {
          const clientPages = await igFetch<{ data: FacebookPageWithToken[] }>(
            `/${biz.id}/client_pages?fields=id,name,access_token,instagram_business_account&limit=50`,
            userAccessToken
          );
          allPages.push(...clientPages.data);
        } catch {
          // Skip this business
        }
      }
    }

    pagesCache.set(cacheKey, { pages: allPages, ts: Date.now() });
    return allPages;
  } catch {
    // business_management not available, return empty
    return [];
  }
}

// Clear cache (useful for logout/token refresh)
export function clearPagesCache() {
  pagesCache.clear();
}

/** Get the Page Access Token for a specific Instagram account */
export async function getPageTokenForIg(
  userAccessToken: string,
  igAccountId: string
): Promise<string> {
  const pages = await getPages(userAccessToken);
  const page = pages.find(
    (p) => p.instagram_business_account?.id === igAccountId
  );
  if (!page) {
    throw new InstagramApiError(
      "לא נמצא דף פייסבוק מחובר לחשבון אינסטגרם זה",
      404
    );
  }
  return page.access_token;
}

// ─── Discover Instagram Accounts ───

export async function getInstagramAccounts(
  userAccessToken: string
): Promise<InstagramAccount[]> {
  const pages = await getPages(userAccessToken);
  const igAccounts: InstagramAccount[] = [];

  for (const page of pages) {
    if (!page.instagram_business_account?.id) continue;

    const igId = page.instagram_business_account.id;
    const pageToken = page.access_token;

    try {
      const profile = await igFetch<{
        id: string;
        username: string;
        name: string;
        profile_picture_url: string;
        followers_count: number;
        follows_count: number;
        media_count: number;
        biography: string;
        website: string;
      }>(
        `/${igId}?fields=id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website`,
        pageToken // Use Page token, not user token
      );

      igAccounts.push({
        id: profile.id,
        pageId: page.id,
        username: profile.username,
        name: profile.name || profile.username,
        profilePictureUrl: profile.profile_picture_url || "",
        followersCount: profile.followers_count || 0,
        followsCount: profile.follows_count || 0,
        mediaCount: profile.media_count || 0,
        biography: profile.biography || "",
        website: profile.website || "",
      });
    } catch (err) {
      console.error(`Failed to fetch IG account ${igId}:`, err);
    }
  }

  return igAccounts;
}

// ─── Account Insights (daily metrics) ───

export async function getAccountInsights(
  userAccessToken: string,
  igAccountId: string,
  since: string, // YYYY-MM-DD
  until: string
): Promise<InstagramDayInsight[]> {
  // Get page token for this IG account
  const pageToken = await getPageTokenForIg(userAccessToken, igAccountId);

  const sinceTs = Math.floor(new Date(since).getTime() / 1000);
  const untilTs = Math.floor(new Date(until).getTime() / 1000);

  // Fetch multiple metrics in parallel
  const metrics = ["impressions", "reach", "follower_count", "profile_views", "website_clicks"];

  const results = await Promise.allSettled(
    metrics.map((metric) =>
      igFetch<{
        data: Array<{
          name: string;
          values: Array<{ value: number; end_time: string }>;
        }>;
      }>(
        `/${igAccountId}/insights?metric=${metric}&period=day&since=${sinceTs}&until=${untilTs}`,
        pageToken
      )
    )
  );

  // Build a date map
  const dayMap: Record<string, InstagramDayInsight> = {};

  results.forEach((result, idx) => {
    if (result.status !== "fulfilled") return;
    const metricName = metrics[idx];
    const dataArr = result.value.data?.[0]?.values || [];

    for (const point of dataArr) {
      const date = point.end_time.slice(0, 10);
      if (!dayMap[date]) {
        dayMap[date] = {
          date,
          impressions: 0,
          reach: 0,
          followerCount: 0,
          profileViews: 0,
          websiteClicks: 0,
        };
      }
      if (metricName === "impressions") dayMap[date].impressions = point.value;
      if (metricName === "reach") dayMap[date].reach = point.value;
      if (metricName === "follower_count") dayMap[date].followerCount = point.value;
      if (metricName === "profile_views") dayMap[date].profileViews = point.value;
      if (metricName === "website_clicks") dayMap[date].websiteClicks = point.value;
    }
  });

  return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Media (Posts) with Insights ───

export async function getMediaWithInsights(
  userAccessToken: string,
  igAccountId: string,
  limit = 50
): Promise<InstagramMedia[]> {
  // Get page token for this IG account
  const pageToken = await getPageTokenForIg(userAccessToken, igAccountId);

  // Fetch media list
  const mediaRes = await igFetch<{
    data: Array<{
      id: string;
      caption?: string;
      media_type: string;
      media_url?: string;
      thumbnail_url?: string;
      permalink: string;
      timestamp: string;
      like_count?: number;
      comments_count?: number;
    }>;
    paging?: { next?: string };
  }>(
    `/${igAccountId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=${limit}`,
    pageToken
  );

  // Build base posts
  const posts: InstagramMedia[] = mediaRes.data.map((m) => ({
    id: m.id,
    caption: m.caption || "",
    mediaType: m.media_type as InstagramMedia["mediaType"],
    mediaUrl: m.media_url || "",
    thumbnailUrl: m.thumbnail_url,
    permalink: m.permalink,
    timestamp: m.timestamp,
    likeCount: m.like_count || 0,
    commentsCount: m.comments_count || 0,
    engagement: (m.like_count || 0) + (m.comments_count || 0),
  }));

  // Fetch insights for ALL posts in parallel (batches of 25 to balance speed vs rate limits)
  const BATCH_SIZE = 25;
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((post) => {
        const insightMetrics =
          post.mediaType === "VIDEO"
            ? "impressions,reach,saved,shares,plays"
            : "impressions,reach,saved,shares";
        return igFetch<{
          data: Array<{ name: string; values: Array<{ value: number }> }>;
        }>(`/${post.id}/insights?metric=${insightMetrics}`, pageToken);
      })
    );

    results.forEach((result, idx) => {
      const post = posts[i + idx];
      if (result.status === "fulfilled") {
        for (const insight of result.value.data) {
          const val = insight.values?.[0]?.value || 0;
          if (insight.name === "impressions") post.impressions = val;
          if (insight.name === "reach") post.reach = val;
          if (insight.name === "saved") post.saved = val;
          if (insight.name === "shares") post.shares = val;
          if (insight.name === "plays") post.plays = val;
        }
        post.engagement =
          post.likeCount + post.commentsCount + (post.saved || 0) + (post.shares || 0);
      }
    });
  }

  return posts;
}

// ─── Audience Demographics ───

export async function getAudienceInsights(
  userAccessToken: string,
  igAccountId: string
): Promise<InstagramAudienceInsight> {
  // Get page token for this IG account
  const pageToken = await getPageTokenForIg(userAccessToken, igAccountId);

  const res = await igFetch<{
    data: Array<{
      name: string;
      values: Array<{ value: Record<string, number> }>;
    }>;
  }>(
    `/${igAccountId}/insights?metric=audience_city,audience_country,audience_gender_age&period=lifetime`,
    pageToken
  );

  const result: InstagramAudienceInsight = {
    cities: {},
    countries: {},
    genderAge: {},
  };

  for (const metric of res.data) {
    const val = metric.values?.[0]?.value || {};
    if (metric.name === "audience_city") result.cities = val;
    if (metric.name === "audience_country") result.countries = val;
    if (metric.name === "audience_gender_age") result.genderAge = val;
  }

  return result;
}
