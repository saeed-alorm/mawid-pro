import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BookingClient,
  BookingFailure,
  type BookingView,
  type ServerBooking,
  type ServerSlot,
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
}: {
  children: ReactNode;
  staff?: boolean;
}) {
  return import.meta.env.DEV && import.meta.env["VITE_MAWID_LOCAL_BOOKING"] === "true" ? (
    <ServerBookingPage staff={staff} />
  ) : (
    children
  );
}

export function ServerBookingPage({ staff = false }: { staff?: boolean }) {
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
  const [service, setService] = useState(""),
    [professional, setProfessional] = useState("");
  const [customer, setCustomer] = useState(""),
    [start, setStart] = useState("");
  const [slots, setSlots] = useState<ServerSlot[]>([]);
  const [selected, setSelected] = useState<ServerBooking | null>(null);
  const refresh = async (preserveMessage = false) => {
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
  };
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
  }, []);
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
    if (!c || !service || busy) return;
    setBusy(true);
    setSlots([]);
    setStart("");
    try {
      const result = await c.request<{ items: ServerSlot[] }>(
        `slots?service_id=${service}${professional ? `&professional_id=${professional}` : ""}`,
      );
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
      c.mutate(`bookings/${b.booking_id}/${action}`, { expected_version: b.version, ...extra }),
    );
  const admin = view?.roles.includes("admin"),
    manager = view?.roles.includes("manager");
  const candidates =
    view?.professionals.filter((p) => p.active && p.service_ids.includes(service)) ?? [];
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
            setService("");
            setProfessional("");
            setCustomer("");
            setMessage("");
            try {
              if (file.size > 16384) throw new Error();
              const input = JSON.parse(await file.text());
              if (e !== epoch.current) return;
              client.current = new BookingClient(input);
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
          <section className="space-y-3 rounded-xl border p-4">
            <h2 className="text-lg font-semibold">
              {selected
                ? say("Propose / assign", "اقتراح / تعيين")
                : staff
                  ? say("Staff-created appointment", "موعد من الإدارة")
                  : say("Request a time", "طلب موعد")}
            </h2>
            <label className="block">
              {say("Service", "الخدمة")}
              <select
                aria-label="Service"
                value={service}
                disabled={busy || !!selected}
                onChange={(e) => {
                  setService(e.target.value);
                  setProfessional("");
                  setSlots([]);
                  setStart("");
                }}
              >
                <option value="">—</option>
                {view.services.map((s) => (
                  <option key={s.service_id} value={s.service_id}>
                    {s.name} · {s.duration_minutes} min
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              {say("Professional", "الاختصاصي")}
              <select
                aria-label="Professional"
                value={professional}
                disabled={busy}
                onChange={(e) => {
                  setProfessional(e.target.value);
                  setSlots([]);
                  setStart("");
                }}
              >
                <option value="">{say("Any professional", "أي اختصاصي")}</option>
                {candidates.map((p) => (
                  <option key={p.professional_id} value={p.professional_id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>
            {staff && !selected && (
              <label className="block">
                {say("Customer", "العميل")}
                <select
                  aria-label="Customer"
                  value={customer}
                  disabled={busy}
                  onChange={(e) => setCustomer(e.target.value)}
                >
                  <option value="">—</option>
                  {view.customers.map((c) => (
                    <option key={c.customer_id} value={c.customer_id}>
                      {c.display_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button disabled={busy || !service} onClick={() => void loadSlots()}>
              {say("Refresh availability", "تحديث الأوقات المتاحة")}
            </Button>
            <label className="block">
              {say("Available time (Beirut)", "الوقت المتاح (بيروت)")}
              <select
                aria-label="Available time"
                value={start}
                disabled={busy}
                onChange={(e) => setStart(e.target.value)}
              >
                <option value="">—</option>
                {slots.map((s) => (
                  <option key={s.start} value={s.start}>
                    {s.date} {s.time} {s.offset}
                  </option>
                ))}
              </select>
            </label>
            {selected ? (
              <div className="flex flex-wrap gap-3">
                {manager && !selected.requested_professional_id && (
                  <Button
                    disabled={busy || !professional}
                    onClick={() =>
                      void mutate("assign", selected, { professional_id: professional })
                    }
                  >
                    {say("Save assignment (no reservation)", "حفظ التعيين (دون حجز الوقت)")}
                  </Button>
                )}
                {admin && (
                  <Button
                    disabled={busy || !start || !professional}
                    onClick={() =>
                      void mutate("propose", selected, { professional_id: professional, start })
                    }
                  >
                    {say("Propose time", "اقتراح وقت")}
                  </Button>
                )}
                <Button onClick={() => setSelected(null)}>{say("Close", "إغلاق")}</Button>
              </div>
            ) : (
              <Button
                disabled={
                  busy ||
                  !start ||
                  (staff ? !admin || !customer || !professional : !view.customer_ids.length)
                }
                onClick={() =>
                  void act((c) =>
                    c.mutate(staff ? "walk-ins" : "requests", {
                      service_id: service,
                      customer_id: staff ? customer : view.customer_ids[0],
                      ...(professional ? { professional_id: professional } : {}),
                      start,
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
                  {item.state} · {item.pushes.map((p) => `${p.transport}: ${p.status}`).join(", ")}
                </p>
                {item.own && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void act(async (c) => {
                        await c.open(item.notification_id);
                      })
                    }
                  >
                    {say("Open current booking state", "فتح حالة الحجز الحالية")}
                  </Button>
                )}
              </article>
            ))}
          </section>
          <section className="space-y-3" aria-label="Server bookings">
            {view.bookings.map((b) => {
              const when = b.assigned_local ?? b.requested_local;
              return (
                <article key={b.booking_id} className="space-y-3 rounded-xl border p-4">
                  <h2>{view.services.find((s) => s.service_id === b.service_id)?.name}</h2>
                  <p>
                    {b.state} · v{b.version} · {when.date} {when.time} {when.offset}
                  </p>
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
                    {staff && b.state === "pending" && (
                      <>
                        {admin && (
                          <>
                            <Button disabled={busy} onClick={() => void mutate("confirm", b)}>
                              {say("Approve", "موافقة")}
                            </Button>
                            <Button disabled={busy} onClick={() => void mutate("decline", b)}>
                              {say("Reject", "رفض")}
                            </Button>
                          </>
                        )}
                        {(admin || manager) && (
                          <Button
                            disabled={busy}
                            onClick={() => {
                              setSelected(b);
                              setService(b.service_id);
                              setProfessional(
                                b.assigned_professional_id ?? b.requested_professional_id ?? "",
                              );
                              setSlots([]);
                              setStart("");
                            }}
                          >
                            {say("Assign / propose", "تعيين / اقتراح")}
                          </Button>
                        )}
                      </>
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
                    {staff && admin && b.state === "proposed" && (
                      <Button disabled={busy} onClick={() => void mutate("decline", b)}>
                        {say("Decline", "رفض")}
                      </Button>
                    )}
                    {b.can_cancel && (
                      <Button disabled={busy} onClick={() => void mutate("cancel", b)}>
                        {say("Cancel appointment", "إلغاء الموعد")}
                      </Button>
                    )}
                    {!staff &&
                      ["cancelled", "withdrawn", "declined", "expired"].includes(b.state) && (
                        <Button
                          disabled={busy}
                          onClick={() => {
                            setSelected(null);
                            setService(b.service_id);
                            setProfessional(b.requested_professional_id ?? "");
                            setStart("");
                            setSlots([]);
                          }}
                        >
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
