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
  let text: string | null = null;
  return {
    getItem: () => text,
    setItem: (_k: string, v: string) => {
      text = v;
    },
    removeItem: () => {
      text = null;
    },
  };
};
describe("authoritative booking client", () => {
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
