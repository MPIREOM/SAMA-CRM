// GoTrue emulation: password sign-in, refresh, /user, logout and the admin
// user endpoints the CRM's /users screen calls. Tokens are real HS256 JWTs
// signed with a throw-away secret so anything that decodes them (auth-js,
// @supabase/ssr) sees a well-formed payload.

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Db } from "./db";
import { USERS } from "./seed";

export interface MockUser {
  id: string;
  email: string;
  password: string;
  full_name: string;
  created_at: string;
  last_sign_in_at: string | null;
  user_metadata: Record<string, unknown>;
}

export interface AuthResponse {
  status: number;
  body: unknown;
}

const JWT_SECRET = process.env.MOCK_JWT_SECRET ?? "mock-supabase-jwt-secret";
const ACCESS_TTL_S = 3600;

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

export function signJwt(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = createHmac("sha256", JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export class Auth {
  private users = new Map<string, MockUser>();
  private refreshTokens = new Map<string, string>(); // refresh token → user id

  constructor(private readonly db: Db) {}

  /** Wipe and recreate the seeded staff accounts (profiles are seeded by seed()). */
  reset(): void {
    this.users.clear();
    this.refreshTokens.clear();
    for (const u of Object.values(USERS)) {
      this.users.set(u.id, {
        id: u.id,
        email: u.email,
        password: u.password,
        full_name: u.full_name,
        created_at: new Date().toISOString(),
        last_sign_in_at: null,
        user_metadata: { full_name: u.full_name },
      });
    }
  }

  private publicUser(u: MockUser) {
    const ts = u.created_at;
    return {
      id: u.id,
      aud: "authenticated",
      role: "authenticated",
      email: u.email,
      email_confirmed_at: ts,
      phone: "",
      confirmed_at: ts,
      last_sign_in_at: u.last_sign_in_at,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: u.user_metadata,
      identities: [
        {
          identity_id: u.id,
          id: u.id,
          user_id: u.id,
          identity_data: { email: u.email, email_verified: true, sub: u.id },
          provider: "email",
          last_sign_in_at: u.last_sign_in_at,
          created_at: ts,
          updated_at: ts,
          email: u.email,
        },
      ],
      created_at: ts,
      updated_at: ts,
      is_anonymous: false,
    };
  }

  private session(u: MockUser) {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + ACCESS_TTL_S;
    const sessionId = randomUUID();
    const access_token = signJwt({
      iss: "http://127.0.0.1:54321/auth/v1",
      sub: u.id,
      aud: "authenticated",
      exp,
      iat,
      email: u.email,
      phone: "",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: u.user_metadata,
      role: "authenticated",
      aal: "aal1",
      amr: [{ method: "password", timestamp: iat }],
      session_id: sessionId,
      is_anonymous: false,
    });
    const refresh_token = randomUUID().replace(/-/g, "").slice(0, 24);
    this.refreshTokens.set(refresh_token, u.id);
    return {
      access_token,
      token_type: "bearer",
      expires_in: ACCESS_TTL_S,
      expires_at: exp,
      refresh_token,
      user: this.publicUser(u),
    };
  }

  /** Resolve a bearer token to a user (null for anon / service role / bad token). */
  userFromBearer(token: string | null): MockUser | null {
    if (!token) return null;
    const payload = verifyJwt(token);
    if (!payload || typeof payload.sub !== "string") return null;
    return this.users.get(payload.sub) ?? null;
  }

  private invalidCredentials(): AuthResponse {
    return {
      status: 400,
      body: { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials", error: "invalid_grant", error_description: "Invalid login credentials" },
    };
  }

  handle(method: string, path: string, query: URLSearchParams, body: unknown, bearer: string | null, isServiceRole: boolean): AuthResponse {
    const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

    if (method === "POST" && path === "/token") {
      const grant = query.get("grant_type");
      if (grant === "password") {
        const email = String(b.email ?? "").toLowerCase();
        const user = Array.from(this.users.values()).find((u) => u.email.toLowerCase() === email);
        if (!user || user.password !== String(b.password ?? "")) return this.invalidCredentials();
        user.last_sign_in_at = new Date().toISOString();
        return { status: 200, body: this.session(user) };
      }
      if (grant === "refresh_token") {
        const rt = String(b.refresh_token ?? "");
        const userId = this.refreshTokens.get(rt);
        const user = userId ? this.users.get(userId) : undefined;
        if (!user) {
          return { status: 400, body: { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" } };
        }
        this.refreshTokens.delete(rt);
        return { status: 200, body: this.session(user) };
      }
      return { status: 400, body: { code: 400, error_code: "unsupported_grant_type", msg: "unsupported_grant_type" } };
    }

    if (method === "GET" && path === "/user") {
      const user = this.userFromBearer(bearer);
      if (!user) return { status: 401, body: { code: 401, error_code: "bad_jwt", msg: "invalid JWT: unable to parse or verify signature" } };
      return { status: 200, body: this.publicUser(user) };
    }

    if (method === "POST" && path === "/logout") {
      return { status: 204, body: undefined };
    }

    if (method === "GET" && path === "/settings") {
      return { status: 200, body: { external: { email: true }, disable_signup: true, mailer_autoconfirm: true, phone_autoconfirm: false, sms_provider: "" } };
    }

    if (path.startsWith("/admin/")) {
      if (!isServiceRole) return { status: 401, body: { code: 401, error_code: "no_authorization", msg: "This endpoint requires a Bearer token" } };
      return this.admin(method, path.slice("/admin".length), query, b);
    }

    return { status: 404, body: { code: 404, error_code: "not_found", msg: `mock: unsupported auth route ${method} ${path}` } };
  }

  private admin(method: string, path: string, query: URLSearchParams, b: Record<string, unknown>): AuthResponse {
    if (method === "GET" && path === "/users") {
      const users = Array.from(this.users.values()).map((u) => this.publicUser(u));
      return { status: 200, body: { users, aud: "authenticated", nextPage: null, lastPage: 1, total: users.length } };
    }
    if (method === "POST" && path === "/users") {
      const email = String(b.email ?? "").toLowerCase();
      if (!email) return { status: 422, body: { code: 422, error_code: "validation_failed", msg: "email is required" } };
      if (Array.from(this.users.values()).some((u) => u.email.toLowerCase() === email)) {
        return { status: 422, body: { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" } };
      }
      const meta = (b.user_metadata && typeof b.user_metadata === "object" ? b.user_metadata : {}) as Record<string, unknown>;
      const user: MockUser = {
        id: randomUUID(),
        email,
        password: String(b.password ?? ""),
        full_name: String(meta.full_name ?? email.split("@")[0]),
        created_at: new Date().toISOString(),
        last_sign_in_at: null,
        user_metadata: meta,
      };
      this.users.set(user.id, user);
      // handle_new_user(): first profile ever → super_admin, everyone else reservation_desk.
      const role = this.db.rows("profiles").length === 0 ? "super_admin" : "reservation_desk";
      this.db.insert("profiles", [{ id: user.id, full_name: user.full_name, role }], { onConflict: ["id"], resolution: "ignore" });
      return { status: 200, body: this.publicUser(user) };
    }
    const m = /^\/users\/([^/]+)$/.exec(path);
    if (m) {
      const user = this.users.get(m[1]);
      if (!user) return { status: 404, body: { code: 404, error_code: "user_not_found", msg: "User not found" } };
      if (method === "GET") return { status: 200, body: this.publicUser(user) };
      if (method === "PUT") {
        if (typeof b.password === "string") user.password = b.password;
        if (typeof b.email === "string") user.email = b.email.toLowerCase();
        if (b.user_metadata && typeof b.user_metadata === "object") user.user_metadata = { ...user.user_metadata, ...(b.user_metadata as object) };
        return { status: 200, body: this.publicUser(user) };
      }
      if (method === "DELETE") {
        this.users.delete(user.id);
        this.db.delete("profiles", (p) => p.id === user.id);
        return { status: 200, body: {} };
      }
    }
    return { status: 404, body: { code: 404, error_code: "not_found", msg: `mock: unsupported admin route ${method} ${path}` } };
  }
}
