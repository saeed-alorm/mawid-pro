import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "en" | "ar";

type Dict = Record<string, { en: string; ar: string }>;

export const dict: Dict = {
  brand: { en: "MAWID", ar: "موعد" },
  tagline: { en: "Smarter schedules. Stronger salons.", ar: "مواعيد أذكى. إدارة أفضل." },
  launcher_intro: {
    en: "MAWID is a multi-tenant booking platform. Every salon runs inside its own private workspace with its own team, services, calendar and customers.",
    ar: "موعد منصة حجوزات متعددة الفروع. كل صالون يعمل ضمن مساحة عمل خاصة به مع فريقه وخدماته وجدوله وعملائه.",
  },
  prototype_badge: { en: "Prototype demo", ar: "نسخة تجريبية" },
  demo_notice: {
    en: "Demo only: this workspace switcher exists to preview the three fictional salons. MAWID is not a public salon marketplace.",
    ar: "للعرض فقط: مبدّل مساحات العمل موجود لاستعراض الصالونات الثلاثة الافتراضية. موعد ليس سوقاً عاماً للصالونات.",
  },
  choose_workspace: { en: "Choose a salon workspace", ar: "اختر مساحة عمل الصالون" },
  language: { en: "Language", ar: "اللغة" },
  view_customer: { en: "View customer experience", ar: "عرض تجربة العميل" },
  open_dashboard: { en: "Open management dashboard", ar: "فتح لوحة الإدارة" },
  reset_demo: { en: "Reset demo data", ar: "إعادة ضبط البيانات التجريبية" },
  reset_done: { en: "Demo data restored", ar: "تمت إعادة ضبط البيانات" },
  reset_confirm_title: { en: "Reset all demo data?", ar: "إعادة ضبط كل البيانات التجريبية؟" },
  reset_confirm_desc: {
    en: "Every booking, schedule change and verification made during this demo will be removed.",
    ar: "سيتم حذف كل الحجوزات وتعديلات الجداول وعمليات التحقق التي تمت خلال العرض.",
  },
  cancel: { en: "Cancel", ar: "إلغاء" },
  confirm: { en: "Confirm", ar: "تأكيد" },
  close: { en: "Close", ar: "إغلاق" },
  back: { en: "Back", ar: "رجوع" },
  next: { en: "Next", ar: "التالي" },
  save: { en: "Save", ar: "حفظ" },
  saved: { en: "Changes saved", ar: "تم حفظ التغييرات" },
  switch_workspace: { en: "Switch workspace", ar: "تبديل مساحة العمل" },
  back_to_launcher: { en: "Back to demo launcher", ar: "العودة إلى شاشة العرض" },

  // customer site
  book_appointment: { en: "Book an appointment", ar: "احجز موعداً" },
  my_appointments: { en: "My appointments", ar: "مواعيدي" },
  about_salon: { en: "About the salon", ar: "عن الصالون" },
  opening_hours: { en: "Opening hours", ar: "ساعات العمل" },
  location: { en: "Location", ar: "الموقع" },
  our_services: { en: "Our services", ar: "خدماتنا" },
  our_team: { en: "Our team", ar: "فريقنا" },
  view_profile: { en: "View profile", ar: "عرض الملف" },
  select: { en: "Select", ar: "اختيار" },
  selected: { en: "Selected", ar: "تم الاختيار" },
  minutes: { en: "min", ar: "دقيقة" },
  all_services: { en: "All services", ar: "كل الخدمات" },

  // booking flow
  step: { en: "Step", ar: "الخطوة" },
  of: { en: "of", ar: "من" },
  step_service: { en: "Service", ar: "الخدمة" },
  step_employee: { en: "Professional", ar: "الاختصاصي" },
  step_time: { en: "Date & time", ar: "التاريخ والوقت" },
  step_review: { en: "Review", ar: "المراجعة" },
  step_verify: { en: "Verify", ar: "التحقق" },
  choose_service: { en: "Choose a service", ar: "اختر الخدمة" },
  choose_employee: { en: "Choose your professional", ar: "اختر الاختصاصي" },
  any_professional: { en: "Any available professional", ar: "أي اختصاصي متاح" },
  any_professional_desc: {
    en: "We will assign the first available team member for your service.",
    ar: "سنخصص لك أول عضو متاح من الفريق لخدمتك.",
  },
  choose_time: { en: "Choose a date and time", ar: "اختر التاريخ والوقت" },
  working_days: { en: "Working days", ar: "أيام العمل" },
  slots_available: { en: "slots available", ar: "مواعيد متاحة" },
  no_slots: { en: "No available times on this day", ar: "لا توجد أوقات متاحة في هذا اليوم" },
  review_appointment: { en: "Review your appointment", ar: "راجع موعدك" },
  service: { en: "Service", ar: "الخدمة" },
  professional: { en: "Professional", ar: "الاختصاصي" },
  date: { en: "Date", ar: "التاريخ" },
  time: { en: "Time", ar: "الوقت" },
  duration: { en: "Duration", ar: "المدة" },
  your_name: { en: "Your name", ar: "اسمك" },
  phone_number: { en: "Lebanese phone number", ar: "رقم هاتف لبناني" },
  phone_hint: { en: "Format: 03 123 456 or 71 123 456", ar: "الصيغة: ٠٣ ١٢٣ ٤٥٦ أو ٧١ ١٢٣ ٤٥٦" },
  invalid_phone: { en: "Enter a valid Lebanese mobile number", ar: "أدخل رقم هاتف لبناني صحيح" },
  name_required: { en: "Please enter your name", ar: "الرجاء إدخال اسمك" },
  send_code: { en: "Send verification code", ar: "إرسال رمز التحقق" },
  verify_number: { en: "Verify your number", ar: "تحقق من رقمك" },
  code_sent_to: { en: "We sent a 6-digit code to", ar: "أرسلنا رمزاً من ٦ أرقام إلى" },
  demo_code_is: { en: "Demo code", ar: "الرمز التجريبي" },
  demo_code_note: {
    en: "Simulated verification — no SMS is sent in this prototype.",
    ar: "تحقق محاكى — لا يتم إرسال رسائل نصية في هذه النسخة.",
  },
  wrong_code: { en: "Incorrect code. Try the demo code above.", ar: "رمز غير صحيح. جرّب الرمز التجريبي أعلاه." },
  verify_and_submit: { en: "Verify and send request", ar: "تحقق وأرسل الطلب" },
  request_sent: { en: "Request sent", ar: "تم إرسال الطلب" },
  request_sent_desc: {
    en: "Your appointment request was sent to the salon and is awaiting approval.",
    ar: "تم إرسال طلب موعدك إلى الصالون وهو بانتظار الموافقة.",
  },
  notify_note: {
    en: "You will be notified once the salon approves, rejects, or proposes a different time.",
    ar: "سيتم إعلامك بمجرد موافقة الصالون أو رفضه أو اقتراحه وقتاً آخر.",
  },
  view_my_appointments: { en: "View my appointments", ar: "عرض مواعيدي" },
  book_another: { en: "Book another appointment", ar: "حجز موعد آخر" },

  // statuses
  status_pending: { en: "Pending salon approval", ar: "بانتظار موافقة الصالون" },
  status_pending_short: { en: "Pending approval", ar: "قيد الموافقة" },
  status_approved: { en: "Approved", ar: "مؤكد" },
  status_rejected: { en: "Rejected", ar: "مرفوض" },
  status_cancelled: { en: "Cancelled", ar: "ملغى" },
  status_completed: { en: "Completed", ar: "منجز" },
  status_proposed: { en: "Reschedule proposed", ar: "تم اقتراح موعد جديد" },

  approve: { en: "Approve", ar: "موافقة" },
  reject: { en: "Reject", ar: "رفض" },
  reschedule: { en: "Reschedule", ar: "تعديل الموعد" },
  propose_time: { en: "Propose another time", ar: "اقتراح وقت آخر" },
  details: { en: "Details", ar: "التفاصيل" },
  booking_details: { en: "Booking details", ar: "تفاصيل الحجز" },

  // my appointments
  upcoming: { en: "Upcoming", ar: "القادمة" },
  pending_tab: { en: "Pending", ar: "المعلّقة" },
  past: { en: "Past", ar: "السابقة" },
  cancel_appointment: { en: "Cancel appointment", ar: "إلغاء الموعد" },
  cancel_confirm: {
    en: "This appointment will be cancelled and the slot released.",
    ar: "سيتم إلغاء هذا الموعد وتحرير الوقت المحجوز.",
  },
  appointment_cancelled: { en: "Appointment cancelled", ar: "تم إلغاء الموعد" },
  accept_new_time: { en: "Accept new time", ar: "قبول الوقت الجديد" },
  new_time_accepted: { en: "New time confirmed", ar: "تم تأكيد الوقت الجديد" },
  proposed_time: { en: "Proposed new time", ar: "الوقت المقترح" },
  no_appointments: { en: "No appointments here yet", ar: "لا توجد مواعيد هنا بعد" },
  no_appointments_desc: {
    en: "Once you book, your requests will appear in this list.",
    ar: "بمجرد الحجز ستظهر طلباتك في هذه القائمة.",
  },
  sign_in_phone: { en: "Enter your phone to see your appointments", ar: "أدخل رقمك لعرض مواعيدك" },
  demo_customer_hint: {
    en: "Tip: use a demo customer number below to see existing bookings.",
    ar: "ملاحظة: استخدم رقم عميل تجريبي أدناه لعرض حجوزات موجودة.",
  },
  sign_out: { en: "Sign out", ar: "تسجيل الخروج" },

  // dashboard
  overview: { en: "Overview", ar: "نظرة عامة" },
  bookings: { en: "Bookings", ar: "الحجوزات" },
  calendar: { en: "Calendar", ar: "التقويم" },
  team: { en: "Team", ar: "الفريق" },
  customers: { en: "Customers", ar: "العملاء" },
  analytics: { en: "Analytics", ar: "التحليلات" },
  settings: { en: "Settings", ar: "الإعدادات" },
  dashboard: { en: "Dashboard", ar: "لوحة التحكم" },
  schedule: { en: "Schedule", ar: "الجدول" },
  today_bookings: { en: "Today's bookings", ar: "حجوزات اليوم" },
  pending_requests: { en: "Pending requests", ar: "الطلبات المعلّقة" },
  weekly_bookings: { en: "Bookings this week", ar: "حجوزات هذا الأسبوع" },
  cancellation_rate: { en: "Cancellation rate", ar: "نسبة الإلغاء" },
  returning_customers: { en: "Returning customers", ar: "العملاء العائدون" },
  employee_utilization: { en: "Employee utilization", ar: "استثمار وقت الفريق" },
  peak_hours: { en: "Peak booking hours", ar: "ساعات الذروة" },
  weekly_trend: { en: "Weekly booking trend", ar: "اتجاه الحجوزات الأسبوعي" },
  team_performance: { en: "Team performance", ar: "أداء الفريق" },
  recent_activity: { en: "Recent booking activity", ar: "آخر نشاط الحجوزات" },
  view_all: { en: "View all", ar: "عرض الكل" },
  no_pending: { en: "No pending requests", ar: "لا توجد طلبات معلّقة" },
  all_caught_up: { en: "You are all caught up.", ar: "لا يوجد ما يتطلب إجراءً." },
  approved_toast: { en: "Booking approved and added to the calendar", ar: "تمت الموافقة وأضيف الحجز إلى التقويم" },
  rejected_toast: { en: "Booking request rejected", ar: "تم رفض طلب الحجز" },
  proposed_toast: { en: "New time proposed to the customer", ar: "تم اقتراح وقت جديد للعميل" },
  reject_confirm: {
    en: "The customer will be notified that this request was rejected.",
    ar: "سيتم إعلام العميل بأن الطلب قد رُفض.",
  },
  requested_at: { en: "Requested", ar: "تاريخ الطلب" },
  customer: { en: "Customer", ar: "العميل" },
  phone: { en: "Phone", ar: "الهاتف" },
  status: { en: "Status", ar: "الحالة" },
  all_statuses: { en: "All statuses", ar: "كل الحالات" },
  all_employees: { en: "All team members", ar: "كل الفريق" },
  filter: { en: "Filter", ar: "تصفية" },
  search: { en: "Search", ar: "بحث" },
  day: { en: "Day", ar: "يوم" },
  week: { en: "Week", ar: "أسبوع" },
  today: { en: "Today", ar: "اليوم" },
  no_bookings_day: { en: "No bookings for this selection", ar: "لا توجد حجوزات لهذا الاختيار" },
  slot_taken: { en: "That slot is already taken", ar: "هذا الوقت محجوز مسبقاً" },

  // team
  team_directory: { en: "Team directory", ar: "دليل الفريق" },
  active: { en: "Active", ar: "نشط" },
  inactive: { en: "Inactive", ar: "غير نشط" },
  specializations: { en: "Specializations", ar: "التخصصات" },
  biography: { en: "Biography", ar: "نبذة" },
  profile: { en: "Profile", ar: "الملف" },
  performance: { en: "Performance", ar: "الأداء" },
  weekly_hours: { en: "Weekly working hours", ar: "ساعات العمل الأسبوعية" },
  break_period: { en: "Break", ar: "الاستراحة" },
  day_off: { en: "Day off", ar: "عطلة" },
  working: { en: "Working", ar: "دوام" },
  time_off: { en: "Temporary unavailability", ar: "فترة عدم توفر مؤقتة" },
  add_time_off: { en: "Add unavailable period", ar: "إضافة فترة غير متاحة" },
  reason: { en: "Reason", ar: "السبب" },
  from: { en: "From", ar: "من" },
  to: { en: "To", ar: "إلى" },
  remove: { en: "Remove", ar: "حذف" },
  no_time_off: { en: "No unavailable periods", ar: "لا توجد فترات غير متاحة" },
  total_bookings: { en: "Total bookings", ar: "إجمالي الحجوزات" },
  completed_appointments: { en: "Completed", ar: "المنجزة" },
  cancelled_appointments: { en: "Cancelled", ar: "الملغاة" },
  schedule_utilization: { en: "Schedule utilization", ar: "استثمار الجدول" },
  repeat_customers: { en: "Repeat customers", ar: "عملاء متكررون" },
  booking_trend: { en: "Booking trend", ar: "اتجاه الحجوزات" },
  set_inactive: { en: "Set inactive", ar: "تعيين كغير نشط" },
  set_active: { en: "Set active", ar: "تعيين كنشط" },

  // customers
  customer_directory: { en: "Customer directory", ar: "دليل العملاء" },
  visits: { en: "Visits", ar: "الزيارات" },
  last_visit: { en: "Last visit", ar: "آخر زيارة" },
  no_customers: { en: "No customers match your search", ar: "لا يوجد عملاء مطابقون للبحث" },

  // settings
  workspace_settings: { en: "Workspace settings", ar: "إعدادات مساحة العمل" },
  salon_name: { en: "Salon name", ar: "اسم الصالون" },
  salon_intro: { en: "Short introduction", ar: "نبذة قصيرة" },
  address: { en: "Address", ar: "العنوان" },
  data_and_demo: { en: "Data & demo controls", ar: "البيانات وأدوات العرض" },
  loading: { en: "Loading…", ar: "جارٍ التحميل…" },

  // days
  sun: { en: "Sun", ar: "الأحد" },
  mon: { en: "Mon", ar: "الاثنين" },
  tue: { en: "Tue", ar: "الثلاثاء" },
  wed: { en: "Wed", ar: "الأربعاء" },
  thu: { en: "Thu", ar: "الخميس" },
  fri: { en: "Fri", ar: "الجمعة" },
  sat: { en: "Sat", ar: "السبت" },
};

type Ctx = {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (l: Lang) => void;
  t: (key: keyof typeof dict | string) => string;
  tv: (v: { en: string; ar: string } | undefined) => string;
};

const LangContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "mawid.lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "ar" || stored === "en") setLangState(stored);
  }, []);

  useEffect(() => {
    const dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.classList.toggle("font-arabic", lang === "ar");
  }, [lang]);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      setLang: (l) => {
        setLangState(l);
        window.localStorage.setItem(STORAGE_KEY, l);
      },
      t: (key) => dict[key as string]?.[lang] ?? (key as string),
      tv: (v) => (v ? v[lang] : ""),
    }),
    [lang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useI18n must be used inside LanguageProvider");
  return ctx;
}

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
