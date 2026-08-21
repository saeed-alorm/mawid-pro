import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

const STORAGE_KEY = "mawid.demo.v1";

export type DemoState = {
  tenantId: string;
  employees: Employee[];
  appointments: Appointment[];
  salons: Salon[];
  customerPhone: string | null;
  customerName: string | null;
};

function initialState(): DemoState {
  return {
    tenantId: baseSalons[0].id,
    employees: JSON.parse(JSON.stringify(baseEmployees)) as Employee[],
    appointments: buildAppointments(),
    salons: JSON.parse(JSON.stringify(baseSalons)) as Salon[],
    customerPhone: null,
    customerName: null,
  };
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoState;
        if (parsed?.appointments && parsed?.employees) setState(parsed);
      }
    } catch {
      /* ignore corrupt demo data */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, ready]);

  const patchAppointment = useCallback((id: string, patch: Partial<Appointment>) => {
    setState((s) => ({
      ...s,
      appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }, []);

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
      setTenant: (id) => setState((s) => ({ ...s, tenantId: id })),
      createBooking: (input) => {
        const appt: Appointment = {
          id: `bk-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          salonId: state.tenantId,
          status: "pending",
          createdAt: new Date().toISOString(),
          ...input,
        };
        setState((s) => ({ ...s, appointments: [...s.appointments, appt] }));
        return appt;
      },
      setStatus: (id, status) => patchAppointment(id, { status }),
      proposeTime: (id, date, time) =>
        patchAppointment(id, { status: "proposed", proposedDate: date, proposedTime: time }),
      acceptProposal: (id) =>
        setState((s) => ({
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
        setState((s) => ({
          ...s,
          employees: s.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      setEmployeeSchedule: (id, schedule) =>
        setState((s) => ({
          ...s,
          employees: s.employees.map((e) => (e.id === id ? { ...e, schedule } : e)),
        })),
      addTimeOff: (id, timeOff) =>
        setState((s) => ({
          ...s,
          employees: s.employees.map((e) =>
            e.id === id ? { ...e, timeOff: [...e.timeOff, timeOff] } : e,
          ),
        })),
      removeTimeOff: (employeeId, timeOffId) =>
        setState((s) => ({
          ...s,
          employees: s.employees.map((e) =>
            e.id === employeeId
              ? { ...e, timeOff: e.timeOff.filter((t) => t.id !== timeOffId) }
              : e,
          ),
        })),
      updateSalon: (id, patch) =>
        setState((s) => ({
          ...s,
          salons: s.salons.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      signIn: (phone, name) =>
        setState((s) => ({ ...s, customerPhone: phone, customerName: name ?? s.customerName })),
      signOut: () => setState((s) => ({ ...s, customerPhone: null, customerName: null })),
      reset: () => {
        window.localStorage.removeItem(STORAGE_KEY);
        setState(initialState());
      },
    };
  }, [state, ready, patchAppointment]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useDemo() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useDemo must be used inside DemoProvider");
  return ctx;
}
