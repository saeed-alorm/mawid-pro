import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  BookingClient,
  BookingFailure,
  type BookingView,
  type ServerBooking,
  type ServerSlot,
  type VisitPreference,
  type VisitSegment,
  type InboxItem,
} from "@/lib/booking-client";
import { useI18n } from "@/lib/i18n";
import { LangToggle } from "./mawid";
import { Button } from "./ui/button";

// Deliberately gated to an explicitly configured Vite development server. The
// static demo and private Android bundle never inherit a fixture URL or token.
export function BookingBoundary({
  children,
  staff = false,
  initialProfessional,
}: {
  children: ReactNode;
  staff?: boolean;
  initialProfessional?: string | undefined;
}) {
  return import.meta.env.DEV && import.meta.env["VITE_MAWID_LOCAL_BOOKING"] === "true" ? (
    <ServerBookingPage staff={staff} initialProfessional={initialProfessional} />
  ) : (
    children
  );
}

export function ServerBookingPage({
  staff = false,
  initialProfessional,
}: {
  staff?: boolean;
  initialProfessional?: string | undefined;
}) {
  const [hydrated, setHydrated] = useState(false);
  const { lang } = useI18n();
  const say = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const client = useRef<BookingClient | null>(null);
  const epoch = useRef(0),
    read = useRef(0);
  const [view, setView] = useState<BookingView | null>(null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [draft, setDraft] = useState<VisitPreference[]>([
    { service_id: "", professional_id: initialProfessional },
  ]);
  const [callerName, setCallerName] = useState("");
  const [callerPhone, setCallerPhone] = useState("");
  const [source, setSource] = useState("walk-in");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<
    { customer_id: string; display_name: string; phone: string | null }[]
  >([]);
  const [customer, setCustomer] = useState(""),
    [start, setStart] = useState("");
  const [slots, setSlots] = useState<ServerSlot[]>([]);
  const [selected, setSelected] = useState<ServerBooking | null>(null);
  const [review, setReview] = useState<{
    booking_id: string;
    professional_ids: string[];
    submitted: boolean;
  } | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [staffFeedback, setStaffFeedback] = useState<{
    booking_id: string;
    reviews: { professional_id: string; score: number; feedback: string | null }[];
  } | null>(null);
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar-LB" : "en-GB", {
      timeZone: "Asia/Beirut",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const updateDraft = (next: VisitPreference[]) => {
    setDraft(next);
    setSlots([]);
    setStart("");
  };
  const clearPrivateFields = useCallback(() => {
    setCustomer("");
    setCallerName("");
    setCallerPhone("");
    setQuery("");
    setMatches([]);
    setReview(null);
    setStaffFeedback(null);
    setScores({});
    setFeedback({});
  }, []);
  const editDraft = (index: number, next: VisitPreference) =>
    updateDraft(draft.map((segment, i) => (i === index ? next : segment)));
  const loadVisit = (booking: ServerBooking, assigned: boolean) => {
    setSelected(assigned ? booking : null);
    updateDraft(
      (booking.segments ?? []).map((s) => ({
        service_id: s.service_id,
        professional_id:
          (assigned ? s.assigned_professional_id : null) ??
          s.requested_professional_id ??
          undefined,
      })),
    );
  };
  const refresh = useCallback(
    async (preserveMessage = false) => {
      const c = client.current,
        e = epoch.current,
        r = ++read.current;
      if (!c) return;
      try {
        const result = await c.view();
        if (e === epoch.current && r === read.current) {
          setView(result);
          setSelected(null);
        }
      } catch (error) {
        if (e === epoch.current && r === read.current) {
          setView(null);
          clearPrivateFields();
          setInbox([]);
          setSlots([]);
          setSelected(null);
          if (!preserveMessage)
            setMessage(error instanceof BookingFailure ? error.code : "ACCESS_UNAVAILABLE");
        }
        return;
      }
      try {
        const result = await c.inbox();
        if (e === epoch.current && r === read.current) setInbox(result.items);
      } catch {
        if (e === epoch.current && r === read.current) setInbox([]);
      }
    },
    [clearPrivateFields],
  );
  useEffect(() => {
    setHydrated(true);
    const generation = epoch;
    const resume = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      generation.current++;
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);
  const act = async (task: (c: BookingClient) => Promise<unknown>) => {
    const c = client.current,
      e = epoch.current;
    if (!c || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await task(c);
      if (e === epoch.current)
        setMessage(
          say(
            "Server accepted. Current state follows.",
            "قبل الخادم الإجراء. الحالة الحالية أدناه.",
          ),
        );
    } catch (error) {
      if (e === epoch.current)
        setMessage(
          say("Submission unconfirmed: ", "الإرسال غير مؤكد: ") +
            (error instanceof BookingFailure ? error.code : "CONNECTION_UNCONFIRMED"),
        );
    } finally {
      if (e === epoch.current) {
        setSlots([]);
        setStart("");
        await refresh(true);
        setBusy(false);
      }
    }
  };
  const loadSlots = async () => {
    const c = client.current,
      e = epoch.current;
    if (!c || draft.some((segment) => !segment.service_id) || busy) return;
    setBusy(true);
    setSlots([]);
    setStart("");
    try {
      const result = await c.request<{ items: ServerSlot[] }>("slots", { segments: draft });
      if (e === epoch.current) setSlots(result.items);
    } catch (error) {
      if (e === epoch.current)
        setMessage(error instanceof BookingFailure ? error.code : "AVAILABILITY_UNAVAILABLE");
    } finally {
      if (e === epoch.current) setBusy(false);
    }
  };
  const mutate = (action: string, b: ServerBooking, extra = {}) =>
    act((c) =>
      c.mutate(`visits/${b.booking_id}/${action}`, { expected_version: b.version, ...extra }),
    );
  const partner = view?.roles.some((role) => role === "admin" || role === "manager");
  const assignments = draft.map((segment) => segment.professional_id ?? null);
  const canSchedule = draft.every((segment) => segment.service_id && segment.professional_id);
  const preview = slots.find((slot) => slot.start === start)?.segments;
  const displayedVisits = view?.bookings.slice() ?? [];
  if (staff) {
    const firstTime = (visit: ServerBooking) => {
      const first = visit.segments?.[0];
      return first?.assigned_start ?? first?.requested_start ?? "";
    };
    displayedVisits.sort((a, b) => firstTime(a).localeCompare(firstTime(b)));
  }
  const sequence = (segments: VisitSegment[], view: BookingView, scheduled = false) => (
    <ol className="divide-y rounded-lg border">
      {segments.map((segment) => {
        const when = scheduled
          ? (segment.assigned_start ?? segment.requested_start)
          : segment.requested_start;
        const end = scheduled
          ? (segment.assigned_end ?? segment.requested_end)
          : segment.requested_end;
        const professional = scheduled
          ? (segment.assigned_professional_id ?? segment.requested_professional_id)
          : segment.requested_professional_id;
        return (
          <li
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3"
            key={segment.position}
          >
            <div>
              <strong>
                {view.services.find((item) => item.service_id === segment.service_id)?.name}
              </strong>
              <p className="text-sm text-muted-foreground">
                {view.professionals.find((item) => item.professional_id === professional)
                  ?.display_name ?? say("Any professional", "أي اختصاصي")}
              </p>
            </div>
            <span className="text-sm tabular-nums">
              {formatTime(when)} – {formatTime(end)}
            </span>
          </li>
        );
      })}
    </ol>
  );
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {staff ? say("Booking workspace", "إدارة الحجوزات") : say("Your appointments", "مواعيدك")}
        </h1>
        <LangToggle />
      </div>
      <p>
        {say(
          "Development server · synthetic identities · Asia/Beirut. Pending requests reserve nothing. Closed-hours requests save immediately and staff review starts at the next configured opening.",
          "خادم تطويري · هويات تجريبية · توقيت بيروت. الطلب المعلق لا يحجز الوقت. تُحفظ الطلبات فوراً أثناء الإغلاق وتبدأ مراجعتها عند الافتتاح التالي.",
        )}
      </p>
      <label className="block">
        {say(
          "Import separately authorized development session",
          "استيراد جلسة تطوير مخوّلة مستقلة",
        )}
        <input
          aria-label="Development session"
          type="file"
          accept="application/json,.json"
          disabled={busy || !hydrated}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const e = ++epoch.current;
            client.current = null;
            setView(null);
            setInbox([]);
            setSlots([]);
            setSelected(null);
            updateDraft([{ service_id: "", professional_id: initialProfessional }]);
            clearPrivateFields();
            setMessage("");
            try {
              if (file.size > 16384) throw new Error();
              const input = JSON.parse(await file.text());
              if (e !== epoch.current) return;
              client.current = new BookingClient(input, undefined, undefined, "visit-core");
              await refresh();
            } catch {
              if (e === epoch.current) {
                client.current = null;
                setMessage("INVALID_LOCAL_SESSION");
              }
            }
          }}
        />
      </label>
      <div role="status" aria-live="polite">
        {message}
      </div>
      {client.current && (
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy} onClick={() => void refresh()}>
            {say("Refresh server state", "تحديث حالة الخادم")}
          </Button>
          <Button
            disabled={busy || !client.current.pending}
            onClick={() => void act((c) => c.retry())}
          >
            {say("Retry saved unconfirmed submission", "إعادة محاولة الإرسال غير المؤكد")}
          </Button>
          <Button
            onClick={() => {
              epoch.current++;
              client.current = null;
              setView(null);
              setInbox([]);
              clearPrivateFields();
              setSlots([]);
              setSelected(null);
              setBusy(false);
              setMessage("SESSION_DISCONNECTED");
            }}
          >
            {say("Disconnect", "قطع الاتصال")}
          </Button>
        </div>
      )}
      {view && (
        <>
          <p>
            {say("Server time", "وقت الخادم")}: {view.server_time} ·{" "}
            {say("Review from", "تبدأ المراجعة")}: {view.review_at}
          </p>
          {staff && !partner && (
            <p>{say("Your appointments · read only", "مواعيدك · للاطلاع فقط")}</p>
          )}
          {!staff && (
            <section
              aria-label={say("Professionals", "الاختصاصيون")}
              className="grid gap-3 sm:grid-cols-2"
            >
              {view.professionals
                .filter((item) => item.active)
                .map((item) => (
                  <article key={item.professional_id} className="rounded-xl border bg-card p-4">
                    <h2 className="text-lg font-semibold">{item.display_name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {item.rating_count && item.rating_average != null
                        ? `${new Intl.NumberFormat(lang).format(item.rating_average)} / 5 · ${new Intl.NumberFormat(lang).format(item.rating_count)} ${say("reviews", "تقييمات")}`
                        : say("Unrated", "غير مقيّم")}
                    </p>
                    <p className="mb-3 text-sm">
                      {view.services
                        .filter((service) => item.service_ids.includes(service.service_id))
                        .map((service) => service.name)
                        .join(" · ")}
                    </p>
                    <Button
                      variant="outline"
                      disabled={busy || !!selected}
                      onClick={() => {
                        editDraft(0, {
                          service_id: item.service_ids.includes(draft[0]?.service_id ?? "")
                            ? (draft[0]?.service_id ?? "")
                            : "",
                          professional_id: item.professional_id,
                        });
                        document.getElementById("visit-draft")?.focus();
                      }}
                    >
                      {say("Book with this professional", "احجز مع هذا الاختصاصي")}
                    </Button>
                  </article>
                ))}
            </section>
          )}
          {(!staff || partner) && (
            <section id="visit-draft" tabIndex={-1} className="space-y-4 rounded-xl border p-4">
              <h2 className="text-lg font-semibold">
                {selected
                  ? say("Propose / assign", "اقتراح / تعيين")
                  : staff
                    ? say("Staff-created appointment", "موعد من الإدارة")
                    : say("Request a time", "طلب موعد")}
              </h2>
              {draft.map((segment, index) => (
                <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2" key={index}>
                  <legend className="px-1 text-sm font-medium">
                    {say("Service", "الخدمة")} {index + 1}
                  </legend>
                  <label className="grid gap-1">
                    {say("Service", "الخدمة")}
                    <select
                      className="rounded-md border bg-background p-2"
                      aria-label={
                        index === 0
                          ? say("Service", "الخدمة")
                          : say(`Service ${index + 1}`, `الخدمة ${index + 1}`)
                      }
                      value={segment.service_id}
                      disabled={busy || !!selected}
                      onChange={(event) => {
                        const value = event.target.value;
                        const stillEligible = view.professionals.some(
                          (item) =>
                            item.professional_id === segment.professional_id &&
                            item.service_ids.includes(value),
                        );
                        editDraft(index, {
                          service_id: value,
                          ...(stillEligible ? { professional_id: segment.professional_id } : {}),
                        });
                      }}
                    >
                      <option value="">—</option>
                      {view.services.map((item) => (
                        <option key={item.service_id} value={item.service_id}>
                          {item.name} · {item.duration_minutes} {say("min", "د")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1">
                    {say("Professional", "الاختصاصي")}
                    <select
                      className="rounded-md border bg-background p-2"
                      aria-label={
                        index === 0
                          ? say("Professional", "الاختصاصي")
                          : say(`Professional ${index + 1}`, `الاختصاصي ${index + 1}`)
                      }
                      value={segment.professional_id ?? ""}
                      disabled={busy}
                      onChange={(event) =>
                        editDraft(index, {
                          ...segment,
                          professional_id: event.target.value || undefined,
                        })
                      }
                    >
                      <option value="">{say("Any professional", "أي اختصاصي")}</option>
                      {view.professionals
                        .filter(
                          (item) =>
                            item.active &&
                            (segment.service_id
                              ? item.service_ids.includes(segment.service_id)
                              : item.professional_id === segment.professional_id),
                        )
                        .map((item) => (
                          <option key={item.professional_id} value={item.professional_id}>
                            {item.display_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  {!selected && draft.length > 1 && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => updateDraft(draft.filter((_, i) => i !== index))}
                    >
                      {say("Remove service", "إزالة الخدمة")}
                    </Button>
                  )}
                </fieldset>
              ))}
              {!selected && draft.length < 8 && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => updateDraft([...draft, { service_id: "" }])}
                >
                  {say("Add a service", "إضافة خدمة")}
                </Button>
              )}
              {staff && !selected && (
                <fieldset className="grid gap-3 border-t pt-3">
                  <label className="grid gap-1">
                    {say("Intake source", "مصدر الطلب")}
                    <select
                      className="rounded-md border bg-background p-2"
                      value={source}
                      onChange={(event) => setSource(event.target.value)}
                    >
                      <option value="phone">{say("Phone", "الهاتف")}</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="walk-in">{say("Walk-in", "زيارة مباشرة")}</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    {say("Find a customer by name or phone", "البحث عن عميل بالاسم أو الهاتف")}
                    <input
                      className="rounded-md border bg-background p-2"
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setMatches([]);
                        setCustomer("");
                      }}
                    />
                  </label>
                  <Button
                    variant="outline"
                    disabled={busy || query.trim().length < 2}
                    onClick={async () => {
                      const c = client.current;
                      const generation = epoch.current;
                      if (!c) return;
                      try {
                        const result = await c.request<{ items: typeof matches }>(
                          `callers?q=${encodeURIComponent(query)}`,
                        );
                        if (generation === epoch.current) setMatches(result.items);
                      } catch (error) {
                        if (generation === epoch.current)
                          setMessage(
                            error instanceof BookingFailure ? error.code : "LOOKUP_UNAVAILABLE",
                          );
                      }
                    }}
                  >
                    {say("Search customers", "البحث عن العملاء")}
                  </Button>
                  {matches.length > 0 && (
                    <label className="grid gap-1">
                      {say("Customer", "العميل")}
                      <select
                        className="rounded-md border bg-background p-2"
                        value={customer}
                        onChange={(event) => setCustomer(event.target.value)}
                      >
                        <option value="">{say("New caller", "متصل جديد")}</option>
                        {matches.map((match) => (
                          <option key={match.customer_id} value={match.customer_id}>
                            {match.display_name}
                            {match.phone ? ` · ${match.phone}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {!customer && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1">
                        {say("Caller name", "اسم المتصل")}
                        <input
                          className="rounded-md border bg-background p-2"
                          maxLength={120}
                          value={callerName}
                          onChange={(event) => setCallerName(event.target.value)}
                        />
                      </label>
                      <label className="grid gap-1">
                        {say("Phone (optional)", "الهاتف (اختياري)")}
                        <input
                          type="tel"
                          className="rounded-md border bg-background p-2"
                          value={callerPhone}
                          onChange={(event) => setCallerPhone(event.target.value)}
                        />
                      </label>
                    </div>
                  )}
                </fieldset>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <Button
                  variant="outline"
                  disabled={busy || draft.some((item) => !item.service_id)}
                  onClick={() => void loadSlots()}
                >
                  {say("Refresh availability", "تحديث الأوقات المتاحة")}
                </Button>
                <label className="grid flex-1 gap-1">
                  {say("Available time (Beirut)", "الوقت المتاح (بيروت)")}
                  <select
                    className="rounded-md border bg-background p-2"
                    aria-label={say("Available time", "الوقت المتاح")}
                    value={start}
                    disabled={busy}
                    onChange={(event) => setStart(event.target.value)}
                  >
                    <option value="">—</option>
                    {slots.map((slot) => (
                      <option key={slot.start} value={slot.start}>
                        {formatTime(slot.start)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {preview && (
                <div className="space-y-2">
                  {sequence(preview, view)}
                  <p className="text-sm">
                    {say("Total visit time", "مدة الزيارة الإجمالية")} ·{" "}
                    {(Date.parse(preview.at(-1)!.requested_end) -
                      Date.parse(preview[0]!.requested_start)) /
                      60000}{" "}
                    {say("min", "د")}
                  </p>
                </div>
              )}
              {selected ? (
                <div className="flex flex-wrap gap-3">
                  {selected.state === "pending" &&
                    selected.segments?.some((item) => !item.requested_professional_id) && (
                      <Button
                        disabled={busy || !canSchedule}
                        onClick={() => void mutate("assign", selected, { assignments })}
                      >
                        {say("Save assignment (no reservation)", "حفظ التعيين (دون حجز الوقت)")}
                      </Button>
                    )}
                  <Button
                    disabled={busy || !start || !canSchedule}
                    onClick={() =>
                      void mutate(
                        selected.state === "confirmed" ? "reschedule" : "propose",
                        selected,
                        { assignments, start },
                      )
                    }
                  >
                    {selected.state === "confirmed"
                      ? say("Reschedule visit", "إعادة جدولة الزيارة")
                      : say("Propose time", "اقتراح وقت")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSelected(null);
                      updateDraft([{ service_id: "" }]);
                    }}
                  >
                    {say("Close", "إغلاق")}
                  </Button>
                </div>
              ) : (
                <Button
                  disabled={
                    busy ||
                    !start ||
                    (staff
                      ? !canSchedule || (!customer && !callerName.trim())
                      : !view.customer_ids.length)
                  }
                  onClick={() =>
                    void act((c) =>
                      c.mutate(staff ? "caller-intake" : "requests", {
                        segments: draft,
                        start,
                        ...(staff
                          ? {
                              source,
                              ...(customer
                                ? { customer_id: customer }
                                : {
                                    caller: {
                                      name: callerName.trim(),
                                      ...(callerPhone.trim() ? { phone: callerPhone.trim() } : {}),
                                    },
                                  }),
                            }
                          : { customer_id: view.customer_ids[0] }),
                      }),
                    )
                  }
                >
                  {staff
                    ? say("Create appointment", "إنشاء موعد")
                    : say("Submit request", "إرسال الطلب")}
                </Button>
              )}
            </section>
          )}
          <section aria-label="Booking notifications" className="space-y-3">
            <h2>{say("Notifications", "الإشعارات")}</h2>
            <p>
              {say(
                "Delivery failure does not change booking state. Provider acceptance does not prove device delivery.",
                "فشل الإرسال لا يغيّر الحجز. قبول المزوّد لا يثبت وصول الإشعار للجهاز.",
              )}
            </p>
            {inbox.map((item) => (
              <article key={item.notification_id} className="rounded border p-3">
                <p>
                  {item.kind === "review_invitation"
                    ? say("Review your visit", "قيّم زيارتك")
                    : item.kind === "pending_reminder"
                      ? say("Pending visit reminder", "تذكير بزيارة معلّقة")
                      : item.state}{" "}
                  · {item.pushes.map((p) => `${p.transport}: ${p.status}`).join(", ")}
                </p>
                {item.own && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void act(async (c) => {
                        const current = await c.open(item.notification_id);
                        if (item.kind === "review_invitation") {
                          const result = await c.request<{
                            professional_ids: string[];
                            submitted: boolean;
                          }>(`visits/${current.booking_id}/reviews`);
                          if (client.current !== c) return;
                          setScores({});
                          setFeedback({});
                          setReview({ booking_id: current.booking_id, ...result });
                        }
                      })
                    }
                  >
                    {item.kind === "review_invitation"
                      ? say("Open review", "فتح التقييم")
                      : say("Open current booking state", "فتح حالة الحجز الحالية")}
                  </Button>
                )}
              </article>
            ))}
          </section>
          {review && !staff && (
            <section aria-labelledby="review-heading" className="space-y-4 rounded-xl border p-4">
              <h2 id="review-heading" className="text-lg font-semibold">
                {say("Review your visit", "قيّم زيارتك")}
              </h2>
              {review.submitted ? (
                <p>{say("Review submitted", "تم إرسال التقييم")}</p>
              ) : (
                <>
                  {review.professional_ids.map((id) => (
                    <fieldset className="grid gap-2 rounded-lg border p-3" key={id}>
                      <legend className="px-1 font-medium">
                        {view.professionals.find((p) => p.professional_id === id)?.display_name}
                      </legend>
                      <label className="grid gap-1">
                        {say("Score", "التقييم")}
                        <select
                          className="rounded-md border bg-background p-2"
                          value={scores[id] ?? ""}
                          onChange={(event) =>
                            setScores({ ...scores, [id]: Number(event.target.value) })
                          }
                        >
                          <option value="">—</option>
                          {[1, 2, 3, 4, 5].map((score) => (
                            <option key={score} value={score}>
                              {score} / 5
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1">
                        {say("Feedback for management (optional)", "ملاحظات للإدارة (اختيارية)")}
                        <textarea
                          className="rounded-md border bg-background p-2"
                          maxLength={1000}
                          value={feedback[id] ?? ""}
                          onChange={(event) =>
                            setFeedback({ ...feedback, [id]: event.target.value })
                          }
                        />
                      </label>
                    </fieldset>
                  ))}
                  <Button
                    disabled={busy || review.professional_ids.some((id) => !scores[id])}
                    onClick={() =>
                      void act(async (c) => {
                        await c.mutate(`visits/${review.booking_id}/reviews`, {
                          reviews: review.professional_ids.map((id) => ({
                            professional_id: id,
                            score: scores[id],
                            ...(feedback[id]?.trim() ? { feedback: feedback[id].trim() } : {}),
                          })),
                        });
                        if (client.current !== c) return;
                        setReview({ ...review, submitted: true });
                        setFeedback({});
                      })
                    }
                  >
                    {say("Submit review", "إرسال التقييم")}
                  </Button>
                </>
              )}
            </section>
          )}
          <section className="space-y-3" aria-label="Server bookings">
            {staff && (
              <h2 className="text-xl font-semibold">{say("Visit schedule", "جدول الزيارات")}</h2>
            )}
            {displayedVisits.map((b) => {
              const segments = b.segments ?? [];
              return (
                <article key={b.booking_id} className="space-y-3 rounded-xl border p-4">
                  <h2 className="font-semibold">
                    {view.services.find((s) => s.service_id === segments[0]?.service_id)?.name}
                  </h2>
                  <p>
                    {{
                      pending: say("pending", "قيد الانتظار"),
                      proposed: say("proposed", "مقترح"),
                      confirmed: say("confirmed", "مؤكد"),
                      cancelled: say("cancelled", "ملغى"),
                      declined: say("declined", "مرفوض"),
                      withdrawn: say("withdrawn", "مسحوب"),
                      expired: say("expired", "منتهي"),
                    }[b.state] ?? b.state}{" "}
                    · v{b.version}
                  </p>
                  {b.state === "proposed" && (
                    <h3 className="text-sm font-semibold">
                      {say("Proposed alternative", "الموعد البديل المقترح")}
                    </h3>
                  )}
                  {sequence(segments, view, true)}
                  {staffFeedback?.booking_id === b.booking_id && partner && (
                    <div className="space-y-2 border-t pt-3">
                      <h3 className="font-semibold">{say("Review feedback", "ملاحظات التقييم")}</h3>
                      {staffFeedback.reviews.length ? (
                        <ul className="space-y-2">
                          {staffFeedback.reviews.map((item) => (
                            <li key={item.professional_id} className="break-words text-sm">
                              {
                                view.professionals.find(
                                  (person) => person.professional_id === item.professional_id,
                                )?.display_name
                              }
                              {" · "}
                              {item.score} / 5{item.feedback && <p>{item.feedback}</p>}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm">
                          {say("No reviews submitted", "لا توجد تقييمات مرسلة")}
                        </p>
                      )}
                    </div>
                  )}
                  {b.state === "pending" && (
                    <p>
                      {say(
                        "Awaiting approval · unconfirmed · no reservation",
                        "بانتظار الموافقة · غير مؤكد · دون حجز الوقت",
                      )}
                    </p>
                  )}
                  {b.overdue && (
                    <p>
                      {say(
                        "Staff warning: overdue, still pending",
                        "تنبيه للإدارة: متأخر ولا يزال معلقاً",
                      )}
                    </p>
                  )}
                  {b.offer_expires_at && (
                    <p>
                      {say("Offer expires", "ينتهي العرض")}: {b.offer_expires_at}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {staff && partner && b.state === "pending" && (
                      <>
                        <Button disabled={busy} onClick={() => void mutate("confirm", b)}>
                          {say("Approve", "موافقة")}
                        </Button>
                        <Button disabled={busy} onClick={() => void mutate("decline", b)}>
                          {say("Reject", "رفض")}
                        </Button>
                        <Button disabled={busy} onClick={() => loadVisit(b, true)}>
                          {say("Assign / propose", "تعيين / اقتراح")}
                        </Button>
                      </>
                    )}
                    {staff && partner && b.state === "confirmed" && (
                      <Button variant="outline" disabled={busy} onClick={() => loadVisit(b, true)}>
                        {say("Choose a new time", "اختيار موعد جديد")}
                      </Button>
                    )}
                    {staff && partner && b.state === "confirmed" && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void act(async (c) => {
                            const result = await c.request<{
                              reviews: NonNullable<typeof staffFeedback>["reviews"];
                            }>(`visits/${b.booking_id}/reviews-feedback`);
                            if (client.current !== c) return;
                            setStaffFeedback({ booking_id: b.booking_id, ...result });
                          })
                        }
                      >
                        {say("View feedback", "عرض الملاحظات")}
                      </Button>
                    )}
                    {!staff && b.state === "proposed" && (
                      <Button disabled={busy} onClick={() => void mutate("accept", b)}>
                        {say("Accept proposal", "قبول الاقتراح")}
                      </Button>
                    )}
                    {!staff && ["pending", "proposed"].includes(b.state) && (
                      <Button disabled={busy} onClick={() => void mutate("withdraw", b)}>
                        {say("Withdraw / decline", "سحب / رفض")}
                      </Button>
                    )}
                    {staff && partner && b.state === "proposed" && (
                      <Button disabled={busy} onClick={() => void mutate("decline", b)}>
                        {say("Decline", "رفض")}
                      </Button>
                    )}
                    {b.can_cancel && (
                      <div>
                        {!staff && b.cancellation_is_late && (
                          <p>
                            {say(
                              "Cancellation within the final hour counts toward the salon's late-cancellation flag.",
                              "الإلغاء خلال الساعة الأخيرة يُحتسب ضمن تنبيه الإلغاءات المتأخرة لدى الصالون.",
                            )}
                          </p>
                        )}
                        <Button disabled={busy} onClick={() => void mutate("cancel", b)}>
                          {say("Cancel appointment", "إلغاء الموعد")}
                        </Button>
                      </div>
                    )}
                    {!staff &&
                      ["cancelled", "withdrawn", "declined", "expired"].includes(b.state) && (
                        <Button disabled={busy} onClick={() => loadVisit(b, false)}>
                          {say("Request a new time", "طلب موعد جديد")}
                        </Button>
                      )}
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
