import { NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";

const META_API_BASE = "https://graph.facebook.com/v21.0";

export async function GET() {
  const session = await getSessionData();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // 1. Check token permissions
  try {
    const debugRes = await fetch(
      `${META_API_BASE}/debug_token?input_token=${session.accessToken}&access_token=${session.accessToken}`
    );
    const debugData = await debugRes.json();
    results.tokenScopes = debugData.data?.scopes || [];
    results.tokenValid = debugData.data?.is_valid;
    results.tokenExpiresAt = debugData.data?.expires_at;
  } catch (err) {
    results.tokenError = err instanceof Error ? err.message : "Failed to debug token";
  }

  // 2. Try to get pages
  try {
    const pagesRes = await fetch(
      `${META_API_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account&limit=50&access_token=${session.accessToken}`
    );
    const pagesData = await pagesRes.json();
    if (pagesData.error) {
      results.pagesError = pagesData.error.message;
    } else {
      results.pages = (pagesData.data || []).map((p: { id: string; name: string; instagram_business_account?: { id: string }; access_token?: string }) => ({
        id: p.id,
        name: p.name,
        hasInstagram: !!p.instagram_business_account,
        instagramId: p.instagram_business_account?.id || null,
        hasPageToken: !!p.access_token,
      }));
      results.totalPages = pagesData.data?.length || 0;
    }
  } catch (err) {
    results.pagesError = err instanceof Error ? err.message : "Failed to fetch pages";
  }

  // 3. Check businesses (Business Manager)
  try {
    const bizRes = await fetch(
      `${META_API_BASE}/me/businesses?fields=id,name&limit=50&access_token=${session.accessToken}`
    );
    const bizData = await bizRes.json();
    if (bizData.error) {
      results.businessesError = bizData.error.message;
    } else {
      results.businesses = bizData.data || [];
      results.totalBusinesses = bizData.data?.length || 0;
    }
  } catch (err) {
    results.businessesError = err instanceof Error ? err.message : "Failed";
  }

  // 4. Try getting pages via business_management path
  try {
    const pagesAltRes = await fetch(
      `${META_API_BASE}/me?fields=accounts{id,name,instagram_business_account}&access_token=${session.accessToken}`
    );
    const pagesAltData = await pagesAltRes.json();
    results.pagesAlt = pagesAltData;
  } catch {
    // ignore
  }

  // 5a. Try alternative: field expansion on IG user node (might bypass permission)
  try {
    const directPagesCheck = await fetch(
      `${META_API_BASE}/me/accounts?fields=id,access_token,instagram_business_account&limit=50&access_token=${session.accessToken}`
    );
    const dpData = await directPagesCheck.json();
    const igPage2 = dpData.data?.find((p: { instagram_business_account?: { id: string } }) => p.instagram_business_account);
    if (igPage2) {
      const igId = igPage2.instagram_business_account.id;
      const pt = igPage2.access_token;

      // Try 1: field expansion
      const try1 = await fetch(`${META_API_BASE}/${igId}?fields=media.limit(3){id,caption,media_type,timestamp,like_count,comments_count}&access_token=${pt}`);
      const try1Data = await try1.json();
      results.fieldExpansionTest = try1Data.error ? { error: try1Data.error.message } : { mediaCount: try1Data.media?.data?.length || 0, sample: try1Data.media?.data?.slice(0, 2) };

      // Try 2: recently_searched_hashtags (tests if IG API is enabled)
      const try2 = await fetch(`${META_API_BASE}/${igId}?fields=id,username,media_count,followers_count&access_token=${pt}`);
      const try2Data = await try2.json();
      results.profileTest = try2Data.error ? { error: try2Data.error.message } : try2Data;
    }
  } catch (err) {
    results.altTestError = err instanceof Error ? err.message : "Failed";
  }

  // 5b. Try media via /me/accounts (direct page token - should work)
  try {
    const directPagesRes = await fetch(
      `${META_API_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account&limit=50&access_token=${session.accessToken}`
    );
    const directPagesData = await directPagesRes.json();
    const directIgPage = directPagesData.data?.find((p: { instagram_business_account?: { id: string } }) => p.instagram_business_account);
    if (directIgPage) {
      const igId = directIgPage.instagram_business_account.id;
      const pageToken = directIgPage.access_token;
      results.directTest = { pageId: directIgPage.id, pageName: directIgPage.name, igId };

      const mediaRes = await fetch(
        `${META_API_BASE}/${igId}/media?fields=id,caption,media_type,timestamp,like_count,comments_count&limit=3&access_token=${pageToken}`
      );
      const mediaData = await mediaRes.json();
      if (mediaData.error) {
        results.directMediaError = mediaData.error;
      } else {
        results.directMediaSample = mediaData.data?.slice(0, 3) || [];
        results.directMediaCount = mediaData.data?.length || 0;
      }
    }
  } catch (err) {
    results.directTestError = err instanceof Error ? err.message : "Failed";
  }

  // 6. Try to get Instagram media via page token (Business Manager path)
  try {
    // First get businesses
    const bizRes2 = await fetch(
      `${META_API_BASE}/me/businesses?fields=id,name&limit=10&access_token=${session.accessToken}`
    );
    const bizData2 = await bizRes2.json();

    if (bizData2.data?.length > 0) {
      const bizId = bizData2.data[0].id;

      // Get owned pages with tokens
      const ownedRes = await fetch(
        `${META_API_BASE}/${bizId}/owned_pages?fields=id,name,access_token,instagram_business_account&limit=50&access_token=${session.accessToken}`
      );
      const ownedData = await ownedRes.json();

      if (ownedData.error) {
        results.ownedPagesError = ownedData.error.message;
      } else {
        results.ownedPages = (ownedData.data || []).map((p: { id: string; name: string; instagram_business_account?: { id: string }; access_token?: string }) => ({
          id: p.id,
          name: p.name,
          hasInstagram: !!p.instagram_business_account,
          instagramId: p.instagram_business_account?.id || null,
          hasPageToken: !!p.access_token,
        }));

        // Try fetching media for the first IG account found
        const igPage = ownedData.data?.find((p: { instagram_business_account?: { id: string } }) => p.instagram_business_account);
        if (igPage) {
          const igId = igPage.instagram_business_account.id;
          const pageToken = igPage.access_token;
          results.testIgId = igId;
          results.testPageId = igPage.id;

          try {
            const mediaRes = await fetch(
              `${META_API_BASE}/${igId}/media?fields=id,caption,media_type,timestamp,like_count,comments_count&limit=3&access_token=${pageToken}`
            );
            const mediaData = await mediaRes.json();
            if (mediaData.error) {
              results.mediaError = mediaData.error.message;
              results.mediaErrorCode = mediaData.error.code;
            } else {
              results.mediaSample = mediaData.data?.slice(0, 3) || [];
              results.mediaCount = mediaData.data?.length || 0;
            }
          } catch (err) {
            results.mediaError = err instanceof Error ? err.message : "Failed to fetch media";
          }
        }
      }
    }
  } catch (err) {
    results.bizMediaError = err instanceof Error ? err.message : "Failed";
  }

  return NextResponse.json(results);
}
