// PostgREST emulation for the subset supabase-js/postgrest-js generates:
//   select=… (columns, aliases, `*`, embedded resources), filters
//   (eq/neq/gt/gte/lt/lte/like/ilike/is/in/cs/cd + not. prefix, or=(), and=()),
//   order, limit/offset (+ Range header), Prefer: count=exact / return=… /
//   resolution=merge-duplicates, Accept: application/vnd.pgrst.object+json.

import { Db, DbError, RELATIONS, TABLES, type Row } from "./db";

// ---------------------------------------------------------------------------
// select parser
// ---------------------------------------------------------------------------

export interface SelectNode {
  name: string; // column or embedded table
  alias: string | null;
  children: SelectNode[] | null; // non-null → embedded resource
}

export function parseSelect(input: string): SelectNode[] {
  const s = input.replace(/\s+/g, "");
  let i = 0;
  const parseList = (): SelectNode[] => {
    const items: SelectNode[] = [];
    while (i < s.length && s[i] !== ")") {
      items.push(parseItem());
      if (s[i] === ",") i++;
    }
    return items;
  };
  const readName = (): string => {
    const start = i;
    while (i < s.length && !",():!".includes(s[i])) i++;
    return s.slice(start, i);
  };
  const parseItem = (): SelectNode => {
    let name = readName();
    let alias: string | null = null;
    if (s[i] === ":" && s[i + 1] !== ":") {
      i++;
      alias = name;
      name = readName();
    }
    // strip ::cast
    if (s[i] === ":" && s[i + 1] === ":") {
      i += 2;
      readName();
    }
    // strip !hint (inner/left/fk name)
    if (s[i] === "!") {
      i++;
      readName();
    }
    let children: SelectNode[] | null = null;
    if (s[i] === "(") {
      i++;
      children = parseList();
      if (s[i] !== ")") throw new DbError("PGRST100", `"failed to parse select parameter (${input})"`);
      i++;
    }
    if (!name) throw new DbError("PGRST100", `"failed to parse select parameter (${input})"`);
    return { name, alias, children };
  };
  const out = parseList();
  if (i < s.length) throw new DbError("PGRST100", `"failed to parse select parameter (${input})"`);
  return out;
}

// ---------------------------------------------------------------------------
// filters
// ---------------------------------------------------------------------------

export type Predicate = (row: Row) => boolean;

const OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "cs", "cd", "ov", "fts", "plfts", "phfts", "wfts", "match", "imatch"] as const;

function splitTopLevel(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (const ch of input) {
    if (ch === '"') quoted = !quoted;
    if (!quoted) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        out.push(cur);
        cur = "";
        continue;
      }
    }
    cur += ch;
  }
  if (cur.length > 0 || out.length > 0) out.push(cur);
  return out;
}

