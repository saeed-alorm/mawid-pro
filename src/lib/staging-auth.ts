import { z } from "zod";

type StagingAuthConfig = { project: string; key: string };
export type StagingSession = { email: string; expiresAt: number };

export function stagingAuthConfig(
  mode: string,
  project: unknown,
  key: unknown,
): StagingAuthConfig | null {
  if (
    mode !== "staging" ||
    typeof project !== "string" ||
    !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(project) ||
    typeof key !== "string" ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)
  )
    return null;
  return { project: project.replace(/\/$/, ""), key };
}

const userSchema = z.object({
  id: z.string().min(1),
  email: z.string(),
  email_confirmed_at: z.string().min(1),
});
const sessionSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive().max(604800),
  user: z.object({ id: z.string().min(1) }),
});
const errorSchema = z.object({ error_code: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/) });

export class StagingAuth {
  private accessToken: string | undefined;

  constructor(
    private config: StagingAuthConfig,
    private transport: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async sendCode(email: string) {
    await this.request("otp", { email, create_user: false });
  }

  async verifyCode(email: string, token: string): Promise<StagingSession> {
    const result = await this.request("verify", { email, token, type: "email" });
    const parsed = sessionSchema.safeParse(result);
    const accessToken = z.object({ access_token: z.string().min(1) }).safeParse(result);
    try {
      if (!parsed.success) throw new Error("session_unconfirmed");
      const expiresAt = Date.now() + parsed.data.expires_in * 1000;
      const user = userSchema.safeParse(
        await this.request("user", undefined, parsed.data.access_token),
      );
      if (
        !user.success ||
        user.data.id !== parsed.data.user.id ||
        user.data.email.toLowerCase() !== email.toLowerCase()
      )
        throw new Error("session_unconfirmed");
      this.accessToken = parsed.data.access_token;
      return { email: user.data.email, expiresAt };
    } catch (error) {
      if (accessToken.success) {
        try {
          await this.request("logout?scope=local", undefined, accessToken.data.access_token);
        } catch {
          throw new Error("session_cleanup_failed");
        }
      }
      throw error;
    }
  }

  async signOut() {
    const token = this.accessToken;
    this.accessToken = undefined;
    if (token) await this.request("logout?scope=local", undefined, token);
  }

  private async request(
    path: "otp" | "verify" | "user" | "logout?scope=local",
    body?: Record<string, unknown>,
    token?: string,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.transport(`${this.config.project}/auth/v1/${path}`, {
        method: path === "user" ? "GET" : "POST",
        headers: {
          apikey: this.config.key,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error("connection_unavailable");
    }
    if (response.status === 204) return null;
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = errorSchema.safeParse(value);
      throw new Error(error.success ? error.data.error_code : "request_failed");
    }
    return value;
  }
}
