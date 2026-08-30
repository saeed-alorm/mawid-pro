import type { Appointment, Service } from "./demo-data";
import { normalizeLebanesePhone } from "./format";
import { employeeBusy, toMinutes, withDurations } from "./scheduling";

export type BookingProgress = {
  serviceId: string;
  employeeId: string;
  date: string;
  time: string;
  name: string;
  phone: string;
};

export function canAdvanceBookingStep(step: number, draft: BookingProgress) {
  switch (step) {
    case 1:
      return Boolean(draft.serviceId);
    case 2:
      return Boolean(draft.employeeId);
    case 3:
      return Boolean(draft.date && draft.time);
    case 4:
      return Boolean(draft.name.trim());
    case 5:
      return Boolean(normalizeLebanesePhone(draft.phone));
    default:
      return true;
  }
}

export type BookingDecision =
  | { type: "approve"; employeeId?: string }
  | { type: "reject" }
  | { type: "cancel" }
  | { type: "propose"; employeeId?: string; date: string; time: string }
  | { type: "accept_proposal" };

export type BookingDecisionResult =
  | { ok: true; appointments: Appointment[] }
  | { ok: false; reason: "missing" | "employee_required" | "slot_taken" | "proposal_missing" };

export function applyBookingDecision(
  appointments: Appointment[],
  services: Service[],
  bookingId: string,
  decision: BookingDecision,
): BookingDecisionResult {
  const current = appointments.find((appointment) => appointment.id === bookingId);
  if (!current) return { ok: false, reason: "missing" };

  if (decision.type === "reject" || decision.type === "cancel") {
    const status = decision.type === "reject" ? "rejected" : "cancelled";
    return {
      ok: true,
      appointments: appointments.map((appointment) =>
        appointment.id === bookingId ? { ...appointment, status } : appointment,
      ),
    };
  }

  const employeeId =
    decision.type === "approve" || decision.type === "propose"
      ? (decision.employeeId ?? current.employeeId)
      : current.employeeId;
  if (!employeeId || employeeId === "any") return { ok: false, reason: "employee_required" };

  const date =
    decision.type === "propose"
      ? decision.date
      : decision.type === "accept_proposal"
        ? current.proposedDate
        : current.date;
  const time =
    decision.type === "propose"
      ? decision.time
      : decision.type === "accept_proposal"
        ? current.proposedTime
        : current.time;
  if (!date || !time) return { ok: false, reason: "proposal_missing" };

  const duration = services.find((service) => service.id === current.serviceId)?.duration ?? 30;
  const start = toMinutes(time);
  if (
    employeeBusy(
      withDurations(appointments, services),
      employeeId,
      date,
      start,
      start + duration,
      bookingId,
    )
  ) {
    return { ok: false, reason: "slot_taken" };
  }

  return {
    ok: true,
    appointments: appointments.map((appointment) => {
      if (appointment.id !== bookingId) return appointment;
      if (decision.type === "propose") {
        return {
          ...appointment,
          employeeId,
          status: "proposed",
          proposedDate: date,
          proposedTime: time,
        };
      }
      if (decision.type === "accept_proposal") {
        const { proposedDate: _proposedDate, proposedTime: _proposedTime, ...rest } = appointment;
        return { ...rest, employeeId, status: "approved", date, time };
      }
      return { ...appointment, employeeId, status: "approved" };
    }),
  };
}