function unquote(v: string): string {
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

function parseListValue(v: string): string[] {
  const inner = v.startsWith("(") && v.endsWith(")") ? v.slice(1, -1) : v.startsWith("{") && v.endsWith("}") ? v.slice(1, -1) : v;
  if (inner.trim() === "") return [];
  return splitTopLevel(inner).map((x) => unquote(x.trim()));
}

function likeToRegex(pattern: string, caseInsensitive: boolean): RegExp {
  const src = pattern
    .replace(/\*/g, "%")
    .split("")
    .map((ch) => (ch === "%" ? ".*" : ch === "_" ? "." : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${src}$`, caseInsensitive ? "is" : "s");
}

function columnType(table: string, column: string): string {
  return TABLES[table]?.columns[column]?.type ?? "text";
}

/** Compare a stored value against a filter literal using the column's type. */
function compare(table: string, column: string, stored: unknown, literal: string): number | null {
  if (stored === null || stored === undefined) return null;
  const type = columnType(table, column);
  if (type === "int" || type === "numeric") {
    const a = Number(stored);
    const b = Number(literal);
    if (Number.isNaN(b)) throw new DbError("22P02", `invalid input syntax for type ${type === "int" ? "integer" : "numeric"}: "${literal}"`);
    return a === b ? 0 : a < b ? -1 : 1;
  }
  if (type === "bool") {
    const a = Boolean(stored);
    const b = literal === "true" || literal === "t";
    return a === b ? 0 : a ? 1 : -1;
  }
  if (type === "timestamptz") {
    const a = Date.parse(String(stored));
    const b = Date.parse(literal);
    if (Number.isNaN(b)) throw new DbError("22007", `invalid input syntax for type timestamp with time zone: "${literal}"`);
    return a === b ? 0 : a < b ? -1 : 1;
  }
  const a = String(stored);
  const b = type === "date" ? literal.slice(0, 10) : literal;
  return a === b ? 0 : a < b ? -1 : 1;
}

function buildCondition(table: string, column: string, op: string, value: string): Predicate {
  if (!TABLES[table]?.columns[column]) {
    throw new DbError("42703", `column ${table}.${column} does not exist`);
  }
  if (!(OPERATORS as readonly string[]).includes(op)) {
    throw new DbError("PGRST100", `"failed to parse filter (${op}.${value})" (line 1, column 1)`, `unexpected "${op[0]}" expecting "not" or operator (eq, gt, ...)`);
  }
  switch (op) {
    case "eq":
      return (r) => compare(table, column, r[column], unquote(value)) === 0;
    case "neq":
      return (r) => r[column] !== null && compare(table, column, r[column], unquote(value)) !== 0;
    case "gt":
      return (r) => (compare(table, column, r[column], value) ?? -1) > 0;
    case "gte":
      return (r) => (compare(table, column, r[column], value) ?? -1) >= 0;
    case "lt":
      return (r) => (compare(table, column, r[column], value) ?? 1) < 0;
    case "lte":
      return (r) => (compare(table, column, r[column], value) ?? 1) <= 0;
    case "like":
    case "ilike": {
      const re = likeToRegex(unquote(value), op === "ilike");
      return (r) => r[column] !== null && r[column] !== undefined && re.test(String(r[column]));
    }
    case "is": {
      const v = value.toLowerCase();
      if (v === "null") return (r) => r[column] === null || r[column] === undefined;
      if (v === "true") return (r) => r[column] === true;
      if (v === "false") return (r) => r[column] === false;
      if (v === "unknown") return (r) => r[column] === null;
      throw new DbError("PGRST100", `"failed to parse filter (is.${value})"`);
    }
    case "in": {
      const list = parseListValue(value);
      return (r) => r[column] !== null && r[column] !== undefined && list.some((v) => compare(table, column, r[column], v) === 0);
    }
    case "cs": {
      const list = parseListValue(value);
      return (r) => Array.isArray(r[column]) && list.every((v) => (r[column] as unknown[]).map(String).includes(v));
    }
    case "cd": {
      const list = parseListValue(value);
      return (r) => Array.isArray(r[column]) && (r[column] as unknown[]).every((v) => list.includes(String(v)));
    }
    case "ov": {
      const list = parseListValue(value);
      return (r) => Array.isArray(r[column]) && (r[column] as unknown[]).some((v) => list.includes(String(v)));
    }
    default:
      throw new DbError("PGRST100", `operator ${op} is not supported by the mock`);
  }
}

/** `col.op.value` or `col.not.op.value` (inside or=/and=) → predicate. */
function parseFilterExpression(table: string, expr: string): Predicate {
  const trimmed = expr.trim();
  const logical = /^(not\.)?(and|or)\(([\s\S]*)\)$/.exec(trimmed);
  if (logical) {
    const [, not, kind, inner] = logical;
    const parts = splitTopLevel(inner).map((p) => parseFilterExpression(table, p));
    const combined: Predicate = kind === "and" ? (r) => parts.every((p) => p(r)) : (r) => parts.some((p) => p(r));
    return not ? (r) => !combined(r) : combined;
  }
  const firstDot = trimmed.indexOf(".");
  if (firstDot < 0) throw new DbError("PGRST100", `"failed to parse logic tree (${expr})"`);
  const column = trimmed.slice(0, firstDot);
  return parseOperatorValue(table, column, trimmed.slice(firstDot + 1));
}

/** `op.value` or `not.op.value` for a known column → predicate. */
function parseOperatorValue(table: string, column: string, rest: string): Predicate {
  let negate = false;
  let s = rest;
  if (s.startsWith("not.")) {
    negate = true;
    s = s.slice(4);
  }
  const dot = s.indexOf(".");
  const op = dot < 0 ? s : s.slice(0, dot);
  const value = dot < 0 ? "" : s.slice(dot + 1);
  const p = buildCondition(table, column, op, value);
  return negate ? (r) => !p(r) : p;
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

export function buildPredicate(table: string, params: URLSearchParams): Predicate {
  const preds: Predicate[] = [];
  for (const [key, value] of Array.from(params.entries())) {
    if (RESERVED.has(key)) continue;
    if (key === "or" || key === "and" || key === "not.or" || key === "not.and") {
      preds.push(parseFilterExpression(table, `${key}${value}`));
      continue;
    }
    if (key.includes(".")) {
      // referencedTable.column filters are not needed by this app.
      throw new DbError("PGRST100", `embedded-resource filters (${key}) are not supported by the mock`);
    }
    preds.push(parseOperatorValue(table, key, value));
  }
  return (r) => preds.every((p) => p(r));
}

// ---------------------------------------------------------------------------
// order / pagination
// ---------------------------------------------------------------------------

interface OrderTerm {
  column: string;
  desc: boolean;
  nullsFirst: boolean;
}

export function parseOrder(table: string, order: string | null): OrderTerm[] {
  if (!order) return [];
  return order.split(",").map((term) => {
    const [column, ...mods] = term.trim().split(".");
    if (!TABLES[table]?.columns[column]) throw new DbError("42703", `column ${table}.${column} does not exist`);
    const desc = mods.includes("desc");
    const nullsFirst = mods.includes("nullsfirst") ? true : mods.includes("nullslast") ? false : desc;
    return { column, desc, nullsFirst };
  });
}

function compareValues(type: string, a: unknown, b: unknown): number {
  if (type === "int" || type === "numeric") return Number(a) - Number(b);
  if (type === "bool") return Number(Boolean(a)) - Number(Boolean(b));
  if (type === "timestamptz") return Date.parse(String(a)) - Date.parse(String(b));
  const sa = String(a);
  const sb = String(b);
  return sa === sb ? 0 : sa < sb ? -1 : 1;
}

export function sortRows(table: string, rows: Row[], terms: OrderTerm[]): Row[] {
  if (terms.length === 0) return rows;
  const indexed = rows.map((r, i) => ({ r, i }));
  indexed.sort((x, y) => {
    for (const t of terms) {
      const a = x.r[t.column];
      const b = y.r[t.column];
      const an = a === null || a === undefined;
      const bn = b === null || b === undefined;
      if (an && bn) continue;
      if (an) return t.nullsFirst ? -1 : 1;
      if (bn) return t.nullsFirst ? 1 : -1;
      const c = compareValues(columnType(table, t.column), a, b);
      if (c !== 0) return t.desc ? -c : c;
    }
    return x.i - y.i; // stable
  });
  return indexed.map((x) => x.r);
}

// ---------------------------------------------------------------------------
// shaping (select projection + embeds)
// ---------------------------------------------------------------------------

function resolveRelation(parent: string, name: string): { kind: "one" | "many"; table: string; fk: string } {
  const direct = RELATIONS[parent]?.[name];
  if (direct) return { kind: "one", table: direct.table, fk: direct.fk };
  // reverse: child table with an FK pointing at the parent
  const child = RELATIONS[name];
  if (child) {
    const rel = Object.values(child).find((r) => r.table === parent);
    if (rel) return { kind: "many", table: name, fk: rel.fk };
  }
  throw new DbError(
    "PGRST200",
    `Could not find a relationship between '${parent}' and '${name}' in the schema cache`,
    `Searched for a foreign key relationship between '${parent}' and '${name}' in the schema 'public', but no matches were found.`,
    null,
    400
  );
}

export function shapeRow(db: Db, table: string, row: Row, nodes: SelectNode[]): Row {
  const out: Row = {};
  for (const node of nodes) {
    if (node.children === null) {
      if (node.name === "*") {
        for (const k of Object.keys(TABLES[table].columns)) out[k] = row[k] ?? null;
        continue;
      }
      if (!TABLES[table].columns[node.name]) {
        throw new DbError("42703", `column ${table}.${node.name} does not exist`);
      }
      out[node.alias ?? node.name] = row[node.name] ?? null;
      continue;
    }
    const rel = resolveRelation(table, node.name);
    const key = node.alias ?? node.name;
    if (rel.kind === "one") {
      const target = db.rows(rel.table).find((r) => r.id === row[rel.fk]);
      out[key] = target ? shapeRow(db, rel.table, target, node.children) : null;
    } else {
      out[key] = db
        .rows(rel.table)
        .filter((r) => r[rel.fk] === row.id)
        .map((r) => shapeRow(db, rel.table, r, node.children ?? []));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// request execution
// ---------------------------------------------------------------------------

export interface RestRequest {
  method: string;
  table: string;
  params: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
  /** Extra predicate injected by the RLS layer (anon may only see active room types, …). */
  rowFilter?: Predicate;
}

export interface RestResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function prefer(headers: Record<string, string>, key: string): string | null {
  const raw = headers.prefer ?? "";
  for (const part of raw.split(",")) {
    const [k, v] = part.trim().split("=");
    if (k === key) return v ?? "";
  }
  return null;
}

function wantsObject(headers: Record<string, string>): boolean {
  return (headers.accept ?? "").includes("application/vnd.pgrst.object+json");
}

function paginate(params: URLSearchParams, headers: Record<string, string>): { offset: number; limit: number | null } {
  let offset = params.get("offset") !== null ? Number(params.get("offset")) : 0;
  let limit: number | null = params.get("limit") !== null ? Number(params.get("limit")) : null;
  const range = headers.range;
  if (range) {
    const m = /^(\d+)-(\d+)?$/.exec(range.trim());
    if (m) {
      offset = Number(m[1]);
      limit = m[2] !== undefined ? Number(m[2]) - offset + 1 : null;
    }
  }
  return { offset, limit };
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): RestResponse {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
    body: body === undefined ? "" : JSON.stringify(body),
  };
}

function finish(db: Db, table: string, rows: Row[], req: RestRequest, status: number, opts: { total?: number; from?: number } = {}): RestResponse {
  const select = parseSelect(req.params.get("select") ?? "*");
  const shaped = rows.map((r) => shapeRow(db, table, r, select));
  const total = opts.total ?? shaped.length;
  const from = opts.from ?? 0;
  const to = shaped.length === 0 ? from : from + shaped.length - 1;
  const contentRange = shaped.length === 0 ? `*/${total}` : `${from}-${to}/${total}`;
  if (wantsObject(req.headers)) {
    if (shaped.length !== 1) {
      return json(
        406,
        {
          code: "PGRST116",
          details: `The result contains ${shaped.length} rows`,
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned",
        },
        { "content-range": contentRange }
      );
    }
    return json(status, shaped[0], { "content-range": contentRange });
  }
  if (req.method === "HEAD") return { status: 200, headers: { "content-range": contentRange, "content-type": "application/json; charset=utf-8" }, body: "" };
  return json(status, shaped, { "content-range": contentRange });
}

export function handleRest(db: Db, req: RestRequest): RestResponse {
  const { table, params, method } = req;
  if (!db.hasTable(table)) {
    return json(404, { code: "PGRST205", details: null, hint: `Perhaps you meant the table 'public.bk_bookings'`, message: `Could not find the table 'public.${table}' in the schema cache` });
  }
  const where = buildPredicate(table, params);
  const filter: Predicate = req.rowFilter ? (r) => where(r) && req.rowFilter!(r) : where;

  if (method === "GET" || method === "HEAD") {
    const matched = sortRows(table, db.rows(table).filter(filter), parseOrder(table, params.get("order")));
    const { offset, limit } = paginate(params, req.headers);
    const page = matched.slice(offset, limit === null ? undefined : offset + limit);
    return finish(db, table, page, req, 200, { total: matched.length, from: offset });
  }

  if (method === "POST") {
    const payload = req.body;
    const rows = Array.isArray(payload) ? (payload as Row[]) : [payload as Row];
    if (rows.some((r) => !r || typeof r !== "object")) {
      return json(400, { code: "PGRST102", details: null, hint: null, message: "Empty or invalid json" });
    }
    const resolution = prefer(req.headers, "resolution");
    const onConflict = params.get("on_conflict")?.split(",").map((s) => s.trim());
    const inserted = db.insert(table, rows, {
      onConflict,
      resolution: resolution === "merge-duplicates" ? "merge" : resolution === "ignore-duplicates" ? "ignore" : undefined,
    });
    if (prefer(req.headers, "return") === "representation") return finish(db, table, inserted, req, 201);
    return { status: 201, headers: { "content-range": `*/*` }, body: "" };
  }

  if (method === "PATCH") {
    const patch = req.body as Row;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return json(400, { code: "PGRST102", details: null, hint: null, message: "Empty or invalid json" });
    }
    const updated = db.update(table, patch, filter);
    if (prefer(req.headers, "return") === "representation") {
      return finish(db, table, sortRows(table, updated, parseOrder(table, params.get("order"))), req, 200);
    }
    return { status: 204, headers: { "content-range": `*/*` }, body: "" };
  }

  if (method === "DELETE") {
    const removed = db.delete(table, filter);
    if (prefer(req.headers, "return") === "representation") return finish(db, table, removed, req, 200);
    return { status: 204, headers: { "content-range": `*/*` }, body: "" };
  }

  return json(405, { code: "PGRST", details: null, hint: null, message: `method ${method} not allowed` });
}
