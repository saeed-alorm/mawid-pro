import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  RotateCcw,
  Scissors,
  Search,
  Settings,
  TrendingUp,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState, LangToggle, ResetDemoButton, StatusBadge, Wordmark } from "@/components/mawid";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  Appointment,
  BookingStatus,
  DayShift,
  Employee,
  Service,
  TimeOff,
  WeekSchedule,
} from "@/lib/demo-data";
import { addDays, beirutDate, iso } from "@/lib/demo-data";
import { getOverviewMetrics } from "@/lib/analytics";
import { formatDate, formatLongDate, formatNumber, formatRelative, formatTime } from "@/lib/format";
import { DAY_KEYS, useI18n } from "@/lib/i18n";
import { appPath } from "@/lib/navigation";
import { availableSlots, nextDays } from "@/lib/scheduling";
import { useDemo } from "@/lib/store";
import { cn } from "@/lib/utils";

export type ManageSection =
  "overview" | "bookings" | "calendar" | "team" | "customers" | "analytics" | "settings";

const sectionItems: Array<{
  id: ManageSection;
  icon: ComponentType<{ className?: string }>;
  label: string;
}> = [
  { id: "overview", icon: LayoutDashboard, label: "overview" },
  { id: "bookings", icon: CalendarDays, label: "bookings" },
  { id: "calendar", icon: CalendarRange, label: "calendar" },
  { id: "team", icon: UsersRound, label: "team" },
  { id: "customers", icon: UserRound, label: "customers" },
  { id: "analytics", icon: BarChart3, label: "analytics" },
  { id: "settings", icon: Settings, label: "settings" },
];

function useManagementTenant(tenantId: string) {
  const demo = useDemo();
  useEffect(() => {
    if (demo.state.tenantId !== tenantId && demo.salons.some((item) => item.id === tenantId)) {
      demo.setTenant(tenantId);
    }
  }, [demo, tenantId]);
  return demo;
}

