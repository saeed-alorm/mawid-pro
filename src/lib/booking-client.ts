export type ServerBooking = {
  booking_id: string;
  customer_id: string;
  service_id: string;
  state: string;
  version: string;
  requested_professional_id: string | null;
  assigned_professional_id: string | null;
  requested_local: { date: string; time: string; offset: string };
  assigned_local: { date: string; time: string; offset: string } | null;
  offer_expires_at: string | null;
  can_cancel: boolean;
  cancellation_is_late?: boolean;
  overdue?: boolean;
  segments?: VisitSegment[];
};
export type VisitPreference = { service_id: string; professional_id?: string | undefined };
export type VisitSegment = {
  position: number;
  service_id: string;
  requested_professional_id: string | null;
  assigned_professional_id: string | null;
  requested_start: string;
  requested_end: string;
  assigned_start: string | null;
  assigned_end: string | null;
};
export type BookingView = {
  actor_id: string;
  roles: string[];
  customer_ids: string[];
  services: { service_id: string; name: string; duration_minutes: number }[];
  professionals: {
    professional_id: string;
    display_name: string;
    active: boolean;
    service_ids: string[];
    rating_average?: number | null;
    rating_count?: number;
  }[];
  customers: { customer_id: string; display_name: string }[];
  bookings: ServerBooking[];
  next_after: string | null;
  server_time: string;
  review_at: string;
};
export type ServerSlot = { start: string; segments: VisitSegment[] };
export type InboxItem = {
  notification_id: string;
  booking_id: string;
  state: string;
  own: boolean;
  kind?: "booking" | "pending_reminder" | "review_invitation";
  pushes: { status: string; transport: string }[];
};
type Session = {
  mode: string;
  workspace_id: string;
  location_id: string;
  installation_id: string;
  token: string;
  expires_at: string;
  origin: string;
};
type Intent = { scope: string; path: string; body: Record<string, unknown> };
export class BookingFailure extends Error {
  constructor(
    public code: string,
    public status = 0,
  ) {
    super(code);
  }
}
const key = "mawid.development.booking.intent.v1";
export class BookingClient {
  private session: Session;
  private busy = false;
  private actor = "unbound";
  constructor(
    input: unknown,
    private transport: typeof fetch = globalThis.fetch.bind(globalThis),
    private storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = sessionStorage,
    private area: "booking-core" | "visit-core" = "booking-core",
  ) {
    const s = input as Session;
    const id = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
    const origin = new URL(s.origin);
    const validToken =
      s.mode === "fictional-signed-local-only"
        ? s.token?.length <= 4096 && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(s.token)
        : s.mode === "fictional-local-only" && /^[A-Za-z0-9_-]{43}$/.test(s.token);
    if (
      !validToken ||
      origin.hostname !== "127.0.0.1" ||
      origin.protocol !== "http:" ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== "/" ||
      !origin.port ||
      !id.test(s.workspace_id) ||
      !id.test(s.location_id) ||
      !id.test(s.installation_id) ||
      !Number.isFinite(Date.parse(s.expires_at))
    )
      throw new BookingFailure("INVALID_LOCAL_SESSION");
    this.session = s;
  }
  private get scope() {
    const s = this.session;
    return `${s.origin}|${s.workspace_id}|${s.location_id}|${this.actor}`;
  }
  private get intentKey() {
    return this.storageKey(this.scope);
  }
  private storageKey(scope: string) {
    return this.area === "visit-core" ? `${key}:visit:${scope}` : `${key}:${scope}`;
  }
  get pending(): boolean {
    return this.intent()?.scope === this.scope;
  }
  private intent(): Intent | null {
    const text = this.storage.getItem(this.intentKey);
    return text ? (JSON.parse(text) as Intent) : null;
  }
  async request<T>(
    path: string,
    body?: Record<string, unknown>,
    area: "booking-core" | "visit-core" | "notifications" = this.area,
  ): Promise<T> {
    const s = this.session;
    if (Date.now() >= Date.parse(s.expires_at)) throw new BookingFailure("SESSION_EXPIRED", 401);
    try {
      const response = await this.transport(
        `/__booking_api/v1/workspaces/${s.workspace_id}/locations/${s.location_id}/${area}/${path}`,
        {
          method: body ? "POST" : "GET",
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${s.token}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      const value = await response.json();
      if (!response.ok)
        throw new BookingFailure(value.error?.code ?? "SERVER_ERROR", response.status);
      return value as T;
    } catch (e) {
      if (e instanceof BookingFailure) throw e;
      throw new BookingFailure("CONNECTION_UNCONFIRMED");
    }
  }
  inbox() {
    return this.request<{ items: InboxItem[] }>(
      this.area === "visit-core" ? "inbox?contract=2" : "inbox",
      undefined,
      "notifications",
    );
  }
  open(id: string) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new BookingFailure("INVALID_NOTIFICATION");
    const contract = this.area === "visit-core" ? "?contract=2" : "";
    return this.request<ServerBooking>(`inbox/${id}/open${contract}`, {}, "notifications");
  }
  async view(): Promise<BookingView> {
    const first = await this.request<BookingView>("view");
    this.actor = first.actor_id;
    let after = first.next_after;
    while (after) {
      const page = await this.request<BookingView>(`view?after=${after}`);
      first.bookings.push(...page.bookings);
      after = page.next_after;
    }
    return first;
  }
  async mutate(path: string, input: Record<string, unknown>) {
    if (this.busy) throw new BookingFailure("SUBMISSION_BUSY");
    const old = this.intent();
    if (old?.scope === this.scope) throw new BookingFailure("RETRY_PENDING");
    if (old) throw new BookingFailure("INTENT_SCOPE_MISMATCH");
    const intent: Intent = {
      scope: this.scope,
      path,
      body: { ...input, operation_id: crypto.randomUUID() },
    };
    // Write BEFORE sending, so an interrupted/uncertain POST retains its key.
    this.storage.setItem(this.intentKey, JSON.stringify(intent));
    return this.send(intent);
  }
  async retry() {
    const intent = this.intent();
    if (!intent || intent.scope !== this.scope) throw new BookingFailure("NO_RETRY");
    return this.send(intent);
  }
  private async send(intent: Intent) {
    if (this.busy) throw new BookingFailure("SUBMISSION_BUSY");
    this.busy = true;
    try {
      const result = await this.request<ServerBooking>(intent.path, intent.body);
      this.storage.removeItem(this.storageKey(intent.scope));
      return result;
    } catch (e) {
      if (
        e instanceof BookingFailure &&
        e.status >= 400 &&
        e.status < 500 &&
        ![401, 403, 404, 408, 429].includes(e.status) &&
        e.code !== "OPERATION_RETIRED"
      )
        this.storage.removeItem(this.storageKey(intent.scope));
      throw e;
    } finally {
      this.busy = false;
    }
  }
}
