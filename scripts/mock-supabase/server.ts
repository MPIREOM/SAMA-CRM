// Local stand-in for the Supabase surface this app uses:
//   /rest/v1/<table>       PostgREST (see postgrest.ts)
//   /rest/v1/rpc/<fn>      SQL functions mirrored in rpc.ts
//   /auth/v1/*             GoTrue password login for the staff back-office
//   /storage/v1/*          room-image uploads (accepted, not stored)
//   /__mock/reset          reseed (POST) — handy between e2e specs
//
// Run:  npx tsx scripts/mock-supabase/server.ts        (or `npm run mock:db`)
// Point the app at it with
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=mock-service-role-key
//
// Row-level security is emulated coarsely by bearer: the service-role key
// sees everything, a staff JWT gets the staff policies, anything else is anon.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { Auth } from "./auth";
import { Db, DbError, TABLES, type Row } from "./db";
import { handleRest, type Predicate } from "./postgrest";
import { callRpc, type Role } from "./rpc";
import { seed } from "./seed";

const PORT = Number(process.env.MOCK_SUPABASE_PORT ?? process.env.PORT ?? 54321);
const SERVICE_ROLE_KEY = process.env.MOCK_SERVICE_ROLE_KEY ?? "mock-service-role-key";
const QUIET = process.env.MOCK_QUIET === "1";

const db = new Db();
const auth = new Auth(db);
seed(db);
auth.reset();

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS",
  "access-control-expose-headers": "Content-Range, Content-Location, Location, X-Total-Count",
};

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: string | undefined, headers: Record<string, string> = {}): void {
  res.writeHead(status, { ...CORS, ...headers });
  res.end(body ?? "");
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  send(res, status, body === undefined ? undefined : JSON.stringify(body), { "content-type": "application/json; charset=utf-8", ...headers });
}

