import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "התחבר | אצבע על הדופק",
  description: "חבר את חשבון Meta שלך כדי לעקוב אחרי ביצועי המודעות",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <LoginContent searchParamsPromise={searchParams} />;
}

async function LoginContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ error?: string }>;
}) {
  const { error } = await searchParamsPromise;

  const errorMessages: Record<string, string> = {
    denied: "ביטלת את ההרשאה. נסה שוב.",
    missing_params: "חסרים פרמטרים. נסה שוב.",
    invalid_state: "שגיאת אבטחה. נסה שוב.",
    auth_failed: "ההתחברות נכשלה. נסה שוב.",
  };

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-gray-50"
      dir="rtl"
    >
      <div className="mx-4 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm md:p-10">
        {/* Header */}
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
          Meta Ads Dashboard
        </div>
        <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">
          אצבע על הדופק
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-gray-500">
          חבר את חשבון Meta שלך כדי לראות את ביצועי המודעות, משפך ההמרות
          והאבחון האוטומטי.
        </p>

        {/* Error message */}
        {error && errorMessages[error] && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {errorMessages[error]}
          </div>
        )}

        {/* Login button */}
        <a
          href="/api/ad-dashboard/auth/login"
          className="flex items-center justify-center gap-3 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-blue-500 hover:shadow-md"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
          </svg>
          התחבר עם Facebook
        </a>

        <p className="mt-6 text-center text-xs text-gray-400">
          נדרשת הרשאת{" "}
          <span className="font-medium text-gray-600">ads_read</span> לקריאת
          נתוני המודעות שלך.
        </p>

        {/* Features list */}
        <div className="mt-8 border-t border-gray-200 pt-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-600">
            מה תקבל?
          </h3>
          <ul className="space-y-2.5 text-sm text-gray-500">
            <li className="flex items-center gap-2">
              <span className="text-emerald-600">✓</span>
              סנכרון אוטומטי של נתוני Meta Ads
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-600">✓</span>
              12 מדדי ביצוע מחושבים אוטומטית
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-600">✓</span>
              משפך המרות מלא עם אבחון
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-600">✓</span>
              תמיכה במספר חשבונות פרסום
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
