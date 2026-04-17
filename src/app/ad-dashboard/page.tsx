import type { Metadata } from "next";
import { Dashboard } from "./dashboard";
import { getSessionData } from "./lib/session";
import type { AdUser } from "./lib/types";

export const metadata: Metadata = {
  title: "דשבורד ממומן | אצבע על הדופק",
  description:
    "דשבורד מעקב הוצאות פרסום ממומן והחזר השקעה לבעלי עסקים — סנכרון אוטומטי מ-Meta Ads",
};

export default async function Page() {
  let user: AdUser | null = null;

  const session = await getSessionData();
  if (session) {
    user = {
      id: session.metaUserId,
      metaUserId: session.metaUserId,
      name: session.name,
      email: session.email,
      hasValidToken: session.tokenExpiresAt
        ? new Date(session.tokenExpiresAt) > new Date()
        : true,
      tokenExpiresAt: session.tokenExpiresAt,
    };
  }

  return <Dashboard user={user} />;
}