function bearerOf(req: IncomingMessage): string | null {
  const h = req.headers.authorization ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

interface Caller {
  role: Role;
  userId: string | null;
  staffRole: string | null; // profiles.role for authenticated callers
}

function caller(req: IncomingMessage): Caller {
  const bearer = bearerOf(req);
  if (bearer === SERVICE_ROLE_KEY) return { role: "service_role", userId: null, staffRole: null };
  const user = auth.userFromBearer(bearer);
  if (user) {
    const profile = db.rows("profiles").find((p) => p.id === user.id);
    return { role: "authenticated", userId: user.id, staffRole: profile ? String(profile.role) : null };
  }
  return { role: "anon", userId: null, staffRole: null };
}

// ---------------------------------------------------------------------------
// RLS (policies from migrations 0001 + 0005 + 0010)
// ---------------------------------------------------------------------------

const STAFF = ["super_admin", "reservation_desk"];

function rlsFilter(c: Caller, table: string, method: string): Predicate | "denied" {
  if (c.role === "service_role") return () => true;
  const isRead = method === "GET" || method === "HEAD";
  const staff = c.staffRole !== null && STAFF.includes(c.staffRole);
  const admin = c.staffRole === "super_admin";

  if (table === "bk_room_types") {
    if (isRead) return staff ? () => true : (r) => r.is_active === true;
    return admin ? () => true : "denied";
  }
  // Migration 0010: the add-on catalogue is public while active; staff see everything, super_admin writes.
  if (table === "bk_addons") {
    if (isRead) return staff ? () => true : (r) => r.is_active === true;
    return admin ? () => true : "denied";
  }
  if (table.startsWith("bk_")) {
    if (isRead) return staff ? () => true : () => false;
    if (table === "bk_message_log" || table === "bk_audit_log") return "denied";
    return admin ? () => true : "denied";
  }
  if (table === "contacts" || table === "bookings" || table === "messages") {
    if (isRead) return staff ? () => true : () => false;
    if (method === "DELETE") return admin ? () => true : "denied";
    return staff ? () => true : "denied";
  }
  if (table === "automations" || table === "campaigns") {
    if (isRead) return admin ? () => true : () => false;
    return admin ? () => true : "denied";
  }
  if (table === "profiles") {
    if (isRead) return admin ? () => true : (r) => r.id === c.userId;
    return admin ? () => true : "denied";
  }
  return isRead ? () => false : "denied";
}

function rlsDenied(c: Caller, table: string): DbError {
  return new DbError("42501", `new row violates row-level security policy for table "${table}"`, null, null, c.role === "anon" ? 401 : 403);
}

// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------

function headersOf(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") out[k.toLowerCase()] = v;
  return out;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const method = (req.method ?? "GET").toUpperCase();
  const path = url.pathname;

  if (method === "OPTIONS") return send(res, 204, undefined);

  const raw = await readBody(req);
  const contentType = req.headers["content-type"] ?? "";
  let body: unknown = undefined;
  if (raw.length > 0 && contentType.includes("json")) {
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      return sendJson(res, 400, { code: "PGRST102", details: null, hint: null, message: "Empty or invalid json" });
    }
  }

  // ---- control endpoints ----------------------------------------------------
  if (path === "/__mock/health") return sendJson(res, 200, { ok: true, tables: Object.keys(TABLES) });
  if (path === "/__mock/reset" && method === "POST") {
    seed(db);
    auth.reset();
    return sendJson(res, 200, { ok: true });
  }

  // ---- auth --------------------------------------------------------------------
  if (path.startsWith("/auth/v1")) {
    const sub = path.slice("/auth/v1".length) || "/";
    const bearer = bearerOf(req);
    const r = auth.handle(method, sub, url.searchParams, body, bearer, bearer === SERVICE_ROLE_KEY);
    return sendJson(res, r.status, r.body);
  }

  // ---- storage ----------------------------------------------------------------
  if (path.startsWith("/storage/v1")) {
    const sub = path.slice("/storage/v1".length);
    if (sub.startsWith("/object/public/")) return sendJson(res, 404, { statusCode: "404", error: "not_found", message: "Object not found" });
    const upload = /^\/object\/([^/]+)\/(.+)$/.exec(sub);
    if (upload && (method === "POST" || method === "PUT")) {
      if (caller(req).role === "anon") return sendJson(res, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      return sendJson(res, 200, { Key: `${upload[1]}/${upload[2]}`, Id: randomUUID() });
    }
    if (method === "DELETE" && /^\/object\/[^/]+$/.test(sub)) return sendJson(res, 200, []);
    if (method === "GET" && sub.startsWith("/bucket")) return sendJson(res, 200, [{ id: "bk-room-images", name: "bk-room-images", public: true }]);
    return sendJson(res, 404, { statusCode: "404", error: "not_found", message: `mock: unsupported storage route ${method} ${sub}` });
  }

  // ---- PostgREST ----------------------------------------------------------------
  if (path.startsWith("/rest/v1")) {
    const c = caller(req);
    const sub = path.slice("/rest/v1".length);
    try {
      if (sub === "/" || sub === "") return sendJson(res, 200, { swagger: "2.0", info: { title: "mock-supabase" } });
      const rpc = /^\/rpc\/([A-Za-z0-9_]+)$/.exec(sub);
      if (rpc) {
        if (method !== "POST" && method !== "GET" && method !== "HEAD") return sendJson(res, 405, { message: "method not allowed" });
        const args = method === "POST" ? ((body ?? {}) as Record<string, unknown>) : Object.fromEntries(url.searchParams.entries());
        const result = callRpc(db, { role: c.role, userId: c.userId }, rpc[1], args);
        const accept = req.headers.accept ?? "";
        if (accept.includes("application/vnd.pgrst.object+json") && Array.isArray(result)) {
          if (result.length !== 1) {
            return sendJson(res, 406, { code: "PGRST116", details: `The result contains ${result.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" });
          }
          return sendJson(res, 200, result[0]);
        }
        return sendJson(res, 200, result ?? null, { "content-range": Array.isArray(result) ? `0-${Math.max(result.length - 1, 0)}/${result.length}` : "0-0/1" });
      }
      const m = /^\/([A-Za-z0-9_]+)$/.exec(sub);
      if (!m) return sendJson(res, 404, { code: "PGRST", details: null, hint: null, message: `mock: unsupported REST path ${sub}` });
      const table = m[1];
      if (!db.hasTable(table)) {
        return sendJson(res, 404, { code: "PGRST205", details: null, hint: null, message: `Could not find the table 'public.${table}' in the schema cache` });
      }
      const filter = rlsFilter(c, table, method);
      if (filter === "denied") throw rlsDenied(c, table);
      const r = handleRest(db, { method, table, params: url.searchParams, headers: headersOf(req), body, rowFilter: filter });
      return send(res, r.status, r.body, r.headers);
    } catch (e) {
      if (e instanceof DbError) return sendJson(res, e.status, e.toJSON());
      const message = e instanceof Error ? e.message : String(e);
      return sendJson(res, 500, { code: "XX000", details: e instanceof Error ? (e.stack ?? null) : null, hint: null, message: `mock internal error: ${message}` });
    }
  }

  return sendJson(res, 404, { message: `mock-supabase: no route for ${method} ${path}` });
}

const server = createServer((req, res) => {
  const started = Date.now();
  handle(req, res)
    .catch((e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { message: `mock crashed: ${message}` });
    })
    .finally(() => {
      if (!QUIET) process.stdout.write(`${new Date().toISOString()} ${req.method} ${req.url} → ${res.statusCode} ${Date.now() - started}ms\n`);
    });
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`mock-supabase listening on http://127.0.0.1:${PORT} (service role key: ${SERVICE_ROLE_KEY})\n`);
});

export type { Row };
