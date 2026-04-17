import { META_API_BASE } from "./constants";

// ═══════════════════════════════════════════════════════════
// Meta Graph API Client
// ═══════════════════════════════════════════════════════════

interface MetaUserResponse {
  id: string;
  name: string;
  email?: string;
}

interface MetaAdAccountResponse {
  id: string;
  name: string;
  account_status: number;
}

interface MetaInsightResponse {
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  inline_link_clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  ad_name?: string;
}

interface MetaPagingResponse<T> {
  data: T[];
  paging?: {
    cursors?: { before: string; after: string };
    next?: string;
  };
}

class MetaApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: number
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

async function metaFetch<T>(
  endpoint: string,
  accessToken: string
): Promise<T> {
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${META_API_BASE}${endpoint}${separator}access_token=${accessToken}`;

  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      body?.error?.message || `Meta API error: ${res.status}`;
    const code = body?.error?.code;
    throw new MetaApiError(msg, res.status, code);
  }

  return res.json();
}

// ─── User Info ───

export async function getMetaUser(
  accessToken: string
): Promise<MetaUserResponse> {
  return metaFetch<MetaUserResponse>(
    "/me?fields=id,name,email",
    accessToken
  );
}

// ─── Ad Accounts ───

export async function getAdAccounts(
  accessToken: string
): Promise<MetaAdAccountResponse[]> {
  const res = await metaFetch<MetaPagingResponse<MetaAdAccountResponse>>(
    "/me/adaccounts?fields=id,name,account_status&limit=50",
    accessToken
  );
  // Filter to only active accounts (status 1)
  return res.data.filter((a) => a.account_status === 1);
}

// ─── Insights ───

export interface ParsedInsight {
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  uniqueClicks: number;
  landingPageViews: number;
  registrations: number;
  purchases: number;
  revenue: number;
  adName?: string;
}

function findAction(
  actions: Array<{ action_type: string; value: string }> | undefined,
  ...types: string[]
): number {
  if (!actions) return 0;
  for (const t of types) {
    const found = actions.find((a) => a.action_type === t);
    if (found) return parseInt(found.value) || 0;
  }
  return 0;
}

function findActionValue(
  actionValues: Array<{ action_type: string; value: string }> | undefined,
  ...types: string[]
): number {
  if (!actionValues) return 0;
  for (const t of types) {
    const found = actionValues.find((a) => a.action_type === t);
    if (found) return parseFloat(found.value) || 0;
  }
  return 0;
}

// Default lead action types (used when leadActionType = "auto")
const AUTO_LEAD_TYPES = [
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead_grouped",
  "complete_registration",
  "offsite_conversion.fb_pixel_complete_registration",
];

// ─── Campaigns ───

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
}

export async function getCampaigns(
  accessToken: string,
  accountId: string
): Promise<MetaCampaign[]> {
  const endpoint = `/${accountId}/campaigns?fields=id,name,status&limit=200`;
  const res = await metaFetch<MetaPagingResponse<MetaCampaign>>(endpoint, accessToken);
  return res.data;
}

export async function getInsights(
  accessToken: string,
  accountId: string, // act_XXXXX
  dateRange: { since: string; until: string },
  leadActionType = "auto",
  campaignId?: string
): Promise<ParsedInsight[]> {
  const timeRange = encodeURIComponent(
    JSON.stringify({ since: dateRange.since, until: dateRange.until })
  );

  // Account-level daily data — accurate totals per day
  const fields = "spend,impressions,inline_link_clicks,actions,action_values";
  const filteringParam = campaignId
    ? `&filtering=${encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: campaignId }]))}`
    : "";
  const endpoint = `/${accountId}/insights?fields=${fields}&time_range=${timeRange}&time_increment=1&limit=100${filteringParam}`;

  const res = await metaFetch<MetaPagingResponse<MetaInsightResponse>>(
    endpoint,
    accessToken
  );

  return res.data.map((row) => ({
    date: row.date_start,
    spend: parseFloat(row.spend) || 0,
    impressions: parseInt(row.impressions) || 0,
    uniqueClicks: parseInt(row.inline_link_clicks || "0") || 0,
    landingPageViews: findAction(row.actions, "landing_page_view"),
    registrations:
      leadActionType === "auto"
        ? findAction(row.actions, ...AUTO_LEAD_TYPES)
        : findAction(row.actions, leadActionType),
    purchases: findAction(
      row.actions,
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
      "onsite_conversion.purchase"
    ),
    revenue: findActionValue(
      row.action_values,
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
      "onsite_conversion.purchase"
    ),
  }));
}

// ─── Ad-Level Insights (for Winning Ad analysis) ───

interface MetaAdInsightResponse {
  ad_id: string;
  ad_name: string;
  campaign_id: string;
  campaign_name: string;
  spend: string;
  impressions: string;
  reach?: string;
  inline_link_clicks?: string;
  cpc?: string;
  cpm?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
}

export interface AdInsight {
  adId: string;
  adName: string;
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  leads: number;
  purchases: number;
  revenue: number;
  costPerResult: number;
  quality: string;
  engagement: string;
  conversion: string;
  thumbnailUrl: string;
}

export async function getAdInsights(
  accessToken: string,
  accountId: string,
  dateRange: { since: string; until: string },
  minSpend = 0,
  leadActionType = "auto",
  campaignId?: string
): Promise<AdInsight[]> {
  const timeRange = encodeURIComponent(
    JSON.stringify({ since: dateRange.since, until: dateRange.until })
  );
  const fields = [
    "ad_id",
    "ad_name",
    "campaign_id",
    "campaign_name",
    "spend",
    "impressions",
    "reach",
    "inline_link_clicks",
    "cpc",
    "cpm",
    "actions",
    "action_values",
    "quality_ranking",
    "engagement_rate_ranking",
    "conversion_rate_ranking",
  ].join(",");

  const filteringParam = campaignId
    ? `&filtering=${encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: campaignId }]))}`
    : "";
  const endpoint = `/${accountId}/insights?fields=${fields}&time_range=${timeRange}&level=ad&limit=500${filteringParam}`;

  const allRows: MetaAdInsightResponse[] = [];
  let res = await metaFetch<MetaPagingResponse<MetaAdInsightResponse>>(
    endpoint,
    accessToken
  );
  allRows.push(...res.data);

  // Pagination (up to 3 extra pages)
  let pages = 1;
  while (res.paging?.next && pages < 4) {
    try {
      const nextRes = await fetch(res.paging.next);
      if (!nextRes.ok) break;
      res = await nextRes.json();
      allRows.push(...res.data);
      pages++;
    } catch {
      break;
    }
  }

  const ads = allRows.map((row) => {
    const spend = parseFloat(row.spend) || 0;
    const impressions = parseInt(row.impressions) || 0;
    const clicks = parseInt(row.inline_link_clicks || "0") || 0;
    const leads =
      leadActionType === "auto"
        ? findAction(row.actions, ...AUTO_LEAD_TYPES)
        : findAction(row.actions, leadActionType);
    const purchases = findAction(
      row.actions,
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
      "onsite_conversion.purchase"
    );
    const revenue = findActionValue(
      row.action_values,
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
      "onsite_conversion.purchase"
    );
    const mainResult = leads > 0 ? leads : purchases;

    return {
      adId: row.ad_id || "",
      adName: row.ad_name || "ללא שם",
      campaignId: row.campaign_id || "",
      campaignName: row.campaign_name || "",
      spend,
      impressions,
      reach: parseInt(row.reach || "0") || 0,
      clicks,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: parseFloat(row.cpc || "0") || 0,
      cpm: parseFloat(row.cpm || "0") || 0,
      leads,
      purchases,
      revenue,
      costPerResult: mainResult > 0 ? spend / mainResult : 0,
      quality: row.quality_ranking || "UNKNOWN",
      engagement: row.engagement_rate_ranking || "UNKNOWN",
      conversion: row.conversion_rate_ranking || "UNKNOWN",
      thumbnailUrl: "", // Will be populated by batch fetch
    };
  });

  const filtered = ads
    .filter((a) => a.spend >= minSpend)
    .sort((a, b) => b.spend - a.spend);

  // Batch fetch thumbnails for top ads (limit to 25 to avoid rate limits)
  const topAds = filtered.slice(0, 25).filter((a) => a.adId);
  if (topAds.length > 0) {
    const adIds = topAds.map((a) => a.adId);
    try {
      const thumbRes = await metaFetch<{ data: Array<{ id: string; creative?: { thumbnail_url?: string } }> }>(
        `/?ids=${adIds.join(",")}&fields=creative{thumbnail_url}`,
        accessToken
      );
      // Response is object keyed by ad ID
      const thumbData = thumbRes as unknown as Record<string, { creative?: { thumbnail_url?: string } }>;
      for (const ad of filtered) {
        const thumb = thumbData[ad.adId];
        if (thumb?.creative?.thumbnail_url) {
          ad.thumbnailUrl = thumb.creative.thumbnail_url;
        }
      }
    } catch {
      // Thumbnails are optional — don't fail the whole request
    }
  }

  return filtered;
}

// ─── Token Validation ───

export async function validateToken(
  accessToken: string
): Promise<boolean> {
  try {
    await metaFetch<MetaUserResponse>("/me", accessToken);
    return true;
  } catch {
    return false;
  }
}

// ─── OAuth Helpers ───

export function buildLoginUrl(
  appId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "ads_read",
    response_type: "code",
    state,
  });
  return `https://www.facebook.com/${META_API_BASE.split("/").pop()}/dialog/oauth?${params}`;
}

export async function exchangeCodeForToken(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string
): Promise<{ access_token: string; expires_in?: number }> {
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(
    `${META_API_BASE}/oauth/access_token?${params}`
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new MetaApiError(
      body?.error?.message || "Failed to exchange code for token",
      res.status
    );
  }

  return res.json();
}

// Exchange short-lived token for long-lived (60 days)
export async function getLongLivedToken(
  shortToken: string,
  appId: string,
  appSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });

  const res = await fetch(
    `${META_API_BASE}/oauth/access_token?${params}`
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new MetaApiError(
      body?.error?.message || "Failed to get long-lived token",
      res.status
    );
  }

  return res.json();
}
