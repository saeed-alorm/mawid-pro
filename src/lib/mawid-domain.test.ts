import { describe, expect, it } from "vitest";

import {
  beirutDate,
  beirutMinutes,
  type Appointment,
  type Employee,
  type Service,
} from "./demo-data";
import { getOverviewMetrics } from "./analytics";
import { normalizeLebanesePhone } from "./format";
import { dict } from "./i18n";
import { appPath } from "./navigation";
import { availableSlots, bookingAvailability } from "./scheduling";
import { DEMO_SCHEMA_VERSION, restoreDemoState, type DemoState } from "./store";
import { applyBookingDecision } from "./workflow";

const service: Service = {
  id: "service-1",
  salonId: "tenant-1",
  name: { en: "Haircut", ar: "قص شعر" },
  category: { en: "Hair", ar: "الشعر" },
  duration: 60,
  description: { en: "Precision cut", ar: "قص دقيق" },
};

const employee: Employee = {
  id: "employee-1",
  salonId: "tenant-1",
  name: { en: "Rima", ar: "ريما" },
  role: { en: "Stylist", ar: "مصففة" },
  bio: { en: "Stylist", ar: "مصففة" },
  photo: "/staff.jpg",
  specialties: { en: ["Cuts"], ar: ["قص"] },
  active: true,
  schedule: [null, { start: "09:00", end: "17:00" }, null, null, null, null, null],
  timeOff: [],
  serviceIds: [service.id],
};

const appointment = (
  id: string,
  status: Appointment["status"],
  date: string,
  time: string,
  phone = "71 000 001",
): Appointment => ({
  id,
  salonId: "tenant-1",
  employeeId: employee.id,
  serviceId: service.id,
  customerName: "Demo Customer",
  phone,
  date,
  time,
  status,
  createdAt: `${date}T08:00:00.000Z`,
});

describe("normalizeLebanesePhone", () => {
  it("normalizes Arabic numerals and the +961 prefix", () => {
    expect(normalizeLebanesePhone("+٩٦١ ٧١ ١٢٣ ٤٥٦")).toBe("71 123 456");
  });

  it("preserves the leading zero in a local 03 number", () => {
    expect(normalizeLebanesePhone("03 448 210")).toBe("03 448 210");
  });

  it("rejects numbers outside the supported Lebanese demo format", () => {
    expect(normalizeLebanesePhone("555")).toBeNull();
  });
});

describe("Beirut-local domain time", () => {
  it("rolls the business date forward at Beirut midnight", () => {
    const instant = new Date("2026-08-21T21:30:00.000Z");
    expect(beirutDate(instant)).toBe("2026-08-22");
    expect(beirutMinutes(instant)).toBe(30);
  });
});

describe("applyBookingDecision", () => {
  it("requires a manager to assign an employee to an any-professional request", () => {
    const pending = {
      ...appointment("pending", "pending", "2026-08-24", "10:00"),
      employeeId: "any",
    };
    const result = applyBookingDecision([pending], [service], pending.id, { type: "approve" });

    expect(result).toEqual({ ok: false, reason: "employee_required" });
  });

  it("rejects an approval that overlaps an existing appointment", () => {
    const existing = appointment("approved", "approved", "2026-08-24", "10:00");
    const pending = appointment("pending", "pending", "2026-08-24", "10:30", "71 000 002");
    const result = applyBookingDecision([existing, pending], [service], pending.id, {
      type: "approve",
      employeeId: employee.id,
    });

    expect(result).toEqual({ ok: false, reason: "slot_taken" });
  });

  it("moves an accepted proposal into the approved calendar slot", () => {
    const proposed = {
      ...appointment("proposal", "proposed", "2026-08-24", "10:00"),
      proposedDate: "2026-08-25",
      proposedTime: "14:00",
    };
    const result = applyBookingDecision([proposed], [service], proposed.id, {
      type: "accept_proposal",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointments[0]).toMatchObject({
        status: "approved",
        date: "2026-08-25",
        time: "14:00",
      });
    }
  });
});

