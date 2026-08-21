import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DemoProvider, useDemo } from "./store";

function StoreHarness() {
  const { ready, appointments, state, createBooking, signIn } = useDemo();
  return (
    <div>
      <output aria-label="ready">{String(ready)}</output>
      <output aria-label="count">{appointments.length}</output>
      <output aria-label="phone">{state.customerPhone ?? "signed-out"}</output>
      <button
        type="button"
        onClick={() => {
          createBooking({
            employeeId: "any",
            serviceId: "s9-cut",
            date: "2026-08-23",
            time: "11:00",
            customerName: "Persistence Demo",
            phone: "03 555 111",
          });
          signIn("03 555 111", "Persistence Demo");
        }}
      >
        Create
      </button>
    </div>
  );
}

describe("DemoProvider persistence", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() {
          return values.size;
        },
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      } satisfies Storage,
    });
    window.localStorage.clear();
  });
  afterEach(cleanup);

  it("writes a submitted booking and restores it after the provider remounts", async () => {
    const first = render(
      <DemoProvider>
        <StoreHarness />
      </DemoProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText("ready").textContent).toBe("true"));
    const initialCount = Number(screen.getByLabelText("count").textContent);

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    const storedImmediately = JSON.parse(window.localStorage.getItem("mawid.demo.v1") ?? "{}");
    expect(storedImmediately.appointments).toEqual(
      expect.arrayContaining([expect.objectContaining({ customerName: "Persistence Demo" })]),
    );
    expect(storedImmediately.customerPhone).toBe("03 555 111");

    first.unmount();
    render(
      <DemoProvider>
        <StoreHarness />
      </DemoProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText("ready").textContent).toBe("true"));
    expect(screen.getByLabelText("count").textContent).toBe(String(initialCount + 1));
    expect(screen.getByLabelText("phone").textContent).toBe("03 555 111");
  });
});
