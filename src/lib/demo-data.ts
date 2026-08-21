import coverStudioNine from "@/assets/cover-studio-nine.jpg";
import coverCedarSteel from "@/assets/cover-cedar-steel.jpg";
import coverMaisonLuma from "@/assets/cover-maison-luma.jpg";
import staff1 from "@/assets/staff-1.jpg";
import staff2 from "@/assets/staff-2.jpg";
import staff3 from "@/assets/staff-3.jpg";
import staff4 from "@/assets/staff-4.jpg";
import staff5 from "@/assets/staff-5.jpg";
import staff6 from "@/assets/staff-6.jpg";

export type Bi = { en: string; ar: string };

export type DayShift = {
  start: string;
  end: string;
  breakStart?: string;
  breakEnd?: string;
} | null;
export type WeekSchedule = DayShift[]; // index 0 = Sunday

export type Salon = {
  id: string;
  name: Bi;
  kind: Bi;
  intro: Bi;
  address: Bi;
  hours: Bi;
  cover: string;
  accent: string; // oklch value
  initials: string;
  phone: string;
};

export type Service = {
  id: string;
  salonId: string;
  name: Bi;
  category: Bi;
  duration: number;
  description: Bi;
};

export type TimeOff = {
  id: string;
  from: string;
  to: string;
  reason: Bi | { en: string; ar: string };
};

export type Employee = {
  id: string;
  salonId: string;
  name: Bi;
  role: Bi;
  bio: Bi;
  photo: string;
  specialties: { en: string[]; ar: string[] };
  active: boolean;
  schedule: WeekSchedule;
  timeOff: TimeOff[];
  serviceIds: string[];
};

export type BookingStatus =
  "pending" | "approved" | "rejected" | "cancelled" | "completed" | "proposed";

export type Appointment = {
  id: string;
  salonId: string;
  employeeId: string;
  serviceId: string;
  customerName: string;
  phone: string;
  date: string; // yyyy-mm-dd
  time: string; // HH:mm
  status: BookingStatus;
  createdAt: string; // ISO
  proposedDate?: string;
  proposedTime?: string;
  note?: string;
};

export const DEMO_OTP = "123456";

export function beirutDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Beirut",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function beirutMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Beirut",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(value.hour) * 60 + Number(value.minute);
}

export const salons: Salon[] = [
  {
    id: "studio-nine",
    name: { en: "Studio Nine", ar: "ستوديو ناين" },
    kind: { en: "Premium unisex salon", ar: "صالون راقٍ للجنسين" },
    intro: {
      en: "A calm, design-led salon in Achrafieh offering precision cutting, colour and treatments for everyone.",
      ar: "صالون هادئ بتصميم عصري في الأشرفية يقدّم قصات دقيقة وصبغات وعلاجات للجميع.",
    },
    address: { en: "Rue Sursock, Achrafieh, Beirut", ar: "شارع سرسق، الأشرفية، بيروت" },
    hours: { en: "Tue – Sun · 09:00 – 19:00", ar: "الثلاثاء – الأحد · ٠٩:٠٠ – ١٩:٠٠" },
    cover: coverStudioNine,
    accent: "oklch(0.45 0.1 168)",
    initials: "S9",
    phone: "01 204 918",
  },
  {
    id: "cedar-steel",
    name: { en: "Cedar & Steel", ar: "سيدر آند ستيل" },
    kind: { en: "Men's barbershop", ar: "حلاق رجالي" },
    intro: {
      en: "A classic Beirut barbershop built on hot towels, sharp fades and a proper beard ritual.",
      ar: "حلاق بيروتي كلاسيكي يعتمد على المناشف الساخنة والقصات الدقيقة وطقوس العناية باللحية.",
    },
    address: { en: "Mar Mikhael, Armenia Street, Beirut", ar: "مار مخايل، شارع أرمينيا، بيروت" },
    hours: { en: "Mon – Sat · 10:00 – 20:00", ar: "الاثنين – السبت · ١٠:٠٠ – ٢٠:٠٠" },
    cover: coverCedarSteel,
    accent: "oklch(0.5 0.07 55)",
    initials: "C&S",
    phone: "01 566 340",
  },
  {
    id: "maison-luma",
    name: { en: "Maison Luma", ar: "ميزون لوما" },
    kind: { en: "Women's hair & beauty", ar: "شعر وتجميل نسائي" },
    intro: {
      en: "A bright Jounieh atelier for balayage, bridal styling and restorative hair care.",
      ar: "أتيليه مشرق في جونية للبالاياج وتصفيف العرائس والعناية المرمّمة بالشعر.",
    },
    address: { en: "Kaslik Boulevard, Jounieh", ar: "جادة الكسليك، جونية" },
    hours: { en: "Tue – Sun · 10:00 – 19:00", ar: "الثلاثاء – الأحد · ١٠:٠٠ – ١٩:٠٠" },
    cover: coverMaisonLuma,
    accent: "oklch(0.6 0.09 25)",
    initials: "ML",
    phone: "09 831 776",
  },
];