describe("availableSlots", () => {
  it("marks closed dates unavailable while preserving the next bookable date", () => {
    const window = bookingAvailability(
      [employee],
      service,
      ["2026-08-23", "2026-08-24"],
      [],
      [service],
      new Date("2026-08-20T08:00:00"),
    );

    expect(window[0]).toEqual({ date: "2026-08-23", slots: [], available: false });
    expect(window[1]).toEqual({
      date: "2026-08-24",
      available: true,
      slots: [
        "09:00",
        "09:30",
        "10:00",
        "10:30",
        "11:00",
        "11:30",
        "12:00",
        "12:30",
        "13:00",
        "13:30",
        "14:00",
        "14:30",
        "15:00",
        "15:30",
        "16:00",
      ],
    });
  });

  it("blocks a slot while a reschedule proposal is awaiting the customer", () => {
    const proposed = appointment("proposal", "proposed", "2026-08-24", "10:00");

    expect(
      availableSlots(
        employee,
        service,
        "2026-08-24",
        [proposed],
        [service],
        new Date("2026-08-20T08:00:00"),
      ),
    ).not.toContain("10:00");
  });

  it("excludes breaks and temporary unavailable periods", () => {
    const scheduled: Employee = {
      ...employee,
      schedule: [
        null,
        { start: "09:00", end: "17:00", breakStart: "12:00", breakEnd: "13:00" },
        null,
        null,
        null,
        null,
        null,
      ],
      timeOff: [
        {
          id: "time-off",
          from: "2026-08-31",
          to: "2026-08-31",
          reason: { en: "Training", ar: "تدريب" },
        },
      ],
    };

    const workingDay = availableSlots(
      scheduled,
      service,
      "2026-08-24",
      [],
      [service],
      new Date("2026-08-20T08:00:00"),
    );
    expect(workingDay).not.toContain("11:30");
    expect(
      availableSlots(
        scheduled,
        service,
        "2026-08-31",
        [],
        [service],
        new Date("2026-08-20T08:00:00"),
      ),
    ).toEqual([]);
  });
});

describe("getOverviewMetrics", () => {
  it("derives operational KPIs from tenant bookings", () => {
    const bookings = [
      appointment("today-approved", "approved", "2026-08-21", "10:00", "71 000 001"),
      appointment("today-pending", "pending", "2026-08-21", "12:00", "71 000 002"),
      appointment("completed-one", "completed", "2026-08-18", "11:00", "71 000 001"),
      appointment("completed-two", "completed", "2026-08-19", "11:00", "71 000 001"),
      appointment("cancelled", "cancelled", "2026-08-20", "15:00", "71 000 003"),
    ];

    expect(getOverviewMetrics(bookings, [employee], [service], "2026-08-21")).toMatchObject({
      todayBookings: 2,
      pendingRequests: 1,
      weeklyBookings: 5,
      cancellationRate: 25,
      returningCustomers: 1,
      peakHour: "11:00",
    });
  });
});

describe("connected booking continuity", () => {
  it("moves a customer request into the manager calendar and metrics after approval", () => {
    const submitted: Appointment = {
      ...appointment("customer-request", "pending", "2026-08-21", "15:00", "71 000 004"),
      employeeId: "any",
      customerName: "Connected Demo",
    };
    const before = getOverviewMetrics([submitted], [employee], [service], "2026-08-21");
    const decision = applyBookingDecision([submitted], [service], submitted.id, {
      type: "approve",
      employeeId: employee.id,
    });

    expect(before.pendingRequests).toBe(1);
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      const approved = decision.appointments[0];
      expect(approved).toMatchObject({ status: "approved", employeeId: employee.id });
      expect(
        decision.appointments.filter(
          (item) => item.status === "approved" && item.employeeId === employee.id,
        ),
      ).toHaveLength(1);
      expect(
        getOverviewMetrics(decision.appointments, [employee], [service], "2026-08-21"),
      ).toMatchObject({
        pendingRequests: 0,
        todayBookings: 1,
      });
    }
  });
});

describe("local persistence", () => {
  const fallback: DemoState = {
    schemaVersion: DEMO_SCHEMA_VERSION,
    tenantId: "tenant-1",
    employees: [],
    appointments: [],
    salons: [],
    customerPhone: null,
    customerName: null,
    activityEvents: [],
  };

  it("falls back safely when local storage is corrupt", () => {
    expect(restoreDemoState("{not-json", fallback)).toBe(fallback);
  });

  it("migrates an earlier demo snapshot to the current schema", () => {
    const oldSnapshot = JSON.stringify({
      ...fallback,
      schemaVersion: undefined,
      activityEvents: undefined,
    });

    expect(restoreDemoState(oldSnapshot, fallback)).toMatchObject({
      schemaVersion: DEMO_SCHEMA_VERSION,
      activityEvents: [],
    });
  });
});

describe("translations", () => {
  it("keeps every interface key populated in English and Arabic", () => {
    for (const [key, translation] of Object.entries(dict)) {
      expect(translation.en.trim(), `${key}.en`).not.toBe("");
      expect(translation.ar.trim(), `${key}.ar`).not.toBe("");
    }
  });
});

describe("repository-base navigation", () => {
  it("prefixes application routes for a GitHub Pages project site", () => {
    expect(appPath("/customer/studio-nine/book", "/mawid-pro/")).toBe(
      "/mawid-pro/customer/studio-nine/book",
    );
    expect(appPath("/", "/mawid-pro/")).toBe("/mawid-pro/");
  });
});
