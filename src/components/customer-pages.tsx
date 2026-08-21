import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  MapPin,
  Scissors,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { LangToggle, StatusBadge, Wordmark } from "@/components/mawid";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DEMO_OTP,
  beirutDate,
  type Appointment,
  type Employee,
  type Service,
} from "@/lib/demo-data";
import {
  formatDate,
  formatLongDate,
  formatRelative,
  formatTime,
  normalizeLebanesePhone,
} from "@/lib/format";
import { DAY_KEYS, useI18n } from "@/lib/i18n";
import { appPath } from "@/lib/navigation";
import { availableSlots, bookingAvailability, nextDays } from "@/lib/scheduling";
import { useDemo } from "@/lib/store";
import { cn } from "@/lib/utils";

function useTenant(tenantId: string) {
  const demo = useDemo();
  useEffect(() => {
    if (demo.state.tenantId !== tenantId && demo.salons.some((item) => item.id === tenantId)) {
      demo.setTenant(tenantId);
    }
  }, [demo, tenantId]);
  return demo;
}

function CustomerHeader({ tenantId, action }: { tenantId: string; action?: ReactNode }) {
  const { t } = useI18n();
  const { salon } = useTenant(tenantId);
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href={appPath(`/customer/${tenantId}`)} className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-10 min-w-10 place-items-center rounded-xl px-2 text-xs font-bold text-white"
            style={{ background: salon.accent }}
          >
            {salon.initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{useI18n().tv(salon.name)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {t("prototype_badge")}
            </span>
          </span>
        </a>
        <div className="flex items-center gap-2">
          {action}
          <LangToggle compact />
        </div>
      </div>
    </header>
  );
}

function WorkingDays({ employee }: { employee: Employee }) {
  const { t } = useI18n();
  return (
    <span>
      {employee.schedule
        .map((shift, index) => (shift ? t(DAY_KEYS[index]) : null))
        .filter(Boolean)
        .join(" · ")}
    </span>
  );
}

function EmployeeProfileDialog({
  employee,
  onClose,
}: {
  employee: Employee | null;
  onClose: () => void;
}) {
  const { t, tv, lang } = useI18n();
  return (
    <Dialog open={Boolean(employee)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {employee && (
          <>
            <DialogHeader className="text-start">
              <div className="flex items-center gap-4 pe-8">
                <img
                  src={employee.photo}
                  alt={tv(employee.name)}
                  className="h-20 w-20 rounded-2xl object-cover"
                />
                <div>
                  <DialogTitle>{tv(employee.name)}</DialogTitle>
                  <DialogDescription className="mt-1 text-primary">
                    {tv(employee.role)}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <p className="text-sm leading-6 text-muted-foreground">{tv(employee.bio)}</p>
            <div>
              <p className="mb-2 text-sm font-semibold">{t("specializations")}</p>
              <div className="flex flex-wrap gap-2">
                {employee.specialties[lang].map((specialty) => (
                  <Badge key={specialty} variant="secondary">
                    {specialty}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="rounded-xl bg-muted/60 p-4 text-sm">
              <p className="font-semibold">{t("working_days")}</p>
              <p className="mt-1 leading-6 text-muted-foreground">
                <WorkingDays employee={employee} />
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CustomerSalonPage({ tenantId }: { tenantId: string }) {
  const { t, tv, dir } = useI18n();
  const { ready, salon, employees, services, appointments } = useTenant(tenantId);
  const [profile, setProfile] = useState<Employee | null>(null);
  const tenantServices = services.filter((service) => service.salonId === tenantId);
  const categories = [
    ...new Map(tenantServices.map((service) => [tv(service.category), service.category])).values(),
  ];

  if (!ready || salon.id !== tenantId) {
    return (
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <CustomerHeader
        tenantId={tenantId}
        action={
          <Button asChild variant="ghost" className="hidden min-h-11 sm:inline-flex">
            <a href={appPath(`/customer/${tenantId}/appointments`)}>{t("my_appointments")}</a>
          </Button>
        }
      />

      <main>
        <section className="relative mx-auto max-w-7xl sm:px-5 sm:pt-5">
          <div className="relative min-h-[460px] overflow-hidden sm:rounded-3xl">
            <img src={salon.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/5" />
            <div className="relative flex min-h-[460px] max-w-3xl flex-col justify-end px-5 pb-8 pt-28 text-white sm:px-10 sm:pb-10">
              <div className="mb-5 grid h-16 w-fit min-w-16 place-items-center rounded-2xl border border-white/40 bg-black/20 px-3 text-lg font-bold backdrop-blur-sm">
                {salon.initials}
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/75">
                {tv(salon.kind)}
              </p>
              <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">{tv(salon.name)}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/85 sm:text-lg">
                {tv(salon.intro)}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="min-h-12 rounded-xl bg-white px-6 text-primary hover:bg-white/90"
                >
                  <a href={appPath(`/customer/${tenantId}/book`)}>
                    <CalendarDays className="h-4 w-4" /> {t("book_appointment")}
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="min-h-12 rounded-xl border-white/50 bg-black/10 text-white hover:bg-white/10 hover:text-white"
                >
                  <a href={appPath(`/customer/${tenantId}/appointments`)}>{t("my_appointments")}</a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-4 py-7 sm:grid-cols-2 sm:px-6">
          <div className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-card">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold">{t("location")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{tv(salon.address)}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-card">
            <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold">{t("opening_hours")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{tv(salon.hours)}</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {dir === "rtl" ? "ما نقدّمه" : "What we offer"}
            </p>
            <h2 className="mt-2 text-3xl font-semibold">{t("our_services")}</h2>
          </div>
          <div className="mt-7 space-y-8">
            {categories.map((category) => {
              const label = tv(category);
              const items = tenantServices.filter((service) => tv(service.category) === label);
              return (
                <div key={label}>
                  <div className="mb-3 flex items-center gap-2">
                    <Scissors className="h-4 w-4 text-gold" />
                    <h3 className="font-semibold">{label}</h3>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {items.map((service) => (
                      <a
                        key={service.id}
                        href={appPath(`/customer/${tenantId}/book?service=${service.id}`)}
                        className="group rounded-2xl border bg-card p-5 shadow-card transition hover:border-primary/40 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold group-hover:text-primary">
                              {tv(service.name)}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {tv(service.description)}
                            </p>
                          </div>
                          <Badge variant="secondary" className="shrink-0">
                            {service.duration} {t("minutes")}
                          </Badge>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="border-y bg-card/55">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  {dir === "rtl" ? "اختصاصيون موثوقون" : "Trusted professionals"}
                </p>
                <h2 className="mt-2 text-3xl font-semibold">{t("our_team")}</h2>
              </div>
            </div>
            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              {employees.map((employee) => {
                const service = tenantServices.find((item) =>
                  employee.serviceIds.includes(item.id),
                );
                const count = service
                  ? nextDays(7).reduce(
                      (total, date) =>
                        total +
                        availableSlots(employee, service, date, appointments, services).length,
                      0,
                    )
                  : 0;
                return (
                  <Card key={employee.id} className="overflow-hidden py-0 shadow-card">
                    <div className="grid grid-cols-[120px_1fr] sm:grid-cols-[160px_1fr]">
                      <img
                        src={employee.photo}
                        alt={tv(employee.name)}
                        className="h-full min-h-56 w-full object-cover"
                      />
                      <CardContent className="p-5">
                        <p className="text-lg font-semibold">{tv(employee.name)}</p>
                        <p className="mt-1 text-sm font-medium text-primary">{tv(employee.role)}</p>
                        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                          {tv(employee.bio)}
                        </p>
                        <p className="mt-3 flex items-center gap-1.5 text-xs text-success">
                          <Sparkles className="h-3.5 w-3.5" />
                          {count} {t("slots_available")}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => setProfile(employee)}>
                            {t("view_profile")}
                          </Button>
                          <Button asChild size="sm">
                            <a href={appPath(`/customer/${tenantId}/book?employee=${employee.id}`)}>
                              {t("select")}
                            </a>
                          </Button>
                        </div>
                      </CardContent>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-xs text-muted-foreground sm:px-6">
        <Wordmark />
        <span>
          {dir === "rtl"
            ? "صفحة حجز خاصة بالصالون · نموذج خيالي"
            : "Salon-private booking page · Fictional prototype"}
        </span>
      </footer>
      <EmployeeProfileDialog employee={profile} onClose={() => setProfile(null)} />
    </div>
  );
}

type BookingDraft = {
  serviceId: string;
  employeeId: string;
  date: string;
  time: string;
  name: string;
  phone: string;
};

function StepButton({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 text-xs",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
          active && "border-primary bg-primary text-primary-foreground",
          done && "border-success bg-success text-success-foreground",
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : "·"}
      </span>
      <span className="hidden truncate sm:block">{label}</span>
    </div>
  );
}

export function BookingPage({
  tenantId,
  initialService,
  initialEmployee,
}: {
  tenantId: string;
  initialService?: string;
  initialEmployee?: string;
}) {
  const { t, tv, lang, dir } = useI18n();
  const { ready, salon, employees, services, appointments, createBooking, signIn } =
    useTenant(tenantId);
  const tenantServices = services.filter((item) => item.salonId === tenantId);
  const [step, setStep] = useState(initialService || initialEmployee ? 2 : 1);
  const [draft, setDraft] = useState<BookingDraft>({
    serviceId: initialService ?? "",
    employeeId: initialEmployee ?? "",
    date: "",
    time: "",
    name: "",
    phone: "",
  });
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<Appointment | null>(null);
  const selectedService = tenantServices.find((item) => item.id === draft.serviceId);
  const selectedEmployee = employees.find((item) => item.id === draft.employeeId);
  const eligibleEmployees = useMemo(
    () =>
      selectedService
        ? employees.filter((item) => item.active && item.serviceIds.includes(selectedService.id))
        : [],
    [employees, selectedService],
  );
  const dates = useMemo(() => nextDays(14), []);
  const availability = useMemo(() => {
    if (!selectedService || !draft.employeeId) return [];
    const team =
      draft.employeeId === "any"
        ? eligibleEmployees
        : eligibleEmployees.filter((item) => item.id === draft.employeeId);
    return bookingAvailability(team, selectedService, dates, appointments, services);
  }, [appointments, dates, draft.employeeId, eligibleEmployees, selectedService, services]);
  const slots = availability.find((item) => item.date === draft.date)?.slots ?? [];
  const labels = [
    t("step_service"),
    t("step_employee"),
    t("step_time"),
    t("step_review"),
    t("phone_number"),
    t("step_verify"),
  ];

  if (!ready || salon.id !== tenantId)
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <Skeleton className="h-16" />
        <Skeleton className="h-[520px]" />
      </div>
    );

  const goNext = () => {
    setError("");
    if (step === 1 && !draft.serviceId)
      return setError(dir === "rtl" ? "اختر خدمة للمتابعة." : "Choose a service to continue.");
    if (step === 2 && !draft.employeeId)
      return setError(
        dir === "rtl"
          ? "اختر اختصاصياً أو خيار أي اختصاصي متاح."
          : "Choose a professional or any available professional.",
      );
    if (step === 2) {
      const firstAvailable = availability.find((item) => item.available);
      if (!firstAvailable) return setError(t("no_slots_window"));
      setDraft((value) => ({ ...value, date: firstAvailable.date, time: "" }));
    }
    if (step === 3 && (!draft.date || !draft.time))
      return setError(dir === "rtl" ? "اختر التاريخ والوقت." : "Choose a date and time.");
    if (step === 4 && !draft.name.trim()) return setError(t("name_required"));
    if (step === 5) {
      const normalized = normalizeLebanesePhone(draft.phone);
      if (!normalized) return setError(t("invalid_phone"));
      setDraft((value) => ({ ...value, phone: normalized }));
    }
    setStep((value) => Math.min(6, value + 1));
  };

  const submit = () => {
    setError("");
    if (otp !== DEMO_OTP) return setError(t("wrong_code"));
    if (!selectedService) return;
    const booking = createBooking({
      employeeId: draft.employeeId,
      serviceId: draft.serviceId,
      date: draft.date,
      time: draft.time,
      customerName: draft.name.trim(),
      phone: draft.phone,
    });
    signIn(draft.phone, draft.name.trim());
    setSubmitted(booking);
    toast.success(t("request_sent"));
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <CustomerHeader tenantId={tenantId} />
        <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-2xl place-items-center px-4 py-12">
          <Card className="w-full border-primary/20 shadow-card">
            <CardContent className="p-7 text-center sm:p-10">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/15 text-success">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <Badge className="mt-6 bg-warning/20 text-warning-foreground hover:bg-warning/20">
                {t("status_pending")}
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold">{t("request_sent")}</h1>
              <p className="mx-auto mt-3 max-w-md leading-7 text-muted-foreground">
                {t("request_sent_desc")}
              </p>
              <div className="mt-6 rounded-2xl bg-muted/60 p-5 text-start text-sm">
                <p className="font-semibold">{tv(selectedService.name)}</p>
                <p className="mt-2 text-muted-foreground">
                  {formatLongDate(draft.date, lang)} · {formatTime(draft.time, lang)}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {selectedEmployee ? tv(selectedEmployee.name) : t("any_professional")}
                </p>
              </div>
              <p className="mt-5 text-sm leading-6 text-muted-foreground">{t("notify_note")}</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <Button asChild variant="outline" className="min-h-11">
                  <a href={appPath(`/customer/${tenantId}/book`)}>{t("book_another")}</a>
                </Button>
                <Button asChild className="min-h-11">
                  <a href={appPath(`/customer/${tenantId}/appointments`)}>
                    {t("view_my_appointments")}
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <CustomerHeader
        tenantId={tenantId}
        action={
          <Button asChild variant="ghost" size="sm">
            <a href={appPath(`/customer/${tenantId}`)}>{t("close")}</a>
          </Button>
        }
      />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-7 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-primary">{tv(salon.name)}</p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{t("book_appointment")}</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("step")} {step} {t("of")} 6
          </p>
        </div>
        <Progress value={(step / 6) * 100} className="mb-5 h-1.5" />
        <div className="mb-8 flex justify-between gap-2 overflow-x-auto pb-1">
          {labels.map((label, index) => (
            <StepButton
              key={label}
              label={label}
              active={step === index + 1}
              done={step > index + 1}
            />
          ))}
        </div>

        <Card className="shadow-card">
          <CardContent className="p-5 sm:p-8">
            {step === 1 && (
              <section>
                <h2 className="text-xl font-semibold">{t("choose_service")}</h2>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {tenantServices.map((service) => (
                    <button
                      type="button"
                      key={service.id}
                      onClick={() =>
                        setDraft((value) => ({
                          ...value,
                          serviceId: service.id,
                          employeeId: "",
                          date: "",
                          time: "",
                        }))
                      }
                      className={cn(
                        "min-h-28 rounded-xl border p-4 text-start transition hover:border-primary/50",
                        draft.serviceId === service.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "bg-card",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{tv(service.name)}</p>
                          <p className="mt-1 text-xs font-medium text-primary">
                            {tv(service.category)}
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {service.duration} {t("minutes")}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm leading-5 text-muted-foreground">
                        {tv(service.description)}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {step === 2 && (
              <section>
                <h2 className="text-xl font-semibold">{t("choose_employee")}</h2>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((value) => ({ ...value, employeeId: "any", date: "", time: "" }))
                    }
                    className={cn(
                      "flex min-h-28 items-start gap-4 rounded-xl border p-4 text-start transition hover:border-primary/50",
                      draft.employeeId === "any"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "bg-card",
                    )}
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <UsersRound className="h-6 w-6" />
                    </span>
                    <span>
                      <span className="font-semibold">{t("any_professional")}</span>
                      <span className="mt-2 block text-sm leading-5 text-muted-foreground">
                        {t("any_professional_desc")}
                      </span>
                    </span>
                  </button>
                  {eligibleEmployees.map((employee) => (
                    <button
                      type="button"
                      key={employee.id}
                      onClick={() =>
                        setDraft((value) => ({
                          ...value,
                          employeeId: employee.id,
                          date: "",
                          time: "",
                        }))
                      }
                      className={cn(
                        "flex min-h-28 items-start gap-4 rounded-xl border p-4 text-start transition hover:border-primary/50",
                        draft.employeeId === employee.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "bg-card",
                      )}
                    >
                      <img
                        src={employee.photo}
                        alt={tv(employee.name)}
                        className="h-16 w-16 rounded-xl object-cover"
                      />
                      <span>
                        <span className="font-semibold">{tv(employee.name)}</span>
                        <span className="mt-1 block text-sm text-primary">{tv(employee.role)}</span>
                        <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                          <WorkingDays employee={employee} />
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {step === 3 && (
              <section>
                <h2 className="text-xl font-semibold">{t("choose_time")}</h2>
                <div className="mt-5 grid gap-2 overflow-x-auto pb-2 [grid-template-columns:repeat(14,minmax(88px,1fr))]">
                  {availability.map(({ date, available }) => (
                    <button
                      type="button"
                      key={date}
                      disabled={!available}
                      onClick={() => setDraft((value) => ({ ...value, date, time: "" }))}
                      aria-label={`${formatLongDate(date, lang)} · ${available ? t("available") : t("unavailable")}`}
                      className={cn(
                        "min-h-20 rounded-xl border px-3 py-2 text-center text-sm transition",
                        draft.date === date
                          ? "border-primary bg-primary text-primary-foreground"
                          : available
                            ? "bg-card hover:border-primary/40"
                            : "cursor-not-allowed bg-muted/50 text-muted-foreground opacity-60",
                      )}
                    >
                      <span className="block text-xs opacity-75">
                        {formatDate(date, lang, { weekday: "short" })}
                      </span>
                      <span className="mt-1 block font-semibold">
                        {formatDate(date, lang, {
                          weekday: undefined,
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                      {!available && (
                        <span className="mt-1 block text-[10px] font-medium">
                          {t("unavailable")}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {draft.date && (
                  <div className="mt-6">
                    <p className="mb-3 text-sm font-semibold">{formatLongDate(draft.date, lang)}</p>
                    {slots.length ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                        {slots.map((time) => (
                          <button
                            type="button"
                            key={time}
                            onClick={() => setDraft((value) => ({ ...value, time }))}
                            className={cn(
                              "min-h-11 rounded-lg border px-2 text-sm font-medium",
                              draft.time === time
                                ? "border-primary bg-primary text-primary-foreground"
                                : "bg-card hover:border-primary/50",
                            )}
                          >
                            {formatTime(time, lang)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed p-7 text-center text-sm text-muted-foreground">
                        {t("no_slots")}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {step === 4 && selectedService && (
              <section>
                <h2 className="text-xl font-semibold">{t("review_appointment")}</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    [t("service"), tv(selectedService.name)],
                    [
                      t("professional"),
                      selectedEmployee ? tv(selectedEmployee.name) : t("any_professional"),
                    ],
                    [t("date"), formatLongDate(draft.date, lang)],
                    [
                      t("time"),
                      `${formatTime(draft.time, lang)} · ${selectedService.duration} ${t("minutes")}`,
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-muted/60 p-4">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 font-medium">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 max-w-md">
                  <Label htmlFor="customer-name">{t("your_name")}</Label>
                  <Input
                    id="customer-name"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((value) => ({ ...value, name: event.target.value }))
                    }
                    className="mt-2 min-h-11"
                    autoComplete="name"
                  />
                </div>
              </section>
            )}

            {step === 5 && (
              <section className="mx-auto max-w-md py-4 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-7 w-7" />
                </span>
                <h2 className="mt-4 text-xl font-semibold">{t("phone_number")}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{t("phone_hint")}</p>
                <Label htmlFor="phone" className="sr-only">
                  {t("phone_number")}
                </Label>
                <Input
                  id="phone"
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="tel"
                  value={draft.phone}
                  onChange={(event) =>
                    setDraft((value) => ({ ...value, phone: event.target.value }))
                  }
                  placeholder="03 123 456"
                  className="mt-5 min-h-12 text-center text-lg tracking-wide"
                />
              </section>
            )}

            {step === 6 && (
              <section className="mx-auto max-w-md py-4 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gold/15 text-gold-foreground">
                  <ShieldCheck className="h-7 w-7" />
                </span>
                <h2 className="mt-4 text-xl font-semibold">{t("verify_number")}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("code_sent_to")}{" "}
                  <span dir="ltr" className="font-medium text-foreground">
                    {draft.phone}
                  </span>
                </p>
                <div className="mt-5 rounded-xl border border-gold/40 bg-gold/10 p-4">
                  <p className="text-xs text-muted-foreground">{t("demo_code_is")}</p>
                  <p dir="ltr" className="mt-1 text-2xl font-bold tracking-[0.3em]">
                    {DEMO_OTP}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{t("demo_code_note")}</p>
                </div>
                <Label htmlFor="otp" className="sr-only">
                  {t("verify_number")}
                </Label>
                <Input
                  id="otp"
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="mt-5 min-h-12 text-center text-xl tracking-[0.4em]"
                />
              </section>
            )}

            {error && (
              <p
                role="alert"
                className="mt-5 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <div className="mt-7 flex items-center justify-between gap-3 border-t pt-5">
              <Button
                variant="ghost"
                onClick={() =>
                  step === 1
                    ? window.location.assign(appPath(`/customer/${tenantId}`))
                    : setStep((value) => Math.max(1, value - 1))
                }
                className="min-h-11"
              >
                <ArrowLeft className="flip-rtl h-4 w-4" />
                {t("back")}
              </Button>
              {step < 6 ? (
                <Button onClick={goNext} className="min-h-11 px-6">
                  {step === 5 ? t("send_code") : t("next")}
                  <ArrowRight className="flip-rtl h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={submit} className="min-h-11 px-6">
                  <CheckCircle2 className="h-4 w-4" />
                  {t("verify_and_submit")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function AppointmentCard({
  appointment,
  employee,
  service,
  onCancel,
  onAccept,
}: {
  appointment: Appointment;
  employee?: Employee;
  service?: Service;
  onCancel: () => void;
  onAccept: () => void;
}) {
  const { t, tv, lang } = useI18n();
  const today = beirutDate();
  const cancellable =
    appointment.date >= today && ["pending", "approved", "proposed"].includes(appointment.status);
  return (
    <Card className="shadow-card">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{service ? tv(service.name) : t("service")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatLongDate(appointment.date, lang)} · {formatTime(appointment.time, lang)}
            </p>
          </div>
          <StatusBadge status={appointment.status} long />
        </div>
        <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <p className="flex items-center gap-2">
            <UserRound className="h-4 w-4" />
            {employee ? tv(employee.name) : t("any_professional")}
          </p>
          <p className="flex items-center gap-2">
            <Clock3 className="h-4 w-4" />
            {service?.duration ?? 30} {t("minutes")}
          </p>
        </div>
        {appointment.status === "proposed" &&
          appointment.proposedDate &&
          appointment.proposedTime && (
            <div className="mt-4 rounded-xl border border-info/30 bg-info/5 p-4">
              <p className="text-xs font-semibold text-info">{t("proposed_time")}</p>
              <p className="mt-1 text-sm font-medium">
                {formatLongDate(appointment.proposedDate, lang)} ·{" "}
                {formatTime(appointment.proposedTime, lang)}
              </p>
              <Button size="sm" onClick={onAccept} className="mt-3">
                {t("accept_new_time")}
              </Button>
            </div>
          )}
        {cancellable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="mt-4 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {t("cancel_appointment")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function CustomerAppointmentsPage({ tenantId }: { tenantId: string }) {
  const { t, tv, dir } = useI18n();
  const { salon, appointments, employees, services, state, signIn, signOut, decideBooking } =
    useTenant(tenantId);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [error, setError] = useState("");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const customerAppointments = appointments
    .filter((item) => item.phone === state.customerPhone)
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  const today = beirutDate();
  const groups = [
    {
      key: "pending",
      title: t("pending_tab"),
      items: customerAppointments.filter((item) => ["pending", "proposed"].includes(item.status)),
    },
    {
      key: "upcoming",
      title: t("upcoming"),
      items: customerAppointments.filter(
        (item) => item.status === "approved" && item.date >= today,
      ),
    },
    {
      key: "past",
      title: t("past"),
      items: customerAppointments.filter(
        (item) =>
          ["completed", "rejected", "cancelled"].includes(item.status) ||
          (item.status === "approved" && item.date < today),
      ),
    },
  ];
  const demoPhones = [...new Set(appointments.map((item) => item.phone))].slice(0, 3);

  const verify = () => {
    setError("");
    if (stage === "phone") {
      const normalized = normalizeLebanesePhone(phone);
      if (!normalized) return setError(t("invalid_phone"));
      setPhone(normalized);
      setStage("otp");
      return;
    }
    if (otp !== DEMO_OTP) return setError(t("wrong_code"));
    const found = appointments.find((item) => item.phone === phone);
    signIn(phone, found?.customerName ?? (dir === "rtl" ? "ضيف تجريبي" : "Demo Guest"));
  };

  return (
    <div className="min-h-screen bg-background">
      <CustomerHeader
        tenantId={tenantId}
        action={
          <Button asChild variant="ghost" size="sm">
            <a href={appPath(`/customer/${tenantId}`)}>{t("back")}</a>
          </Button>
        }
      />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-primary">{tv(salon.name)}</p>
            <h1 className="mt-1 text-3xl font-semibold">{t("my_appointments")}</h1>
          </div>
          {state.customerPhone && (
            <Button variant="outline" onClick={signOut}>
              {t("sign_out")}
            </Button>
          )}
        </div>
        {!state.customerPhone ? (
          <Card className="mx-auto mt-8 max-w-lg shadow-card">
            <CardContent className="p-6 sm:p-8">
              <div className="text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-7 w-7" />
                </span>
                <h2 className="mt-4 text-xl font-semibold">
                  {stage === "phone" ? t("sign_in_phone") : t("verify_number")}
                </h2>
              </div>
              {stage === "phone" ? (
                <>
                  <Label htmlFor="lookup-phone" className="sr-only">
                    {t("phone_number")}
                  </Label>
                  <Input
                    id="lookup-phone"
                    dir="ltr"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="03 448 210"
                    className="mt-5 min-h-12 text-center"
                  />
                  <div className="mt-5 rounded-xl bg-muted/60 p-4 text-sm">
                    <p className="text-muted-foreground">{t("demo_customer_hint")}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {demoPhones.map((item) => (
                        <button
                          key={item}
                          type="button"
                          dir="ltr"
                          onClick={() => setPhone(item)}
                          className="rounded-full border bg-card px-3 py-1.5 text-xs hover:border-primary"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-5 rounded-xl border border-gold/40 bg-gold/10 p-4 text-center">
                    <p className="text-xs text-muted-foreground">{t("demo_code_is")}</p>
                    <p dir="ltr" className="mt-1 text-2xl font-bold tracking-[0.3em]">
                      {DEMO_OTP}
                    </p>
                  </div>
                  <Input
                    aria-label={t("verify_number")}
                    dir="ltr"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                    className="mt-4 min-h-12 text-center text-xl tracking-[0.4em]"
                  />
                </>
              )}
              {error && (
                <p role="alert" className="mt-4 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button onClick={verify} className="mt-5 min-h-11 w-full">
                {stage === "phone" ? t("send_code") : t("verify_number")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 space-y-9">
            <div className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div>
                <p className="font-medium">{state.customerName}</p>
                <p dir="ltr" className="text-muted-foreground">
                  {state.customerPhone}
                </p>
              </div>
            </div>
            {groups.map((group) => (
              <section key={group.key}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{group.title}</h2>
                  <Badge variant="secondary">{group.items.length}</Badge>
                </div>
                {group.items.length ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {group.items.map((appointment) => (
                      <AppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        employee={employees.find((item) => item.id === appointment.employeeId)}
                        service={services.find((item) => item.id === appointment.serviceId)}
                        onCancel={() => setCancelId(appointment.id)}
                        onAccept={() => {
                          const result = decideBooking(appointment.id, { type: "accept_proposal" });
                          if (result.ok) toast.success(t("new_time_accepted"));
                          else toast.error(t("slot_taken"));
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-7 text-center text-sm text-muted-foreground">
                    {t("no_appointments")}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </main>
      <AlertDialog open={Boolean(cancelId)} onOpenChange={(open) => !open && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cancel_appointment")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cancel_confirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("back")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cancelId) {
                  decideBooking(cancelId, { type: "cancel" });
                  toast.success(t("appointment_cancelled"));
                }
                setCancelId(null);
              }}
            >
              {t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
