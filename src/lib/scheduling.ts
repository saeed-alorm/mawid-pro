import type { Appointment, Employee, Service } from "./demo-data";
import { iso } from "./demo-data";

export const BLOCKING_STATUSES = ["pending", "approved", "completed"];

export function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function toTime(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${`${h}`.padStart(2, "0")}:${`${m}`.padStart(2, "0")}`;
}

export function dayIndex(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

export function isOnTimeOff(employee: Employee, dateStr: string) {
  return employee.timeOff.some((t) => dateStr >= t.from && dateStr <= t.to);
}

export function employeeBusy(
  appointments: Appointment[],
  employeeId: string,
  dateStr: string,
  start: number,
  end: number,
  ignoreId?: string,
) {
  return appointments.some((a) => {
    if (a.employeeId !== employeeId || a.date !== dateStr || a.id === ignoreId) return false;
    if (!BLOCKING_STATUSES.includes(a.status)) return false;
    const s = toMinutes(a.time);
    const e = s + (a.durationCache ?? 30);
    return start < e && end > s;
  });
}

type WithDuration = Appointment & { durationCache?: number };

export function withDurations(appointments: Appointment[], services: Service[]): WithDuration[] {
  return appointments.map((a) => ({
    ...a,
    durationCache: services.find((s) => s.id === a.serviceId)?.duration ?? 30,
  }));
}

export function availableSlots(
  employee: Employee,
  service: Service,
  dateStr: string,
  appointments: Appointment[],
  services: Service[],
  now = new Date(),
): string[] {
  if (!employee.active) return [];
  const shift = employee.schedule[dayIndex(dateStr)];
  if (!shift) return [];
  if (isOnTimeOff(employee, dateStr)) return [];

  const withDur = withDurations(appointments, services);
  const open = toMinutes(shift.start);
  const close = toMinutes(shift.end);
  const bs = shift.breakStart ? toMinutes(shift.breakStart) : null;
  const be = shift.breakEnd ? toMinutes(shift.breakEnd) : null;
  const nowIso = iso(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const slots: string[] = [];
  for (let start = open; start + service.duration <= close; start += 30) {
    const end = start + service.duration;
    if (bs !== null && be !== null && start < be && end > bs) continue;
    if (dateStr === nowIso && start <= nowMin) continue;
    if (dateStr < nowIso) continue;
    if (employeeBusy(withDur, employee.id, dateStr, start, end)) continue;
    slots.push(toTime(start));
  }
  return slots;
}

export function nextDays(count: number, from = new Date()): string[] {
  const out: string[] = [];
  const base = new Date(from);
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    out.push(iso(d));
  }
  return out;
}
