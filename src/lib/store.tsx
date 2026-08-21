import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildAppointments,
  employees as baseEmployees,
  salons as baseSalons,
  services,
  type Appointment,
  type BookingStatus,
  type Employee,
  type Salon,
  type TimeOff,
  type WeekSchedule,
} from "./demo-data";
import { applyBookingDecision, type BookingDecision, type BookingDecisionResult } from "./workflow";

const STORAGE_KEY = "mawid.demo.v1";
export const DEMO_SCHEMA_VERSION = 1;

export type ActivityEvent = {
  id: string;
  salonId: string;
  bookingId?: string;
  type:
    | "booking_submitted"
    | "booking_approved"
    | "booking_rejected"
    | "time_proposed"
    | "booking_cancelled";
  createdAt: string;
};

export type DemoState = {
  schemaVersion: number;
  tenantId: string;
  employees: Employee[];
  appointments: Appointment[];
  salons: Salon[];
  customerPhone: string | null;
  customerName: string | null;
  activityEvents: ActivityEvent[];
};

function initialState(): DemoState {
  return {
    schemaVersion: DEMO_SCHEMA_VERSION,
    tenantId: baseSalons[0].id,
    employees: JSON.parse(JSON.stringify(baseEmployees)) as Employee[],
    appointments: buildAppointments(),
    salons: JSON.parse(JSON.stringify(baseSalons)) as Salon[],
    customerPhone: null,
    customerName: null,
    activityEvents: [],
  };
}

export function restoreDemoState(raw: string | null, fallback: DemoState): DemoState {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    if (
      !Array.isArray(parsed.appointments) ||
      !Array.isArray(parsed.employees) ||
      !Array.isArray(parsed.salons)
    ) {
      return fallback;
    }
    return {
      ...fallback,
      ...parsed,
      schemaVersion: DEMO_SCHEMA_VERSION,
      activityEvents: Array.isArray(parsed.activityEvents) ? parsed.activityEvents : [],
    };
  } catch {
    return fallback;
  }
}

type Ctx = {
  ready: boolean;
  state: DemoState;
  salon: Salon;
  salons: Salon[];
  employees: Employee[]; // tenant scoped
  services: typeof services;
  appointments: Appointment[]; // tenant scoped
  setTenant: (id: string) => void;
  createBooking: (input: {
    employeeId: string;
    serviceId: string;
    date: string;
    time: string;
    customerName: string;
    phone: string;
  }) => Appointment;
  decideBooking: (id: string, decision: BookingDecision) => BookingDecisionResult;
  setStatus: (id: string, status: BookingStatus) => void;
  proposeTime: (id: string, date: string, time: string) => void;
  acceptProposal: (id: string) => void;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  setEmployeeSchedule: (id: string, schedule: WeekSchedule) => void;
  addTimeOff: (id: string, timeOff: TimeOff) => void;
  removeTimeOff: (employeeId: string, timeOffId: string) => void;
  updateSalon: (id: string, patch: Partial<Salon>) => void;
  signIn: (phone: string, name?: string) => void;
  signOut: () => void;
  reset: () => void;
};

