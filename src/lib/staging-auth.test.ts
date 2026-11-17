import { describe, expect, it, vi } from "vitest";
import { StagingAuth, stagingAuthConfig } from "./staging-auth";

const project = "https://exampleproject.supabase.co";
const key = "sb_publishable_staging_test";
const email = "tester@example.test";
const user = { id: "staging-user", email, email_confirmed_at: "2026-11-16T10:00:00Z" };
const session = {
  access_token: "test-access",
  refresh_token: "test-refresh",
  expires_in: 3600,
  user,
};

describe("hosted staging email sign-in", () => {
  it("requires a dedicated staging mode, hosted origin and publishable key", () => {
    expect(stagingAuthConfig("github-pages", project, key)).toBeNull();
    expect(stagingAuthConfig("staging", "http://localhost:8080", key)).toBeNull();
    expect(stagingAuthConfig("staging", `${project}/auth/v1`, key)).toBeNull();
    expect(stagingAuthConfig("staging", project, "sb_secret_example")).toBeNull();
    expect(stagingAuthConfig("staging", project, key)).toEqual({ project, key });
  });

  it("requests a code for an existing staging account and proves the returned session with Auth", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json(user))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const auth = new StagingAuth({ project, key }, transport);
    await auth.sendCode(email);
    expect(transport.mock.calls[0]?.[0]).toBe(`${project}/auth/v1/otp`);
    expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toEqual({
      email,
      create_user: false,
    });

    const signedIn = await auth.verifyCode(email, "123456");
    expect(JSON.parse(String(transport.mock.calls[1]?.[1]?.body))).toEqual({
      email,
      token: "123456",
      type: "email",
    });
    expect(transport.mock.calls[2]?.[0]).toBe(`${project}/auth/v1/user`);
    expect(transport.mock.calls[2]?.[1]?.headers).toMatchObject({
      apikey: key,
      Authorization: "Bearer test-access",
    });
    expect(signedIn).toEqual({ email, expiresAt: expect.any(Number) });
    expect(signedIn.expiresAt).toBeGreaterThan(Date.now());

    await auth.signOut();
    expect(transport.mock.calls[3]?.[0]).toBe(`${project}/auth/v1/logout?scope=local`);
    expect(transport.mock.calls[3]?.[1]?.method).toBe("POST");
  });

  it("rejects a wrong account and revokes the unaccepted session", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json({ ...user, email: "other@example.test" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const auth = new StagingAuth({ project, key }, transport);
    await expect(auth.verifyCode(email, "123456")).rejects.toThrow("session_unconfirmed");
    expect(transport.mock.calls[2]?.[0]).toBe(`${project}/auth/v1/logout?scope=local`);
  });

  it("redacts provider response text from OTP errors", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json(
        {
          error_code: "otp_expired",
          msg: "sensitive upstream detail",
        },
        { status: 403 },
      ),
    );
    const auth = new StagingAuth({ project, key }, transport);
    await expect(auth.verifyCode(email, "123456")).rejects.toThrow(/^otp_expired$/);
  });
});