const svc = (
  salonId: string,
  id: string,
  en: string,
  ar: string,
  cat: Bi,
  duration: number,
  den: string,
  dar: string,
): Service => ({
  id,
  salonId,
  name: { en, ar },
  category: cat,
  duration,
  description: { en: den, ar: dar },
});

const CAT = {
  hair: { en: "Hair", ar: "الشعر" },
  colour: { en: "Colour", ar: "الصبغ" },
  beard: { en: "Beard", ar: "اللحية" },
  care: { en: "Treatments", ar: "العلاجات" },
  styling: { en: "Styling", ar: "التصفيف" },
};

export const services: Service[] = [
  // Studio Nine
  svc(
    "studio-nine",
    "s9-cut",
    "Precision haircut",
    "قصّة دقيقة",
    CAT.hair,
    45,
    "Consultation, wash and a tailored cut finished with light styling.",
    "استشارة وغسيل وقصّة مفصّلة مع تصفيف خفيف.",
  ),
  svc(
    "studio-nine",
    "s9-blow",
    "Blow-dry",
    "سيشوار",
    CAT.styling,
    30,
    "Smooth or volumised blow-dry for any hair length.",
    "سيشوار ناعم أو بحجم إضافي لكل أطوال الشعر.",
  ),
  svc(
    "studio-nine",
    "s9-colour",
    "Full colour",
    "صبغة كاملة",
    CAT.colour,
    90,
    "Single-process colour with a bond-protecting finish.",
    "صبغة بلون واحد مع علاج حامٍ لألياف الشعر.",
  ),
  svc(
    "studio-nine",
    "s9-treat",
    "Deep hair treatment",
    "علاج عميق للشعر",
    CAT.care,
    45,
    "Steam-assisted mask for dry or over-processed hair.",
    "ماسك بالبخار للشعر الجاف أو المعالج بكثرة.",
  ),
  svc(
    "studio-nine",
    "s9-beard",
    "Beard trim",
    "تهذيب اللحية",
    CAT.beard,
    20,
    "Shape-up and line detailing with beard oil.",
    "تحديد وتهذيب مع زيت اللحية.",
  ),
  // Cedar & Steel
  svc(
    "cedar-steel",
    "cs-cut",
    "Signature haircut",
    "قصّة السيغنتشر",
    CAT.hair,
    40,
    "Scissor and clipper cut finished with a hot towel.",
    "قصّة بالمقص والماكينة مع منشفة ساخنة.",
  ),
  svc(
    "cedar-steel",
    "cs-skin",
    "Skin fade",
    "تدرّج قصير",
    CAT.hair,
    45,
    "Clean gradient fade with sharp line work.",
    "تدرّج نظيف مع تحديد دقيق للخطوط.",
  ),
  svc(
    "cedar-steel",
    "cs-beard",
    "Beard styling",
    "تصميم اللحية",
    CAT.beard,
    30,
    "Full beard shaping, trim and conditioning.",
    "تشكيل كامل للحية مع تهذيب وترطيب.",
  ),
  svc(
    "cedar-steel",
    "cs-shave",
    "Hot towel shave",
    "حلاقة بالمنشفة الساخنة",
    CAT.beard,
    35,
    "Traditional straight-razor shave with hot towels.",
    "حلاقة تقليدية بالموس مع مناشف ساخنة.",
  ),
  svc(
    "cedar-steel",
    "cs-kid",
    "Father & son cut",
    "قصّة الأب والابن",
    CAT.hair,
    55,
    "Back-to-back cuts for a father and one child.",
    "قصتان متتاليتان للأب وطفل واحد.",
  ),
  // Maison Luma
  svc(
    "maison-luma",
    "ml-cut",
    "Women's cut & finish",
    "قصّ وتصفيف نسائي",
    CAT.hair,
    60,
    "Consultation, cut and blow-dry finish.",
    "استشارة وقصّ وتصفيف بالسيشوار.",
  ),
  svc(
    "maison-luma",
    "ml-balayage",
    "Balayage",
    "بالاياج",
    CAT.colour,
    120,
    "Hand-painted lightening with a soft grown-out finish.",
    "تفتيح يدوي بنتيجة طبيعية متدرّجة.",
  ),
  svc(
    "maison-luma",
    "ml-gloss",
    "Colour gloss",
    "لمعة اللون",
    CAT.colour,
    45,
    "Tone refresh that adds shine between colour visits.",
    "تجديد اللون ولمعان بين مواعيد الصبغ.",
  ),
  svc(
    "maison-luma",
    "ml-bridal",
    "Bridal styling",
    "تصفيف العرائس",
    CAT.styling,
    90,
    "Occasion upstyle with a pre-event consultation.",
    "تسريحة مناسبات مع استشارة قبل المناسبة.",
  ),
  svc(
    "maison-luma",
    "ml-keratin",
    "Keratin treatment",
    "علاج الكيراتين",
    CAT.care,
    120,
    "Smoothing treatment for frizz control.",
    "علاج تنعيم للتحكم بالتجعّد.",
  ),
];

