import type { Appointment, Employee, Service } from "./demo-data";

export type OverviewMetrics = {
  todayBookings: number;
  pendingRequests: number;
  weeklyBookings: number;
  cancellationRate: number;
  returningCustomers: number;
  peakHour: string;
  utilization: number;
};

function startOfWeek(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  const offset = date.getDay() === 0 ? -6 : 1 - date.getDay();
  date.setDate(date.getDate() + offset);
  return date;
}

function iso(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getOverviewMetrics(
  appointments: Appointment[],
  employees: Employee[],
  services: Service[],
  today: string,
): OverviewMetrics {
  const weekStart = startOfWeek(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekly = appointments.filter(
    (appointment) => appointment.date >= iso(weekStart) && appointment.date <= iso(weekEnd),
  );
  const decided = weekly.filter((appointment) =>
    ["approved", "completed", "cancelled"].includes(appointment.status),
  );
  const cancelled = decided.filter((appointment) => appointment.status === "cancelled").length;
  const completedByPhone = appointments
    .filter((appointment) => appointment.status === "completed")
    .reduce<Record<string, number>>((counts, appointment) => {
      counts[appointment.phone] = (counts[appointment.phone] ?? 0) + 1;
      return counts;
    }, {});
  const hours = appointments.reduce<Record<string, number>>((counts, appointment) => {
    counts[appointment.time] = (counts[appointment.time] ?? 0) + 1;
    return counts;
  }, {});
  const peakHour = Object.entries(hours).sort(
    ([timeA, countA], [timeB, countB]) => countB - countA || timeA.localeCompare(timeB),
  )[0]?.[0];

  const activeMinutes = appointments
    .filter((appointment) => ["approved", "completed"].includes(appointment.status))
    .reduce(
      (total, appointment) =>
        total + (services.find((service) => service.id === appointment.serviceId)?.duration ?? 30),
      0,
    );
  const weeklyCapacity = employees.reduce((total, employee) => {
    return (
      total +
      employee.schedule.reduce((minutes, shift) => {
        if (!shift) return minutes;
        const [startHour = 0, startMinute = 0] = shift.start.split(":").map(Number);
        const [endHour = 0, endMinute = 0] = shift.end.split(":").map(Number);
        const breakMinutes =
          shift.breakStart && shift.breakEnd
            ? Number(shift.breakEnd.slice(0, 2)) * 60 +
              Number(shift.breakEnd.slice(3)) -
              (Number(shift.breakStart.slice(0, 2)) * 60 + Number(shift.breakStart.slice(3)))
            : 0;
        return minutes + endHour * 60 + endMinute - (startHour * 60 + startMinute) - breakMinutes;
      }, 0)
    );
  }, 0);

  return {
    todayBookings: appointments.filter(
      (appointment) =>
        appointment.date === today && !["cancelled", "rejected"].includes(appointment.status),
    ).length,
    pendingRequests: appointments.filter((appointment) => appointment.status === "pending").length,
    weeklyBookings: weekly.length,
    cancellationRate: decided.length ? Math.round((cancelled / decided.length) * 100) : 0,
    returningCustomers: Object.values(completedByPhone).filter((count) => count >= 2).length,
    peakHour: peakHour ?? "—",
    utilization: weeklyCapacity
      ? Math.min(100, Math.round((activeMinutes / weeklyCapacity) * 100))
      : 0,
  };
}
