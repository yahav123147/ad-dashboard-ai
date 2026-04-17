import { NextRequest, NextResponse } from "next/server";

async function wpFetch(siteUrl: string, user: string, appPassword: string, endpoint: string) {
  const url = `${siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/${endpoint}`;
  const auth = Buffer.from(`${user}:${appPassword}`).toString("base64");

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WP API error ${res.status}: ${err}`);
  }

  return res.json();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim();
}

export async function POST(request: NextRequest) {
  try {
    const { siteUrl, user, appPassword } = await request.json();

    if (!siteUrl || !user || !appPassword) {
      return NextResponse.json({ error: "Missing WP credentials" }, { status: 400 });
    }

    const posts = await wpFetch(siteUrl, user, appPassword, "posts?per_page=100&status=publish,draft&orderby=date&order=desc");
    const pages = await wpFetch(siteUrl, user, appPassword, "pages?per_page=100&status=publish,draft&orderby=date&order=desc");

    const articles = [...posts, ...pages].map((item: {
      id: number;
      title: { rendered: string };
      link: string;
      slug: string;
      status: string;
      date: string;
      modified: string;
      excerpt: { rendered: string };
    }) => ({
      id: item.id,
      title: stripHtml(item.title.rendered),
      url: item.link,
      slug: item.slug,
      status: item.status,
      publishedAt: item.date,
      modifiedAt: item.modified,
      excerpt: stripHtml(item.excerpt.rendered).slice(0, 200),
    }));

    articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    return NextResponse.json({ articles });
  } catch (err) {
    console.error("WP content error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "WP fetch failed" },
      { status: 500 }
    );
  }
}
