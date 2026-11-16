import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LangToggle, MawidWordmark } from "@/components/mawid-brand";
import { useI18n } from "@/lib/i18n";
import { StagingAuth, stagingAuthConfig, type StagingSession } from "@/lib/staging-auth";

const copy = {
  en: {
    title: "Sign in to MAWID staging",
    intro: "Use your staging test email to receive a one-time sign-in code.",
    sent: "Check your inbox for the newest code. It may be in Spam.",
    email: "Email address",
    code: "Email code",
    send: "Send code",
    resend: "Send a new code",
    verify: "Verify code",
    change: "Change email address",
    busy: "Please wait…",
    signedIn: "Email verified",
    signedOut: "Signed out of this session.",
    signOut: "Sign out",
    account: "Signed in as",
    noAccess: "Booking and staff access require a separate staging membership.",
    missing: "Staging authentication is unavailable. Check the staging build configuration.",
    otp_expired: "This code is invalid or expired. Request a fresh code and try again.",
    over_email_send_rate_limit: "Please wait before requesting another code.",
    over_request_rate_limit: "Too many requests. Please wait and try again.",
    connection_unavailable: "Could not reach the sign-in service. Try again.",
    signOutFailed: "Signed out on this page. Supabase sign-out could not be confirmed.",
    expired: "Your staging session expired. Sign in again.",
    otherError: "Sign-in could not be completed. Check your email and try again.",
  },
  ar: {
    title: "تسجيل الدخول إلى بيئة موعد التجريبية",
    intro: "استخدم بريد الاختبار لتلقي رمز تسجيل دخول لمرة واحدة.",
    sent: "تحقق من بريدك الوارد واستخدم أحدث رمز. قد تجده في البريد غير المرغوب فيه.",
    email: "البريد الإلكتروني",
    code: "رمز البريد الإلكتروني",
    send: "إرسال الرمز",
    resend: "إرسال رمز جديد",
    verify: "التحقق من الرمز",
    change: "تغيير البريد الإلكتروني",
    busy: "يرجى الانتظار…",
    signedIn: "تم التحقق من البريد الإلكتروني",
    signedOut: "تم تسجيل الخروج من هذه الجلسة.",
    signOut: "تسجيل الخروج",
    account: "الحساب الذي سجّل الدخول",
    noAccess: "يتطلب الوصول إلى الحجوزات وأدوات الفريق عضوية منفصلة في البيئة التجريبية.",
    missing: "خدمة تسجيل الدخول غير متاحة. تحقق من إعدادات البيئة التجريبية.",
    otp_expired: "الرمز غير صالح أو منتهي الصلاحية. اطلب رمزاً جديداً وحاول مجدداً.",
    over_email_send_rate_limit: "يرجى الانتظار قبل طلب رمز آخر.",
    over_request_rate_limit: "عدد الطلبات كبير. يُرجى الانتظار ثم المحاولة مجدداً.",
    connection_unavailable: "تعذر الاتصال بخدمة تسجيل الدخول. حاول مجدداً.",
    signOutFailed: "تم تسجيل الخروج من هذه الصفحة. تعذر تأكيد تسجيل الخروج من الخدمة.",
    expired: "انتهت صلاحية جلسة الاختبار. سجّل الدخول مرة أخرى.",
    otherError: "تعذر تسجيل الدخول. تحقق من بريدك الإلكتروني وحاول مجدداً.",
  },
} as const;

export function StagingSignIn() {
  const { lang, dir } = useI18n();
  const t = copy[lang];
  const [auth] = useState(() => {
    const config = stagingAuthConfig(
      import.meta.env.MODE,
      import.meta.env["VITE_SUPABASE_URL"],
      import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
    );
    return config ? new StagingAuth(config) : null;
  });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [requested, setRequested] = useState(false);
  const [session, setSession] = useState<StagingSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"signedOut" | "expired" | null>(null);
  const [error, setError] = useState<keyof typeof copy.en | null>(null);

  useEffect(() => {
    if (!session || !auth) return;
    const timer = window.setTimeout(
      () => {
        setSession(null);
        setNotice("expired");
        void auth.signOut().catch(() => {});
      },
      Math.max(0, session.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [auth, session]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || busy) return;
    const form = new FormData(event.currentTarget);
    const address = String(form.get("email") ?? "").trim();
    if (!address) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (requested) {
        setCode("");
        setSession(await auth.verifyCode(address, String(form.get("code") ?? "")));
        setRequested(false);
        setEmail("");
      } else {
        await auth.sendCode(address);
        setEmail(address);
        setRequested(true);
      }
    } catch (failure) {
      showError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!auth || busy) return;
    setBusy(true);
    setError(null);
    setCode("");
    try {
      await auth.sendCode(email.trim());
    } catch (failure) {
      showError(failure);
    } finally {
      setBusy(false);
    }
  }

  function showError(failure: unknown) {
    const code = failure instanceof Error ? failure.message : "";
    switch (code) {
      case "otp_expired":
      case "over_email_send_rate_limit":
      case "over_request_rate_limit":
      case "connection_unavailable":
        setError(code);
        break;
      default:
        setError("otherError");
    }
  }

  async function signOut() {
    if (!auth || busy) return;
    setBusy(true);
    setError(null);
    setSession(null);
    try {
      await auth.signOut();
      setNotice("signedOut");
    } catch {
      setError("signOutFailed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main dir={dir} className="mx-auto min-h-screen max-w-xl px-5 py-8">
      <header className="flex items-center justify-between gap-4">
        <div className="text-primary inline-flex items-baseline gap-2">
          <MawidWordmark />
        </div>
        <LangToggle compact />
      </header>
      <section className="bg-card shadow-card mt-10 space-y-5 rounded-2xl border p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">{session ? t.signedIn : t.title}</h1>
        {!auth ? (
          <p role="alert">{t.missing}</p>
        ) : session ? (
          <>
            <p>
              {t.account} <bdi className="break-all">{session.email}</bdi>
            </p>
            <p className="text-muted-foreground text-sm">{t.noAccess}</p>
            <Button type="button" variant="outline" onClick={() => void signOut()}>
              {t.signOut}
            </Button>
          </>
        ) : (
          <form method="post" onSubmit={(event) => void submit(event)} className="space-y-4">
            <p className="text-muted-foreground text-sm" role="status">
              {requested ? t.sent : t.intro}
            </p>
            <div className="space-y-1.5">
              <label htmlFor="staging-email">{t.email}</label>
              <Input
                id="staging-email"
                name="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                required
                maxLength={254}
                value={email}
                readOnly={requested}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {requested && (
              <div className="space-y-1.5">
                <label htmlFor="staging-code">{t.code}</label>
                <Input
                  id="staging-code"
                  name="code"
                  autoComplete="one-time-code"
                  type="password"
                  inputMode="numeric"
                  dir="ltr"
                  required
                  pattern="[0-9]{6,10}"
                  maxLength={10}
                  value={code}
                  disabled={busy}
                  onChange={(event) => setCode(event.target.value)}
                />
              </div>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? t.busy : requested ? t.verify : t.send}
            </Button>
            {requested && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void resend()}
                >
                  {t.resend}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setRequested(false);
                    setCode("");
                    setError(null);
                  }}
                >
                  {t.change}
                </Button>
              </div>
            )}
          </form>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {t[error]}
          </p>
        )}
        {notice && (
          <p role="status" className="text-muted-foreground text-sm">
            {t[notice]}
          </p>
        )}
      </section>
    </main>
  );
}