const full = (start: string, end: string, breakStart?: string, breakEnd?: string): DayShift => ({
  start,
  end,
  breakStart,
  breakEnd,
});

export const employees: Employee[] = [
  {
    id: "e-rima",
    salonId: "studio-nine",
    name: { en: "Rima Haddad", ar: "ريما حداد" },
    role: { en: "Senior stylist", ar: "مصفّفة أولى" },
    bio: {
      en: "Twelve years behind the chair with a focus on precision cutting and curly hair.",
      ar: "اثنتا عشرة سنة من الخبرة مع تركيز على القصّات الدقيقة والشعر المجعّد.",
    },
    photo: staff1,
    specialties: {
      en: ["Precision cuts", "Curly hair", "Treatments"],
      ar: ["قصّات دقيقة", "شعر مجعّد", "علاجات"],
    },
    active: true,
    schedule: [
      null,
      full("09:00", "17:00", "13:00", "13:30"),
      full("09:00", "18:00", "13:00", "13:30"),
      full("09:00", "18:00", "13:00", "13:30"),
      full("10:00", "19:00", "14:00", "14:30"),
      full("10:00", "19:00"),
      null,
    ],
    timeOff: [],
    serviceIds: ["s9-cut", "s9-blow", "s9-treat", "s9-colour"],
  },
  {
    id: "e-karim",
    salonId: "studio-nine",
    name: { en: "Karim Nassar", ar: "كريم نصار" },
    role: { en: "Creative director", ar: "المدير الإبداعي" },
    bio: {
      en: "Founder of Studio Nine, known for editorial styling and colour correction.",
      ar: "مؤسس ستوديو ناين، معروف بالتصفيف التحريري وتصحيح الألوان.",
    },
    photo: staff6,
    specialties: {
      en: ["Colour correction", "Editorial styling", "Beard"],
      ar: ["تصحيح اللون", "تصفيف تحريري", "لحية"],
    },
    active: true,
    schedule: [
      full("11:00", "17:00"),
      null,
      full("10:00", "18:00", "14:00", "15:00"),
      full("10:00", "18:00", "14:00", "15:00"),
      full("10:00", "18:00"),
      full("11:00", "19:00"),
      null,
    ],
    timeOff: [],
    serviceIds: ["s9-cut", "s9-colour", "s9-beard", "s9-blow"],
  },
  {
    id: "e-ziad",
    salonId: "cedar-steel",
    name: { en: "Ziad Khoury", ar: "زياد خوري" },
    role: { en: "Barber", ar: "حلاق" },
    bio: {
      en: "Fade specialist trained in Beirut and Istanbul, fast hands and a steady line.",
      ar: "مختص بالتدرّجات، تدرّب في بيروت وإسطنبول، بسرعة ودقة في الخطوط.",
    },
    photo: staff2,
    specialties: {
      en: ["Skin fades", "Classic cuts", "Beard"],
      ar: ["تدرّجات قصيرة", "قصّات كلاسيكية", "لحية"],
    },
    active: true,
    schedule: [
      null,
      full("10:00", "19:00", "14:00", "14:30"),
      full("10:00", "19:00", "14:00", "14:30"),
      full("10:00", "19:00"),
      full("11:00", "20:00"),
      full("11:00", "20:00"),
      full("10:00", "18:00"),
    ],
    timeOff: [],
    serviceIds: ["cs-cut", "cs-skin", "cs-beard", "cs-kid"],
  },
  {
    id: "e-elias",
    salonId: "cedar-steel",
    name: { en: "Elias Rahme", ar: "إلياس رحمة" },
    role: { en: "Master barber", ar: "حلاق أول" },
    bio: {
      en: "Straight-razor purist. Runs the shop's shave ritual and trains new barbers.",
      ar: "متمسّك بالحلاقة بالموس. يشرف على طقوس الحلاقة ويدرّب الحلاقين الجدد.",
    },
    photo: staff4,
    specialties: {
      en: ["Hot towel shave", "Beard design", "Classic cuts"],
      ar: ["حلاقة بالمنشفة الساخنة", "تصميم اللحية", "قصّات كلاسيكية"],
    },
    active: true,
    schedule: [
      null,
      full("10:00", "18:00"),
      null,
      full("10:00", "19:00", "13:30", "14:00"),
      full("10:00", "19:00", "13:30", "14:00"),
      full("10:00", "20:00"),
      full("10:00", "19:00"),
    ],
    timeOff: [],
    serviceIds: ["cs-cut", "cs-shave", "cs-beard", "cs-skin"],
  },
  {
    id: "e-nadine",
    salonId: "maison-luma",
    name: { en: "Nadine Aoun", ar: "نادين عون" },
    role: { en: "Colour specialist", ar: "مختصة ألوان" },
    bio: {
      en: "Balayage and blonde work, with a gentle approach to lightening fragile hair.",
      ar: "متخصصة في البالاياج والأشقر مع أسلوب لطيف لتفتيح الشعر الحساس.",
    },
    photo: staff3,
    specialties: {
      en: ["Balayage", "Blonde", "Colour gloss"],
      ar: ["بالاياج", "أشقر", "لمعة اللون"],
    },
    active: true,
    schedule: [
      full("10:00", "17:00"),
      null,
      full("10:00", "18:00", "13:00", "14:00"),
      full("10:00", "18:00", "13:00", "14:00"),
      full("10:00", "19:00"),
      full("10:00", "19:00"),
      null,
    ],
    timeOff: [],
    serviceIds: ["ml-balayage", "ml-gloss", "ml-cut", "ml-keratin"],
  },
  {
    id: "e-lara",
    salonId: "maison-luma",
    name: { en: "Lara Bassil", ar: "لارا باسيل" },
    role: { en: "Stylist & bridal specialist", ar: "مصفّفة ومختصة عرائس" },
    bio: {
      en: "Occasion styling and smoothing treatments, with a full bridal trial process.",
      ar: "تصفيف المناسبات وعلاجات التنعيم مع جلسة تجربة كاملة للعرائس.",
    },
    photo: staff5,
    specialties: {
      en: ["Bridal", "Upstyles", "Keratin"],
      ar: ["عرائس", "تسريحات مرفوعة", "كيراتين"],
    },
    active: true,
    schedule: [
      full("10:00", "18:00"),
      null,
      full("11:00", "19:00"),
      full("11:00", "19:00", "14:00", "14:30"),
      full("10:00", "18:00"),
      full("10:00", "19:00"),
      null,
    ],
    timeOff: [],
    serviceIds: ["ml-cut", "ml-bridal", "ml-keratin", "ml-gloss"],
  },
];