function NavLink({
  tenantId,
  section,
  current,
  mobile,
}: {
  tenantId: string;
  section: (typeof sectionItems)[number];
  current: ManageSection;
  mobile?: boolean;
}) {
  const { t } = useI18n();
  const Icon = section.icon;
  const active = current === section.id;
  return (
    <a
      href={appPath(`/manage/${tenantId}/${section.id}`)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
        mobile
          ? "flex-1 flex-col justify-center gap-1 rounded-none px-1 py-2 text-[10px]"
          : "w-full",
        active
          ? mobile
            ? "text-primary"
            : "bg-sidebar-accent text-sidebar-accent-foreground"
          : mobile
            ? "text-muted-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{t(section.label)}</span>
    </a>
  );
}

function ManagementShell({
  tenantId,
  section,
  children,
}: {
  tenantId: string;
  section: ManageSection;
  children: ReactNode;
}) {
  const { t, tv, dir } = useI18n();
  const { salon, salons, setTenant } = useManagementTenant(tenantId);
  const mobileMain = sectionItems.slice(0, 4);
  const mobileMore = sectionItems.slice(4);
  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[244px_1fr]">
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-[244px] flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-20 items-center border-b border-sidebar-border px-5">
          <Wordmark className="text-sidebar-foreground" />
        </div>
        <div className="px-4 py-5">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/50">
            {dir === "rtl" ? "مساحة العمل" : "Private workspace"}
          </p>
          <button
            type="button"
            onClick={() => window.location.assign(appPath("/"))}
            className="mt-2 flex w-full items-center gap-3 rounded-xl bg-sidebar-accent/70 p-3 text-start"
          >
            <span className="grid h-10 min-w-10 place-items-center rounded-lg bg-sidebar-primary px-2 text-xs font-bold text-sidebar-primary-foreground">
              {salon.initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{tv(salon.name)}</span>
              <span className="block truncate text-xs text-sidebar-foreground/55">
                {t("switch_workspace")}
              </span>
            </span>
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {sectionItems.map((item) => (
            <NavLink key={item.id} tenantId={tenantId} section={item} current={section} />
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <a
            href={appPath(`/customer/${tenantId}`)}
            className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent"
          >
            <Scissors className="h-4 w-4" />
            {t("view_customer")}
          </a>
        </div>
      </aside>

      <div className="min-w-0 md:col-start-2">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 md:hidden">
              <span className="grid h-9 min-w-9 place-items-center rounded-lg bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {salon.initials}
              </span>
              <span className="truncate text-sm font-semibold">{tv(salon.name)}</span>
            </div>
            <div className="hidden md:block">
              <p className="text-sm text-muted-foreground">{t("dashboard")}</p>
              <p className="font-semibold">{t(section)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={tenantId}
                onValueChange={(value) => {
                  setTenant(value);
                  window.location.assign(appPath(`/manage/${value}/${section}`));
                }}
              >
                <SelectTrigger aria-label={t("switch_workspace")} className="hidden w-44 sm:flex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {salons.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {tv(item.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <LangToggle compact />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1480px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 flex min-h-[68px] items-stretch border-t bg-card md:hidden">
        {mobileMain.map((item) => (
          <NavLink key={item.id} tenantId={tenantId} section={item} current={section} mobile />
        ))}
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px]",
                mobileMore.some((item) => item.id === section)
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              <Menu className="h-5 w-5" />
              {dir === "rtl" ? "المزيد" : "More"}
            </button>
          </SheetTrigger>
          <SheetContent side={dir === "rtl" ? "left" : "right"} className="w-[86vw] max-w-sm p-5">
            <SheetHeader className="text-start">
              <SheetTitle>{t("dashboard")}</SheetTitle>
              <SheetDescription>{tv(salon.name)}</SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-2">
              {mobileMore.map((item) => (
                <a
                  key={item.id}
                  href={appPath(`/manage/${tenantId}/${item.id}`)}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-xl px-4",
                    item.id === section ? "bg-primary text-primary-foreground" : "bg-muted/60",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {t(item.label)}
                </a>
              ))}
              <a
                href={appPath(`/customer/${tenantId}`)}
                className="flex min-h-12 items-center gap-3 rounded-xl px-4 text-muted-foreground"
              >
                <Scissors className="h-5 w-5" />
                {t("view_customer")}
              </a>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function ChartFrame({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="h-64 pt-3" dir="ltr">
        {children}
      </CardContent>
    </Card>
  );
}

function makeTrend(appointments: Appointment[], lang: "en" | "ar") {
  const today = new Date(`${beirutDate()}T12:00:00`);
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = iso(addDays(today, index - 3));
    return {
      date: formatDate(date, lang, { weekday: "short", day: undefined, month: undefined }),
      bookings: appointments.filter(
        (item) => item.date === date && !["rejected", "cancelled"].includes(item.status),
      ).length,
    };
  });
}

function makePeakHours(appointments: Appointment[], lang: "en" | "ar") {
  return ["09:00", "11:00", "13:00", "15:00", "17:00", "19:00"].map((hour) => ({
    hour: formatTime(hour, lang),
    bookings: appointments.filter(
      (item) => Math.abs(Number(item.time.slice(0, 2)) - Number(hour.slice(0, 2))) <= 1,
    ).length,
  }));
}

function teamStats(
  employees: Employee[],
  appointments: Appointment[],
  services: Service[],
  tv: (value: { en: string; ar: string } | undefined) => string,
) {
  return employees.map((employee) => {
    const items = appointments.filter((item) => item.employeeId === employee.id);
    const minutes = items
      .filter((item) => ["approved", "completed"].includes(item.status))
      .reduce(
        (total, item) =>
          total + (services.find((service) => service.id === item.serviceId)?.duration ?? 30),
        0,
      );
    const capacity = employee.schedule.reduce(
      (total, shift) =>
        !shift
          ? total
          : total +
            (Number(shift.end.slice(0, 2)) * 60 +
              Number(shift.end.slice(3)) -
              (Number(shift.start.slice(0, 2)) * 60 + Number(shift.start.slice(3)))),
      0,
    );
    return {
      id: employee.id,
      name: tv(employee.name),
      bookings: items.length,
      completed: items.filter((item) => item.status === "completed").length,
      cancelled: items.filter((item) => item.status === "cancelled").length,
      utilization: capacity ? Math.min(100, Math.round((minutes / capacity) * 100)) : 0,
    };
  });
}

function OverviewPage({ tenantId }: { tenantId: string }) {
  const { t, tv, lang, dir } = useI18n();
  const { salon, employees, services, appointments } = useManagementTenant(tenantId);
  const today = beirutDate();
  const metrics = getOverviewMetrics(appointments, employees, services, today);
  const trend = makeTrend(appointments, lang);
  const peak = makePeakHours(appointments, lang);
  const team = teamStats(employees, appointments, services, tv);
  const recent = [...appointments]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
  const kpis = [
    {
      label: t("today_bookings"),
      value: metrics.todayBookings,
      icon: CalendarDays,
      tone: "text-primary bg-primary/10",
    },
    {
      label: t("pending_requests"),
      value: metrics.pendingRequests,
      icon: AlertCircle,
      tone: "text-warning-foreground bg-warning/20",
    },
    {
      label: t("weekly_bookings"),
      value: metrics.weeklyBookings,
      icon: TrendingUp,
      tone: "text-info bg-info/10",
    },
    {
      label: t("cancellation_rate"),
      value: `${metrics.cancellationRate}%`,
      icon: RotateCcw,
      tone: "text-destructive bg-destructive/10",
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow={tv(salon.name)}
        title={dir === "rtl" ? "نهارك في لمحة" : "Your day at a glance"}
        description={
          dir === "rtl"
            ? "أرقام تشغيلية مستخرجة مباشرة من بيانات الحجوزات والجداول التجريبية."
            : "Operational figures derived directly from the demo booking and schedule data."
        }
        action={
          <Button asChild>
            <a href={appPath(`/manage/${tenantId}/bookings`)}>
              {t("pending_requests")}
              <ArrowRight className="flip-rtl" />
            </a>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="shadow-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <span className={cn("grid h-9 w-9 place-items-center rounded-xl", kpi.tone)}>
                  <kpi.icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-5 text-3xl font-semibold">
                {typeof kpi.value === "number" ? formatNumber(kpi.value, lang) : kpi.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">{t("returning_customers")}</p>
            <p className="mt-3 text-2xl font-semibold">
              {formatNumber(metrics.returningCustomers, lang)}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">{t("employee_utilization")}</p>
            <p className="mt-3 text-2xl font-semibold">{metrics.utilization}%</p>
            <Progress value={metrics.utilization} className="mt-3 h-1.5" />
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">{t("peak_hours")}</p>
            <p className="mt-3 text-2xl font-semibold">
              {metrics.peakHour === "—" ? "—" : formatTime(metrics.peakHour, lang)}
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ChartFrame title={t("weekly_trend")}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ left: -20, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="bookings"
                stroke="var(--primary)"
                fill="url(#trendFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartFrame>
        <ChartFrame title={t("peak_hours")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={peak} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="hour"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <Tooltip />
              <Bar dataKey="bookings" fill="var(--gold)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">{t("team_performance")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {team.map((item) => (
              <div key={item.id}>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground">{item.utilization}%</span>
                </div>
                <Progress value={item.utilization} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{t("recent_activity")}</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <a href={appPath(`/manage/${tenantId}/bookings`)}>{t("view_all")}</a>
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {recent.map((item) => {
              const service = services.find((serviceItem) => serviceItem.id === item.serviceId);
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() =>
                    window.location.assign(
                      appPath(`/manage/${tenantId}/bookings?booking=${item.id}`),
                    )
                  }
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-start hover:bg-muted/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {item.customerName} · {service ? tv(service.name) : t("service")}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatRelative(item.createdAt, lang)}
                    </span>
                  </span>
                  <StatusBadge status={item.status} />
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function BookingDetails({
  booking,
  employee,
  service,
  onClose,
}: {
  booking: Appointment | null;
  employee?: Employee;
  service?: Service;
  onClose: () => void;
}) {
  const { t, tv, lang } = useI18n();
  return (
    <Dialog open={Boolean(booking)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {booking && (
          <>
            <DialogHeader className="text-start">
              <DialogTitle>{t("booking_details")}</DialogTitle>
              <DialogDescription>{booking.id}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [t("customer"), booking.customerName],
                [t("phone"), booking.phone],
                [t("service"), service ? tv(service.name) : "—"],
                [t("professional"), employee ? tv(employee.name) : t("any_professional")],
                [t("date"), formatLongDate(booking.date, lang)],
                [t("time"), formatTime(booking.time, lang)],
                [t("requested_at"), formatRelative(booking.createdAt, lang)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-muted/60 p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-sm font-medium">{value}</p>
                </div>
              ))}
            </div>
            <StatusBadge status={booking.status} long />
            {booking.proposedDate && booking.proposedTime && (
              <div className="rounded-xl border border-info/30 bg-info/5 p-4">
                <p className="text-xs font-semibold text-info">{t("proposed_time")}</p>
                <p className="mt-1 text-sm">
                  {formatLongDate(booking.proposedDate, lang)} ·{" "}
                  {formatTime(booking.proposedTime, lang)}
                </p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BookingsPage({ tenantId }: { tenantId: string }) {
  const { t, tv, lang, dir } = useI18n();
  const { appointments, employees, services, decideBooking } = useManagementTenant(tenantId);
  const [status, setStatus] = useState<string>("pending");
  const [query, setQuery] = useState("");
  const [details, setDetails] = useState<Appointment | null>(null);
  const [rejecting, setRejecting] = useState<Appointment | null>(null);
  const [acting, setActing] = useState<Appointment | null>(null);
  const [actionType, setActionType] = useState<"approve" | "propose">("approve");
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(nextDays(2)[1]);
  const [time, setTime] = useState("");
  const filtered = appointments
    .filter(
      (item) =>
        (status === "all" || item.status === status) &&
        `${item.customerName} ${item.phone}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const actionService = acting ? services.find((item) => item.id === acting.serviceId) : undefined;
  const eligible = actionService
    ? employees.filter((item) => item.active && item.serviceIds.includes(actionService.id))
    : [];
  const actionEmployee = eligible.find((item) => item.id === employeeId);
  const actionSlots =
    actionEmployee && actionService && date
      ? availableSlots(actionEmployee, actionService, date, appointments, services)
      : [];
  const openAction = (booking: Appointment, type: "approve" | "propose") => {
    setActing(booking);
    setActionType(type);
    setEmployeeId(booking.employeeId === "any" ? "" : booking.employeeId);
    setDate(type === "propose" ? nextDays(2)[1] : booking.date);
    setTime(type === "approve" ? booking.time : "");
  };
  const submitAction = () => {
    if (!acting) return;
    const result =
      actionType === "approve"
        ? decideBooking(acting.id, { type: "approve", employeeId: employeeId || undefined })
        : decideBooking(acting.id, {
            type: "propose",
            employeeId: employeeId || undefined,
            date,
            time,
          });
    if (!result.ok) {
      toast.error(
        result.reason === "employee_required"
          ? dir === "rtl"
            ? "اختر موظفاً لهذا الطلب."
            : "Choose a team member for this request."
          : t("slot_taken"),
      );
      return;
    }
    toast.success(actionType === "approve" ? t("approved_toast") : t("proposed_toast"));
    setActing(null);
  };
  return (
    <>
      <PageHeading
        title={t("bookings")}
        description={
          dir === "rtl"
            ? "راجع الطلبات واتخذ القرار، وستنعكس النتيجة فوراً في تجربة العميل والتقويم."
            : "Review requests and act; every decision immediately updates the customer view and calendar."
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search")}
            className="min-h-11 ps-10"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="min-h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_statuses")}</SelectItem>
            {(
              [
                "pending",
                "approved",
                "proposed",
                "completed",
                "cancelled",
                "rejected",
              ] as BookingStatus[]
            ).map((item) => (
              <SelectItem key={item} value={item}>
                {t(`status_${item}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {filtered.length ? (
        <div className="space-y-3">
          {filtered.map((booking) => {
            const employee = employees.find((item) => item.id === booking.employeeId);
            const service = services.find((item) => item.id === booking.serviceId);
            return (
              <Card key={booking.id} className="shadow-card">
                <CardContent className="p-5">
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="grid gap-4 sm:grid-cols-[1.1fr_1fr_1fr]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{booking.customerName}</p>
                          <StatusBadge status={booking.status} />
                        </div>
                        <p dir="ltr" className="mt-1 w-fit text-sm text-muted-foreground">
                          {booking.phone}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {formatRelative(booking.createdAt, lang)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t("service")}</p>
                        <p className="mt-1 text-sm font-medium">
                          {service ? tv(service.name) : "—"}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {employee ? tv(employee.name) : t("any_professional")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t("date")}</p>
                        <p className="mt-1 text-sm font-medium">
                          {formatLongDate(booking.date, lang)}
                        </p>
                        <p className="mt-1 text-sm text-primary">
                          {formatTime(booking.time, lang)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button variant="outline" size="sm" onClick={() => setDetails(booking)}>
                        {t("details")}
                      </Button>
                      {booking.status === "pending" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRejecting(booking)}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            {t("reject")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAction(booking, "propose")}
                          >
                            {t("propose_time")}
                          </Button>
                          <Button size="sm" onClick={() => openAction(booking, "approve")}>
                            <Check className="h-4 w-4" />
                            {t("approve")}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<CalendarDays className="h-7 w-7" />}
          title={status === "pending" ? t("no_pending") : t("no_bookings_day")}
          description={status === "pending" ? t("all_caught_up") : undefined}
        />
      )}
      <BookingDetails
        booking={details}
        employee={details ? employees.find((item) => item.id === details.employeeId) : undefined}
        service={details ? services.find((item) => item.id === details.serviceId) : undefined}
        onClose={() => setDetails(null)}
      />
      <Dialog open={Boolean(acting)} onOpenChange={(open) => !open && setActing(null)}>
        <DialogContent>
          <DialogHeader className="text-start">
            <DialogTitle>{actionType === "approve" ? t("approve") : t("propose_time")}</DialogTitle>
            <DialogDescription>
              {acting?.customerName} · {actionService ? tv(actionService.name) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("professional")}</Label>
              <Select
                value={employeeId}
                onValueChange={(value) => {
                  setEmployeeId(value);
                  setTime("");
                }}
              >
                <SelectTrigger className="mt-2 min-h-11">
                  <SelectValue placeholder={t("choose_employee")} />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {tv(employee.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {actionType === "propose" && (
              <>
                <div>
                  <Label>{t("date")}</Label>
                  <div className="mt-2 grid grid-cols-4 gap-2 overflow-x-auto">
                    {nextDays(8).map((item) => (
                      <button
                        type="button"
                        key={item}
                        onClick={() => {
                          setDate(item);
                          setTime("");
                        }}
                        className={cn(
                          "min-h-14 rounded-lg border px-2 text-xs",
                          date === item && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {formatDate(item, lang)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>{t("time")}</Label>
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {actionSlots.map((item) => (
                      <button
                        type="button"
                        key={item}
                        onClick={() => setTime(item)}
                        className={cn(
                          "min-h-10 rounded-lg border text-sm",
                          time === item && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {formatTime(item, lang)}
                      </button>
                    ))}
                  </div>
                  {employeeId && !actionSlots.length && (
                    <p className="mt-2 text-sm text-muted-foreground">{t("no_slots")}</p>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActing(null)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={submitAction}
              disabled={!employeeId || (actionType === "propose" && !time)}
            >
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(rejecting)} onOpenChange={(open) => !open && setRejecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("reject")}</AlertDialogTitle>
            <AlertDialogDescription>{t("reject_confirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (rejecting) {
                  decideBooking(rejecting.id, { type: "reject" });
                  toast.success(t("rejected_toast"));
                }
                setRejecting(null);
              }}
            >
              {t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CalendarPage({ tenantId }: { tenantId: string }) {
  const { t, tv, lang, dir } = useI18n();
  const { appointments, employees, services } = useManagementTenant(tenantId);
  const [view, setView] = useState<"day" | "week">("day");
  const [date, setDate] = useState(beirutDate());
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [details, setDetails] = useState<Appointment | null>(null);
  const base = new Date(`${date}T00:00:00`);
  const dateList =
    view === "day"
      ? [date]
      : Array.from({ length: 7 }, (_, index) =>
          iso(addDays(base, index - ((base.getDay() + 6) % 7))),
        );
  const visibleEmployees = employees.filter(
    (item) => employeeFilter === "all" || item.id === employeeFilter,
  );
  const visibleAppointments = appointments.filter(
    (item) =>
      dateList.includes(item.date) &&
      (employeeFilter === "all" || item.employeeId === employeeFilter) &&
      (statusFilter === "all" || item.status === statusFilter) &&
      item.status !== "rejected",
  );
  const move = (amount: number) => setDate(iso(addDays(base, amount * (view === "day" ? 1 : 7))));
  return (
    <>
      <PageHeading
        title={t("calendar")}
        description={
          dir === "rtl"
            ? "اعرض المواعيد حسب الموظف وافتح التفاصيل من أي بطاقة."
            : "View appointments by team member and open details from any card."
        }
      />
      <div className="mb-5 grid gap-3 lg:grid-cols-[auto_1fr_200px_190px] lg:items-center">
        <div className="inline-flex h-11 rounded-xl bg-muted p-1">
          <button
            type="button"
            onClick={() => setView("day")}
            className={cn(
              "min-w-20 rounded-lg px-3 text-sm font-medium",
              view === "day" && "bg-card shadow-sm",
            )}
          >
            {t("day")}
          </button>
          <button
            type="button"
            onClick={() => setView("week")}
            className={cn(
              "min-w-20 rounded-lg px-3 text-sm font-medium",
              view === "week" && "bg-card shadow-sm",
            )}
          >
            {t("week")}
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button size="icon" variant="outline" onClick={() => move(-1)} aria-label={t("back")}>
            <ChevronLeft className="flip-rtl" />
          </Button>
          <button
            type="button"
            onClick={() => setDate(beirutDate())}
            className="min-h-11 flex-1 rounded-xl px-3 text-center text-sm font-semibold hover:bg-muted"
          >
            {view === "day"
              ? formatLongDate(date, lang)
              : `${formatDate(dateList[0], lang)} — ${formatDate(dateList[6], lang)}`}
          </button>
          <Button size="icon" variant="outline" onClick={() => move(1)} aria-label={t("next")}>
            <ChevronRight className="flip-rtl" />
          </Button>
        </div>
        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
          <SelectTrigger className="min-h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_employees")}</SelectItem>
            {employees.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {tv(item.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="min-h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_statuses")}</SelectItem>
            {(["pending", "approved", "proposed", "completed", "cancelled"] as BookingStatus[]).map(
              (item) => (
                <SelectItem key={item} value={item}>
                  {t(`status_${item}`)}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto pb-3">
        <div
          className="grid min-w-[760px] gap-4"
          style={{
            gridTemplateColumns: `repeat(${visibleEmployees.length || 1}, minmax(270px, 1fr))`,
          }}
        >
          {visibleEmployees.map((employee) => {
            const items = visibleAppointments
              .filter((item) => item.employeeId === employee.id)
              .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
            return (
              <section key={employee.id} className="rounded-2xl border bg-card shadow-card">
                <div className="flex items-center gap-3 border-b p-4">
                  <img
                    src={employee.photo}
                    alt={tv(employee.name)}
                    className="h-10 w-10 rounded-xl object-cover"
                  />
                  <div>
                    <h2 className="text-sm font-semibold">{tv(employee.name)}</h2>
                    <p className="text-xs text-muted-foreground">{tv(employee.role)}</p>
                  </div>
                </div>
                <div className="min-h-96 space-y-4 p-3">
                  {dateList.map((day) => {
                    const dayItems = items.filter((item) => item.date === day);
                    return (
                      <div key={day}>
                        <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">
                          {formatDate(day, lang)}
                        </p>
                        {dayItems.length ? (
                          <div className="space-y-2">
                            {dayItems.map((item) => {
                              const service = services.find(
                                (serviceItem) => serviceItem.id === item.serviceId,
                              );
                              return (
                                <button
                                  type="button"
                                  key={item.id}
                                  onClick={() => setDetails(item)}
                                  className={cn(
                                    "w-full rounded-xl border p-3 text-start transition hover:shadow-sm",
                                    item.status === "approved" && "border-success/35 bg-success/5",
                                    item.status === "pending" && "border-warning/40 bg-warning/10",
                                    item.status === "proposed" && "border-info/35 bg-info/5",
                                    item.status === "completed" && "border-primary/25 bg-primary/5",
                                    item.status === "cancelled" && "bg-muted/60 opacity-65",
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <span className="text-sm font-semibold">
                                      {formatTime(item.time, lang)}
                                    </span>
                                    <StatusBadge status={item.status} />
                                  </div>
                                  <p className="mt-2 text-sm font-medium">{item.customerName}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {service ? tv(service.name) : "—"}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                            {t("no_bookings_day")}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <BookingDetails
        booking={details}
        employee={details ? employees.find((item) => item.id === details.employeeId) : undefined}
        service={details ? services.find((item) => item.id === details.serviceId) : undefined}
        onClose={() => setDetails(null)}
      />
    </>
  );
}

function TeamPage({ tenantId }: { tenantId: string }) {
  const { t, tv, lang, dir } = useI18n();
  const { employees, appointments, services } = useManagementTenant(tenantId);
  const stats = teamStats(employees, appointments, services, tv);
  return (
    <>
      <PageHeading
        title={t("team_directory")}
        description={
          dir === "rtl"
            ? "الملفات والجداول ومؤشرات الأداء محسوبة من بيانات العمل التجريبية."
            : "Profiles, schedules and performance indicators computed from local demo data."
        }
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {employees.map((employee) => {
          const itemStats = stats.find((item) => item.id === employee.id)!;
          return (
            <Card key={employee.id} className="overflow-hidden py-0 shadow-card">
              <div className="relative h-52">
                <img
                  src={employee.photo}
                  alt={tv(employee.name)}
                  className="h-full w-full object-cover"
                />
                <Badge
                  className={cn(
                    "absolute end-4 top-4",
                    employee.active
                      ? "bg-success text-success-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {employee.active ? t("active") : t("inactive")}
                </Badge>
              </div>
              <CardContent className="p-5">
                <h2 className="text-lg font-semibold">{tv(employee.name)}</h2>
                <p className="mt-1 text-sm font-medium text-primary">{tv(employee.role)}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-3 text-center">
                  <div>
                    <p className="text-lg font-semibold">
                      {formatNumber(itemStats.bookings, lang)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{t("bookings")}</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">
                      {formatNumber(itemStats.completed, lang)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {t("completed_appointments")}
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{itemStats.utilization}%</p>
                    <p className="text-[10px] text-muted-foreground">{t("schedule_utilization")}</p>
                  </div>
                </div>
                <Button asChild variant="outline" className="mt-4 min-h-11 w-full">
                  <a href={appPath(`/manage/${tenantId}/team/${employee.id}`)}>
                    {t("view_profile")}
                    <ArrowRight className="flip-rtl" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function ScheduleEditor({
  employee,
  onSave,
}: {
  employee: Employee;
  onSave: (schedule: WeekSchedule) => void;
}) {
  const { t } = useI18n();
  const [schedule, setSchedule] = useState<WeekSchedule>(() =>
    employee.schedule.map((item) => (item ? { ...item } : null)),
  );
  useEffect(
    () => setSchedule(employee.schedule.map((item) => (item ? { ...item } : null))),
    [employee],
  );
  const toggleDay = (index: number, active: boolean) =>
    setSchedule((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? (active ? (item ?? { start: "09:00", end: "18:00" }) : null) : item,
      ),
    );
  const patchShift = (index: number, patch: Partial<NonNullable<DayShift>>) =>
    setSchedule((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index && item ? { ...item, ...patch } : item,
      ),
    );
  return (
    <div className="space-y-3">
      {schedule.map((shift, index) => (
        <div key={DAY_KEYS[index]} className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{t(DAY_KEYS[index])}</p>
              <p className="text-xs text-muted-foreground">{shift ? t("working") : t("day_off")}</p>
            </div>
            <Switch
              checked={Boolean(shift)}
              onCheckedChange={(active) => toggleDay(index, active)}
              aria-label={`${t(DAY_KEYS[index])} ${t("working")}`}
            />
          </div>
          {shift && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <Label className="text-xs">{t("from")}</Label>
                <Input
                  type="time"
                  value={shift.start}
                  onChange={(event) => patchShift(index, { start: event.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">{t("to")}</Label>
                <Input
                  type="time"
                  value={shift.end}
                  onChange={(event) => patchShift(index, { end: event.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">
                  {t("break_period")} · {t("from")}
                </Label>
                <Input
                  type="time"
                  value={shift.breakStart ?? ""}
                  onChange={(event) =>
                    patchShift(index, { breakStart: event.target.value || undefined })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">
                  {t("break_period")} · {t("to")}
                </Label>
                <Input
                  type="time"
                  value={shift.breakEnd ?? ""}
                  onChange={(event) =>
                    patchShift(index, { breakEnd: event.target.value || undefined })
                  }
                  className="mt-1"
                />
              </div>
            </div>
          )}
        </div>
      ))}
      <Button
        onClick={() => {
          onSave(schedule);
          toast.success(t("saved"));
        }}
      >
        {t("save")}
      </Button>
    </div>
  );
}

export function EmployeeDetailPage({
  tenantId,
  employeeId,
}: {
  tenantId: string;
  employeeId: string;
}) {
  const { t, tv, lang, dir } = useI18n();
  const {
    employees,
    appointments,
    services,
    updateEmployee,
    setEmployeeSchedule,
    addTimeOff,
    removeTimeOff,
  } = useManagementTenant(tenantId);
  const employee = employees.find((item) => item.id === employeeId);
  const [from, setFrom] = useState(beirutDate());
  const [to, setTo] = useState(beirutDate());
  const [reason, setReason] = useState("");
  if (!employee)
    return (
      <ManagementShell tenantId={tenantId} section="team">
        <EmptyState
          title={dir === "rtl" ? "الموظف غير موجود" : "Team member not found"}
          action={
            <Button asChild>
              <a href={appPath(`/manage/${tenantId}/team`)}>{t("back")}</a>
            </Button>
          }
        />
      </ManagementShell>
    );
  const stats = teamStats([employee], appointments, services, tv)[0];
  const employeeAppointments = appointments.filter((item) => item.employeeId === employee.id);
  const repeatCustomers = Object.values(
    employeeAppointments.reduce<Record<string, number>>((result, item) => {
      result[item.phone] = (result[item.phone] ?? 0) + 1;
      return result;
    }, {}),
  ).filter((count) => count > 1).length;
  const trend = makeTrend(employeeAppointments, lang);
  const addBlock = () => {
    if (!from || !to || to < from) {
      toast.error(dir === "rtl" ? "تحقق من التواريخ." : "Check the date range.");
      return;
    }
    const item: TimeOff = {
      id: `off-${Date.now()}`,
      from,
      to,
      reason: { en: reason || "Unavailable", ar: reason || "غير متاح" },
    };
    addTimeOff(employee.id, item);
    setReason("");
    toast.success(t("saved"));
  };
  return (
    <ManagementShell tenantId={tenantId} section="team">
      <div className="mb-6">
        <Button asChild variant="ghost" className="-ms-3">
          <a href={appPath(`/manage/${tenantId}/team`)}>
            <ArrowLeft className="flip-rtl" />
            {t("team_directory")}
          </a>
        </Button>
      </div>
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside>
          <Card className="overflow-hidden py-0 shadow-card">
            <img
              src={employee.photo}
              alt={tv(employee.name)}
              className="h-72 w-full object-cover"
            />
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold">{tv(employee.name)}</h1>
                  <p className="mt-1 text-sm text-primary">{tv(employee.role)}</p>
                </div>
                <Badge variant={employee.active ? "default" : "secondary"}>
                  {employee.active ? t("active") : t("inactive")}
                </Badge>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">{tv(employee.bio)}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {employee.specialties[lang].map((item) => (
                  <Badge key={item} variant="secondary">
                    {item}
                  </Badge>
                ))}
              </div>
              <Button
                variant="outline"
                className="mt-5 w-full"
                onClick={() => {
                  updateEmployee(employee.id, { active: !employee.active });
                  toast.success(t("saved"));
                }}
              >
                {employee.active ? t("set_inactive") : t("set_active")}
              </Button>
            </CardContent>
          </Card>
        </aside>
        <div className="space-y-6">
          <section>
            <h2 className="mb-4 text-xl font-semibold">{t("performance")}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                [t("total_bookings"), stats.bookings],
                [t("completed_appointments"), stats.completed],
                [t("cancelled_appointments"), stats.cancelled],
                [t("schedule_utilization"), `${stats.utilization}%`],
                [t("repeat_customers"), repeatCustomers],
              ].map(([label, value]) => (
                <Card key={String(label)} className="shadow-card">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {typeof value === "number" ? formatNumber(value, lang) : value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="mt-4">
              <ChartFrame title={t("booking_trend")}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ left: -20, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Area
                      dataKey="bookings"
                      type="monotone"
                      stroke="var(--primary)"
                      fill="var(--accent)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartFrame>
            </div>
          </section>
          <section>
            <h2 className="mb-4 text-xl font-semibold">{t("weekly_hours")}</h2>
            <ScheduleEditor
              employee={employee}
              onSave={(schedule) => setEmployeeSchedule(employee.id, schedule)}
            />
          </section>
          <section>
            <h2 className="mb-4 text-xl font-semibold">{t("time_off")}</h2>
            <Card className="shadow-card">
              <CardContent className="p-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>{t("from")}</Label>
                    <Input
                      type="date"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>{t("to")}</Label>
                    <Input
                      type="date"
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>{t("reason")}</Label>
                    <Input
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      className="mt-2"
                    />
                  </div>
                </div>
                <Button onClick={addBlock} className="mt-4">
                  {t("add_time_off")}
                </Button>
                <Separator className="my-5" />
                {employee.timeOff.length ? (
                  <div className="space-y-2">
                    {employee.timeOff.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/60 p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {formatDate(item.from, lang)} — {formatDate(item.to, lang)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">{tv(item.reason)}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTimeOff(employee.id, item.id)}
                          className="text-destructive"
                        >
                          <X className="h-4 w-4" />
                          {t("remove")}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("no_time_off")}</p>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </ManagementShell>
  );
}

function CustomersPage({ tenantId }: { tenantId: string }) {
  const { t, tv, lang, dir } = useI18n();
  const { appointments, services } = useManagementTenant(tenantId);
  const [query, setQuery] = useState("");
  const customers = Object.values(
    appointments.reduce<
      Record<string, { name: string; phone: string; appointments: Appointment[] }>
    >((result, item) => {
      result[item.phone] ??= { name: item.customerName, phone: item.phone, appointments: [] };
      result[item.phone].appointments.push(item);
      return result;
    }, {}),
  )
    .map((customer) => ({
      ...customer,
      last: [...customer.appointments].sort((a, b) =>
        `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`),
      )[0],
    }))
    .filter((customer) =>
      `${customer.name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => b.last.date.localeCompare(a.last.date));
  return (
    <>
      <PageHeading
        title={t("customer_directory")}
        description={
          dir === "rtl"
            ? "سجل عملاء مشتق من الحجوزات المحلية فقط."
            : "A customer history derived exclusively from local booking records."
        }
      />
      <div className="relative mb-5 max-w-xl">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search")}
          className="min-h-11 ps-10"
        />
      </div>
      {customers.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {customers.map((customer) => {
            const lastService = services.find((item) => item.id === customer.last.serviceId);
            const completed = customer.appointments.filter(
              (item) => item.status === "completed",
            ).length;
            return (
              <Card key={customer.phone} className="shadow-card">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
                        {customer.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                      <div>
                        <p className="font-semibold">{customer.name}</p>
                        <p dir="ltr" className="mt-1 w-fit text-sm text-muted-foreground">
                          {customer.phone}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">
                      {formatNumber(customer.appointments.length, lang)} {t("visits")}
                    </Badge>
                  </div>
                  <Separator className="my-4" />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">{t("last_visit")}</p>
                      <p className="mt-1 font-medium">{formatDate(customer.last.date, lang)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {lastService ? tv(lastService.name) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("completed_appointments")}</p>
                      <p className="mt-1 font-medium">{formatNumber(completed, lang)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<UserRound className="h-7 w-7" />} title={t("no_customers")} />
      )}
    </>
  );
}

function AnalyticsPage({ tenantId }: { tenantId: string }) {
  const { t, tv, lang, dir } = useI18n();
  const { appointments, employees, services } = useManagementTenant(tenantId);
  const metrics = getOverviewMetrics(appointments, employees, services, beirutDate());
  const analyticsBase = new Date(`${beirutDate()}T12:00:00`);
  const trend = Array.from({ length: 14 }, (_, index) => {
    const date = iso(addDays(analyticsBase, index - 10));
    return {
      date: formatDate(date, lang, { weekday: undefined, day: "numeric", month: "short" }),
      bookings: appointments.filter(
        (item) => item.date === date && !["cancelled", "rejected"].includes(item.status),
      ).length,
      completed: appointments.filter((item) => item.date === date && item.status === "completed")
        .length,
    };
  });
  const peak = makePeakHours(appointments, lang);
  const team = teamStats(employees, appointments, services, tv);
  return (
    <>
      <PageHeading
        title={t("analytics")}
        description={
          dir === "rtl"
            ? "مؤشرات تشغيلية فقط — لا تقييمات ولا إيرادات غير مدعومة."
            : "Operational indicators only—no unsupported ratings or revenue figures."
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">{t("weekly_bookings")}</p>
            <p className="mt-3 text-3xl font-semibold">
              {formatNumber(metrics.weeklyBookings, lang)}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">{t("returning_customers")}</p>
            <p className="mt-3 text-3xl font-semibold">
              {formatNumber(metrics.returningCustomers, lang)}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">{t("employee_utilization")}</p>
            <p className="mt-3 text-3xl font-semibold">{metrics.utilization}%</p>
          </CardContent>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ChartFrame
          title={t("booking_trend")}
          description={dir === "rtl" ? "آخر ١٤ يوماً" : "Last 14 days"}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ left: -20, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="bookings"
                stroke="var(--primary)"
                fill="var(--accent)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartFrame>
        <ChartFrame title={t("peak_hours")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={peak} layout="vertical" margin={{ left: 8, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
              <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="hour" axisLine={false} tickLine={false} width={65} />
              <Tooltip />
              <Bar dataKey="bookings" fill="var(--gold)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
        <ChartFrame title={t("team_performance")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={team} margin={{ left: -12, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="bookings" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">{t("team_performance")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {team.map((item) => (
              <div key={item.id}>
                <div className="mb-2 flex justify-between gap-3 text-sm">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground">{item.utilization}%</span>
                </div>
                <Progress value={item.utilization} className="h-2" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.completed} {t("completed_appointments")} · {item.cancelled}{" "}
                  {t("cancelled_appointments")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function SettingsPage({ tenantId }: { tenantId: string }) {
  const { t, tv, lang, dir } = useI18n();
  const { salon, updateSalon } = useManagementTenant(tenantId);
  const [name, setName] = useState(salon.name[lang]);
  const [intro, setIntro] = useState(salon.intro[lang]);
  const [address, setAddress] = useState(salon.address[lang]);
  const [hours, setHours] = useState(salon.hours[lang]);
  useEffect(() => {
    setName(salon.name[lang]);
    setIntro(salon.intro[lang]);
    setAddress(salon.address[lang]);
    setHours(salon.hours[lang]);
  }, [lang, salon]);
  const accents = [
    "oklch(0.44 0.093 166)",
    "oklch(0.5 0.07 55)",
    "oklch(0.48 0.09 20)",
    "oklch(0.5 0.08 260)",
  ];
  const save = () => {
    updateSalon(salon.id, {
      name: { ...salon.name, [lang]: name },
      intro: { ...salon.intro, [lang]: intro },
      address: { ...salon.address, [lang]: address },
      hours: { ...salon.hours, [lang]: hours },
    });
    toast.success(t("saved"));
  };
  return (
    <>
      <PageHeading
        title={t("workspace_settings")}
        description={
          dir === "rtl"
            ? "التغييرات محلية وتظهر فوراً في صفحة حجز الصالون."
            : "Changes stay local and appear immediately on the salon booking site."
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">
              {dir === "rtl" ? "ملف الصالون" : "Salon profile"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label htmlFor="salon-name">{t("salon_name")}</Label>
              <Input
                id="salon-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 min-h-11"
              />
            </div>
            <div>
              <Label htmlFor="salon-intro">{t("salon_intro")}</Label>
              <Textarea
                id="salon-intro"
                value={intro}
                onChange={(event) => setIntro(event.target.value)}
                className="mt-2 min-h-28"
              />
            </div>
            <div>
              <Label htmlFor="salon-address">{t("address")}</Label>
              <Input
                id="salon-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="mt-2 min-h-11"
              />
            </div>
            <div>
              <Label htmlFor="salon-hours">{t("opening_hours")}</Label>
              <Input
                id="salon-hours"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                className="mt-2 min-h-11"
              />
            </div>
            <div>
              <Label>{dir === "rtl" ? "لون العلامة" : "Brand accent"}</Label>
              <div className="mt-2 flex flex-wrap gap-3">
                {accents.map((accent) => (
                  <button
                    type="button"
                    key={accent}
                    aria-label={dir === "rtl" ? "اختيار اللون" : "Choose accent"}
                    aria-pressed={salon.accent === accent}
                    onClick={() => updateSalon(salon.id, { accent })}
                    className={cn(
                      "h-11 w-11 rounded-full border-4 border-card ring-offset-2",
                      salon.accent === accent && "ring-2 ring-foreground",
                    )}
                    style={{ background: accent }}
                  />
                ))}
              </div>
            </div>
            <Button onClick={save} className="min-h-11 px-6">
              {t("save")}
            </Button>
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card className="overflow-hidden py-0 shadow-card">
            <img src={salon.cover} alt="" className="h-36 w-full object-cover" />
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <span
                  className="grid h-12 min-w-12 place-items-center rounded-xl px-2 text-xs font-bold text-white"
                  style={{ background: salon.accent }}
                >
                  {salon.initials}
                </span>
                <div>
                  <p className="font-semibold">{tv(salon.name)}</p>
                  <p className="text-xs text-muted-foreground">{tv(salon.kind)}</p>
                </div>
              </div>
              <Button asChild variant="outline" className="mt-4 w-full">
                <a href={appPath(`/customer/${tenantId}`)}>
                  {t("view_customer")}
                  <ArrowRight className="flip-rtl" />
                </a>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-destructive/20 shadow-card">
            <CardHeader>
              <CardTitle className="text-base">{t("data_and_demo")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm leading-6 text-muted-foreground">
                {t("reset_confirm_desc")}
              </p>
              <ResetDemoButton />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export function ManagementPage({
  tenantId,
  section,
}: {
  tenantId: string;
  section: ManageSection;
}) {
  const content =
    section === "overview" ? (
      <OverviewPage tenantId={tenantId} />
    ) : section === "bookings" ? (
      <BookingsPage tenantId={tenantId} />
    ) : section === "calendar" ? (
      <CalendarPage tenantId={tenantId} />
    ) : section === "team" ? (
      <TeamPage tenantId={tenantId} />
    ) : section === "customers" ? (
      <CustomersPage tenantId={tenantId} />
    ) : section === "analytics" ? (
      <AnalyticsPage tenantId={tenantId} />
    ) : (
      <SettingsPage tenantId={tenantId} />
    );
  return (
    <ManagementShell tenantId={tenantId} section={section}>
      {content}
    </ManagementShell>
  );
}
