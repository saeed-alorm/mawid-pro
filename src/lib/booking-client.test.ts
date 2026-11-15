import { describe, it, expect } from "vitest";
import { BookingClient, BookingFailure } from "./booking-client";
const session = () => ({
  mode: "fictional-local-only",
  origin: "http://127.0.0.1:12345",
  workspace_id: "00000000-0000-0000-0000-000000000001",
  location_id: "00000000-0000-0000-0000-000000000011",
  installation_id: "00000000-0000-0000-0000-000000000091",
  token: "a".repeat(43),
  expires_at: new Date(Date.now() + 900000).toISOString(),
});
const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (_k: string, v: string) => {
      values.set(_k, v);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};
describe("authoritative booking client", () => {
  it("keeps an ambiguous intent through denied reauthorization and isolates another actor", async () => {
    const saved = storage();
    const s = session();
    let original: unknown;
    const view = (actor: string) =>
      new Response(JSON.stringify({ actor_id: actor, bookings: [], next_after: null }));
    const first = new BookingClient(
      s,
      async (_url, init) => {
        if (!init?.body) return view("actor-A");
        original = JSON.parse(init.body as string);
        throw new TypeError("lost acknowledgement");
      },
      saved,
    );
    await first.view();
    await expect(first.mutate("requests", { start: "future" })).rejects.toBeInstanceOf(
      BookingFailure,
    );
    const denied = new BookingClient(
      s,
      async (_url, init) =>
        !init?.body
          ? view("actor-A")
          : new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), { status: 404 }),
      saved,
    );
    await denied.view();
    await expect(denied.retry()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(denied.pending).toBe(true);
    const other = new BookingClient(
      s,
      async (_url, init) =>
        !init?.body
          ? view("actor-B")
          : new Response(JSON.stringify({ state: "pending", version: "1" })),
      saved,
    );
    await other.view();
    await other.mutate("requests", { start: "another" });
    expect(first.pending).toBe(true);
    const restored = new BookingClient(
      s,
      async (_url, init) => {
        if (!init?.body) return view("actor-A");
        expect(JSON.parse(init.body as string)).toEqual(original);
        return new Response(JSON.stringify({ state: "pending", version: "1" }));
      },
      saved,
    );
    await restored.view();
    await restored.retry();
    expect(restored.pending).toBe(false);
  });
  it("retains the exact operation and version after acknowledgement loss and client restart", async () => {
    const saved = storage();
    let input: unknown;
    const s = session();
    const first = new BookingClient(
      s,
      async (_url, init) => {
        input = JSON.parse(init!.body as string);
        throw new TypeError("offline");
      },
      saved,
    );
    await expect(
      first.mutate("bookings/id/confirm", { expected_version: "3" }),
    ).rejects.toBeInstanceOf(BookingFailure);
    expect(first.pending).toBe(true);
    const second = new BookingClient(
      s,
      async (_url, init) => {
        expect(JSON.parse(init!.body as string)).toEqual(input);
        return new Response(JSON.stringify({ state: "confirmed", version: "4" }));
      },
      saved,
    );
    await expect(second.mutate("requests", {})).rejects.toMatchObject({ code: "RETRY_PENDING" });
    expect((await second.retry()).version).toBe("4");
    expect(second.pending).toBe(false);
  });
  it("clears an explicitly rejected stale mutation and keeps server conflict feedback", async () => {
    const c = new BookingClient(
      session(),
      async () =>
        new Response(JSON.stringify({ error: { code: "STALE_VERSION" } }), { status: 409 }),
      storage(),
    );
    await expect(c.mutate("bookings/id/cancel", { expected_version: "1" })).rejects.toMatchObject({
      code: "STALE_VERSION",
    });
    expect(c.pending).toBe(false);
  });
  it("rejects remote or expired sessions without sending identity hints", async () => {
    expect(
      () => new BookingClient({ ...session(), origin: "https://example.com" }, fetch, storage()),
    ).toThrow();
    let called = false;
    const c = new BookingClient(
      { ...session(), expires_at: "2000-01-01T00:00:00Z" },
      async () => {
        called = true;
        return new Response("{}");
      },
      storage(),
    );
    await expect(c.view()).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(called).toBe(false);
  });
});