export function iso(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

type Seed = [
  offset: number,
  time: string,
  employeeId: string,
  serviceId: string,
  name: string,
  phone: string,
  status: BookingStatus,
];

const seeds: Seed[] = [
  // Studio Nine
  [-12, "10:00", "e-rima", "s9-cut", "Maya Chahine", "03 448 210", "completed"],
  [-9, "15:00", "e-karim", "s9-colour", "Joelle Tabet", "71 902 334", "completed"],
  [-7, "11:30", "e-rima", "s9-blow", "Maya Chahine", "03 448 210", "completed"],
  [-5, "12:00", "e-karim", "s9-beard", "Fadi Gerges", "76 118 442", "cancelled"],
  [-3, "16:00", "e-rima", "s9-treat", "Rana Melki", "03 776 015", "completed"],
  [-1, "10:30", "e-karim", "s9-cut", "Tarek Sabbagh", "70 335 908", "completed"],
  [0, "11:00", "e-rima", "s9-cut", "Maya Chahine", "03 448 210", "approved"],
  [0, "14:00", "e-karim", "s9-colour", "Zeina Frem", "71 604 227", "approved"],
  [0, "16:30", "e-rima", "s9-blow", "Rana Melki", "03 776 015", "pending"],
  [1, "10:00", "e-karim", "s9-cut", "Hadi Aziz", "76 220 981", "pending"],
  [1, "13:30", "e-rima", "s9-treat", "Joelle Tabet", "71 902 334", "approved"],
  [2, "15:00", "e-karim", "s9-blow", "Nour Daher", "03 991 128", "proposed"],
  [3, "11:00", "e-rima", "s9-cut", "Tarek Sabbagh", "70 335 908", "approved"],
  [4, "12:00", "e-karim", "s9-beard", "Fadi Gerges", "76 118 442", "pending"],
  [6, "10:30", "e-rima", "s9-colour", "Zeina Frem", "71 604 227", "approved"],
  // Cedar & Steel
  [-11, "11:00", "e-ziad", "cs-skin", "Georges Matta", "70 442 118", "completed"],
  [-8, "17:00", "e-elias", "cs-shave", "Marwan Habib", "03 220 774", "completed"],
  [-6, "12:30", "e-ziad", "cs-cut", "Georges Matta", "70 442 118", "completed"],
  [-4, "18:00", "e-elias", "cs-beard", "Samer Kanaan", "76 553 019", "cancelled"],
  [-2, "13:00", "e-ziad", "cs-skin", "Rabih Antoun", "71 337 806", "completed"],
  [0, "12:00", "e-ziad", "cs-cut", "Marwan Habib", "03 220 774", "approved"],
  [0, "15:30", "e-elias", "cs-shave", "Samer Kanaan", "76 553 019", "pending"],
  [0, "17:00", "e-ziad", "cs-beard", "Rabih Antoun", "71 337 806", "approved"],
  [1, "11:00", "e-elias", "cs-cut", "Karam Younes", "70 819 442", "pending"],
  [2, "16:00", "e-ziad", "cs-skin", "Georges Matta", "70 442 118", "approved"],
  [3, "14:00", "e-elias", "cs-beard", "Ali Chamoun", "03 662 190", "proposed"],
  [4, "10:30", "e-ziad", "cs-kid", "Marwan Habib", "03 220 774", "approved"],
  [5, "18:30", "e-elias", "cs-shave", "Karam Younes", "70 819 442", "pending"],
  // Maison Luma
  [-13, "11:00", "e-nadine", "ml-balayage", "Carla Sfeir", "03 512 664", "completed"],
  [-10, "14:00", "e-lara", "ml-bridal", "Yara Aoun", "71 448 273", "completed"],
  [-6, "12:00", "e-nadine", "ml-gloss", "Carla Sfeir", "03 512 664", "completed"],
  [-4, "15:00", "e-lara", "ml-cut", "Dana Rizk", "76 907 331", "cancelled"],
  [-2, "10:30", "e-nadine", "ml-cut", "Perla Khalil", "70 226 558", "completed"],
  [0, "10:30", "e-nadine", "ml-gloss", "Dana Rizk", "76 907 331", "approved"],
  [0, "13:00", "e-lara", "ml-keratin", "Yara Aoun", "71 448 273", "approved"],
  [0, "16:00", "e-nadine", "ml-cut", "Perla Khalil", "70 226 558", "pending"],
  [1, "11:00", "e-lara", "ml-bridal", "Sarah Nehme", "03 884 102", "pending"],
  [2, "12:00", "e-nadine", "ml-balayage", "Carla Sfeir", "03 512 664", "approved"],
  [3, "15:00", "e-lara", "ml-cut", "Maya Semaan", "71 550 447", "proposed"],
  [5, "11:30", "e-nadine", "ml-gloss", "Perla Khalil", "70 226 558", "approved"],
  [7, "13:00", "e-lara", "ml-keratin", "Sarah Nehme", "03 884 102", "pending"],
];

export function buildAppointments(): Appointment[] {
  const today = new Date(`${beirutDate()}T12:00:00`);
  today.setHours(0, 0, 0, 0);
  return seeds.map((s, i) => {
    const [offset, time, employeeId, serviceId, customerName, phone, status] = s;
    const employee = employees.find((e) => e.id === employeeId)!;
    const date = iso(addDays(today, offset));
    const created = new Date(today);
    created.setDate(created.getDate() + offset - 2);
    created.setHours(9 + (i % 9), (i * 7) % 60, 0, 0);
    const appt: Appointment = {
      id: `seed-${i}`,
      salonId: employee.salonId,
      employeeId,
      serviceId,
      customerName,
      phone,
      date,
      time,
      status,
      createdAt: created.toISOString(),
    };
    if (status === "proposed") {
      appt.proposedDate = iso(addDays(today, offset + 1));
      appt.proposedTime = "17:00";
    }
    return appt;
  });
}
