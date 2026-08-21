import { ArrowRight, Building2, CalendarCheck2, Check, LockKeyhole, MapPin } from "lucide-react";

import { LangToggle, PrototypeNotice, ResetDemoButton, Wordmark } from "@/components/mawid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { appPath } from "@/lib/navigation";
import { useDemo } from "@/lib/store";
import { cn } from "@/lib/utils";

export function LauncherPage() {
  const { t, tv, dir } = useI18n();
  const { ready, salons, salon, setTenant } = useDemo();

  if (!ready) {
    return (
      <main className="mx-auto min-h-screen max-w-7xl px-5 py-8 sm:px-8">
        <Skeleton className="h-10 w-44" />
        <Skeleton className="mt-16 h-28 max-w-xl" />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-80 rounded-2xl" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_right,oklch(0.76_0.1_82/0.15),transparent_55%)]" />
      <div className="relative mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Wordmark className="text-primary" />
          <div className="flex items-center gap-2">
            <LangToggle compact />
            <ResetDemoButton variant="ghost" />
          </div>
        </header>

        <section className="grid items-end gap-8 pb-10 pt-14 lg:grid-cols-[1.15fr_0.85fr] lg:pt-20">
          <div>
            <Badge className="border-gold/50 bg-gold/10 text-gold-foreground hover:bg-gold/10">
              {t("prototype_badge")}
            </Badge>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl lg:text-6xl">
              {t("tagline")}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              {t("launcher_intro")}
            </p>
          </div>
          <div className="rounded-2xl border border-primary/15 bg-card p-5 shadow-card sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                <LockKeyhole className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="font-semibold">
                  {dir === "rtl" ? "مساحات عمل خاصة لكل صالون" : "Private by workspace"}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {dir === "rtl"
                    ? "لكل نشاط فريقه وخدماته وجدوله وبياناته الخاصة. لا تظهر الأعمال للعملاء كسوق عام."
                    : "Each business keeps its team, services, schedule and customer data separate. This is not a public marketplace."}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="workspace-heading" className="pb-10">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                {dir === "rtl" ? "أداة العرض" : "Demo launcher"}
              </p>
              <h2 id="workspace-heading" className="mt-1 text-2xl font-semibold">
                {t("choose_workspace")}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              3 {dir === "rtl" ? "مساحات تجريبية" : "fictional workspaces"}
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {salons.map((item) => {
              const selected = item.id === salon.id;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setTenant(item.id)}
                  aria-pressed={selected}
                  className={cn(
                    "group overflow-hidden rounded-2xl border bg-card text-start shadow-card outline-none transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    selected ? "border-primary ring-1 ring-primary" : "border-border",
                  )}
                >
                  <div className="relative h-44 overflow-hidden">
                    <img
                      src={item.cover}
                      alt=""
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
                    <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3 text-white">
                      <div className="grid h-12 min-w-12 place-items-center rounded-xl border border-white/40 bg-black/20 px-2 text-sm font-bold backdrop-blur-sm">
                        {item.initials}
                      </div>
                      {selected && (
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-4 w-4" aria-hidden />
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-semibold">{tv(item.name)}</h3>
                    <p className="mt-1 text-sm font-medium text-primary">{tv(item.kind)}</p>
                    <p className="mt-3 flex items-start gap-2 text-sm leading-5 text-muted-foreground">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      {tv(item.address)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-5 border-y border-border py-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <PrototypeNotice />
          <div className="grid gap-3 sm:grid-cols-2">
            <Button asChild variant="outline" size="lg" className="min-h-12 rounded-xl px-5">
              <a href={appPath(`/customer/${salon.id}`)}>
                <CalendarCheck2 className="h-4 w-4" aria-hidden />
                {t("view_customer")}
              </a>
            </Button>
            <Button asChild size="lg" className="min-h-12 rounded-xl px-5">
              <a href={appPath(`/manage/${salon.id}/overview`)}>
                <Building2 className="h-4 w-4" aria-hidden />
                {t("open_dashboard")}
                <ArrowRight className="flip-rtl h-4 w-4" aria-hidden />
              </a>
            </Button>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 py-7 text-xs text-muted-foreground">
          <span>
            MAWID | موعد ·{" "}
            {dir === "rtl" ? "نموذج خيالي للعرض" : "Fictional presentation prototype"}
          </span>
          <span>
            {dir === "rtl" ? "لا مدفوعات · لا رسائل حقيقية" : "No payments · No real SMS"}
          </span>
        </footer>
      </div>
    </main>
  );
}