const StoreContext = createContext<Ctx | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(() => initialState());
  const stateRef = useRef(state);
  stateRef.current = state;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState((fallback) => restoreDemoState(window.localStorage.getItem(STORAGE_KEY), fallback));
    setReady(true);
  }, []);

  useEffect(() => {
    const syncFromAnotherTab = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        setState((fallback) => restoreDemoState(event.newValue, fallback));
      } catch {
        /* keep the last valid local state */
      }
    };
    window.addEventListener("storage", syncFromAnotherTab);
    return () => window.removeEventListener("storage", syncFromAnotherTab);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, ready]);

  const commitState = useCallback((recipe: (current: DemoState) => DemoState) => {
    const next = recipe(stateRef.current);
    stateRef.current = next;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setState(next);
  }, []);

  const patchAppointment = useCallback(
    (id: string, patch: Partial<Appointment>) => {
      commitState((s) => ({
        ...s,
        appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      }));
    },
    [commitState],
  );

  const value = useMemo<Ctx>(() => {
    const salon = state.salons.find((s) => s.id === state.tenantId) ?? state.salons[0];
    return {
      ready,
      state,
      salon,
      salons: state.salons,
      employees: state.employees.filter((e) => e.salonId === state.tenantId),
      services,
      appointments: state.appointments.filter((a) => a.salonId === state.tenantId),
      setTenant: (id) => commitState((s) => ({ ...s, tenantId: id })),
      createBooking: (input) => {
        const appt: Appointment = {
          id: `bk-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          salonId: state.tenantId,
          status: "pending",
          createdAt: new Date().toISOString(),
          ...input,
        };
        commitState((s) => ({
          ...s,
          appointments: [...s.appointments, appt],
          activityEvents: [
            ...s.activityEvents,
            {
              id: `event-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              salonId: s.tenantId,
              bookingId: appt.id,
              type: "booking_submitted",
              createdAt: new Date().toISOString(),
            },
          ],
        }));
        return appt;
      },
      decideBooking: (id, decision) => {
        const result = applyBookingDecision(state.appointments, services, id, decision);
        if (result.ok) {
          const booking = result.appointments.find((appointment) => appointment.id === id);
          const eventType: ActivityEvent["type"] =
            decision.type === "approve" || decision.type === "accept_proposal"
              ? "booking_approved"
              : decision.type === "reject"
                ? "booking_rejected"
                : decision.type === "propose"
                  ? "time_proposed"
                  : "booking_cancelled";
          commitState((current) => ({
            ...current,
            appointments: result.appointments,
            activityEvents: booking
              ? [
                  ...current.activityEvents,
                  {
                    id: `event-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    salonId: booking.salonId,
                    bookingId: booking.id,
                    type: eventType,
                    createdAt: new Date().toISOString(),
                  },
                ]
              : current.activityEvents,
          }));
        }
        return result;
      },
      setStatus: (id, status) => patchAppointment(id, { status }),
      proposeTime: (id, date, time) =>
        patchAppointment(id, { status: "proposed", proposedDate: date, proposedTime: time }),
      acceptProposal: (id) =>
        commitState((s) => ({
          ...s,
          appointments: s.appointments.map((a) =>
            a.id === id && a.proposedDate && a.proposedTime
              ? {
                  ...a,
                  status: "approved",
                  date: a.proposedDate,
                  time: a.proposedTime,
                  proposedDate: undefined,
                  proposedTime: undefined,
                }
              : a,
          ),
        })),
      updateEmployee: (id, patch) =>
        commitState((s) => ({
          ...s,
          employees: s.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      setEmployeeSchedule: (id, schedule) =>
        commitState((s) => ({
          ...s,
          employees: s.employees.map((e) => (e.id === id ? { ...e, schedule } : e)),
        })),
      addTimeOff: (id, timeOff) =>
        commitState((s) => ({
          ...s,
          employees: s.employees.map((e) =>
            e.id === id ? { ...e, timeOff: [...e.timeOff, timeOff] } : e,
          ),
        })),
      removeTimeOff: (employeeId, timeOffId) =>
        commitState((s) => ({
          ...s,
          employees: s.employees.map((e) =>
            e.id === employeeId
              ? { ...e, timeOff: e.timeOff.filter((t) => t.id !== timeOffId) }
              : e,
          ),
        })),
      updateSalon: (id, patch) =>
        commitState((s) => ({
          ...s,
          salons: s.salons.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      signIn: (phone, name) =>
        commitState((s) => ({ ...s, customerPhone: phone, customerName: name ?? s.customerName })),
      signOut: () => commitState((s) => ({ ...s, customerPhone: null, customerName: null })),
      reset: () => {
        window.localStorage.removeItem(STORAGE_KEY);
        const next = initialState();
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setState(next);
      },
    };
  }, [state, ready, patchAppointment, commitState]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useDemo() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useDemo must be used inside DemoProvider");
  return ctx;
}
