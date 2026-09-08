// In-memory stand-in for the Postgres schema the app touches (bk_* tables +
// the CRM tables they reference). Mirrors column defaults, unique
// constraints, a few CHECK constraints and the triggers from
// supabase/migrations/0005_booking_engine.sql. Everything is synchronous so a
// single RPC call is atomic — which is what serialises concurrent
// bk_create_booking calls the way pg_advisory_xact_lock does in Postgres.

import { randomUUID } from "node:crypto";
import { computeSendAt, DEFAULT_SCHEDULE, type MessagingSchedule } from "../../src/lib/booking-engine/dates";
import { nightsBetween } from "../../src/lib/booking-engine/pricing";

export type Row = Record<string, unknown>;

export class DbError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: string | null = null,
    public readonly hint: string | null = null,
    public readonly status = 400
  ) {
    super(message);
  }
  toJSON(): { code: string; message: string; details: string | null; hint: string | null } {
    return { code: this.code, message: this.message, details: this.details, hint: this.hint };
  }
}

export type ColumnType = "uuid" | "text" | "int" | "numeric" | "bool" | "date" | "timestamptz" | "json" | "text[]" | "int[]";

export interface ColumnSpec {
  type: ColumnType;
  /** Default applied when the key is absent from an insert payload. */
  default?: () => unknown;
  /** NOT NULL without a default → inserting null/undefined fails with 23502. */
  required?: boolean;
  /** CHECK (col in (...)) */
  enum?: readonly string[];
  /** Generated column (never writable). */
  generated?: (row: Row) => unknown;
}

export interface TableSpec {
  columns: Record<string, ColumnSpec>;
  /** Unique constraints (each entry is one constraint; composite allowed). */
  unique: string[][];
  /** Tables whose updated_at is maintained by bk_touch_updated_at(). */
  touchUpdatedAt?: boolean;
}

const now = () => new Date().toISOString();
const uuid = () => randomUUID();

const col = (type: ColumnType, extra: Partial<ColumnSpec> = {}): ColumnSpec => ({ type, ...extra });
const id = (): ColumnSpec => col("uuid", { default: uuid });
const ts = (): ColumnSpec => col("timestamptz", { default: now });
const nullable = (type: ColumnType): ColumnSpec => col(type, { default: () => null });

export const BOOKING_STATUSES = ["pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"] as const;
export const BOOKING_SOURCES = ["website", "staff", "phone", "walk_in", "ota"] as const;
export const MESSAGE_STATUSES = ["pending", "sending", "sent", "failed", "stubbed", "cancelled", "skipped"] as const;
export const ADDON_KINDS = ["activity", "transfer", "other"] as const;
export const ADDON_UNITS = ["per_person", "per_car", "per_booking", "per_night"] as const;
export const BOOKING_ADDON_STATUSES = ["requested", "confirmed", "done", "cancelled"] as const;

/** Market is a GENERATED column on contacts: +968 → Oman, GCC prefixes → GCC, other + → International. */
export function marketFromPhone(phone: unknown): string | null {
  if (typeof phone !== "string" || !phone.startsWith("+")) return null;
  if (phone.startsWith("+968")) return "Oman";
  if (["+966", "+971", "+965", "+974", "+973"].some((p) => phone.startsWith(p))) return "GCC";
  return "International";
}

export const TABLES: Record<string, TableSpec> = {
  bk_room_types: {
    columns: {
      id: id(),
      slug: col("text", { required: true }),
      crm_value: col("text", { required: true }),
      name_en: col("text", { required: true }),
      name_ar: col("text", { required: true }),
      tagline_en: nullable("text"),
      tagline_ar: nullable("text"),
      description_en: nullable("text"),
      description_ar: nullable("text"),
      view_en: nullable("text"),
      view_ar: nullable("text"),
      bed_config_en: nullable("text"),
      bed_config_ar: nullable("text"),
      size_sqm: nullable("numeric"),
      max_adults: col("int", { default: () => 2 }),
      max_children: col("int", { default: () => 1 }),
      amenities: col("json", { default: () => [] }),
      images: col("text[]", { default: () => [] }),
      base_rate_omr: col("numeric", { required: true }),
      sort_order: col("int", { default: () => 0 }),
      is_active: col("bool", { default: () => true }),
      created_at: ts(),
      updated_at: ts(),
    },
    unique: [["id"], ["slug"], ["crm_value"]],
    touchUpdatedAt: true,
  },
  bk_rooms: {
    columns: {
      id: id(),
      room_type_id: col("uuid", { required: true }),
      room_number: col("text", { required: true }),
      floor: nullable("text"),
      status: col("text", { default: () => "active", enum: ["active", "maintenance"] }),
      notes: nullable("text"),
      sort_order: col("int", { default: () => 0 }),
      created_at: ts(),
      updated_at: ts(),
    },
    unique: [["id"], ["room_number"]],
    touchUpdatedAt: true,
  },
  bk_rate_plans: {
    columns: {
      id: id(),
      name: col("text", { required: true }),
      room_type_id: nullable("uuid"),
      start_date: col("date", { required: true }),
      end_date: col("date", { required: true }),
      rate_omr: nullable("numeric"),
      adjust_pct: nullable("numeric"),
      min_stay: col("int", { default: () => 1 }),
      days_of_week: nullable("int[]"),
      priority: col("int", { default: () => 0 }),
      is_active: col("bool", { default: () => true }),
      created_by: nullable("uuid"),
      created_at: ts(),
      updated_at: ts(),
    },
    unique: [["id"]],
    touchUpdatedAt: true,
  },
  bk_inventory_blocks: {
    columns: {
      id: id(),
      room_id: nullable("uuid"),
      room_type_id: nullable("uuid"),
      start_date: col("date", { required: true }),
      end_date: col("date", { required: true }),
      kind: col("text", { default: () => "block", enum: ["block", "maintenance", "stop_sell"] }),
      reason: nullable("text"),
      created_by: nullable("uuid"),
      created_at: ts(),
    },
    unique: [["id"]],
  },
  bk_bookings: {
    columns: {
      id: id(),
      ref: col("text", { required: true }),
      contact_id: nullable("uuid"),
      guest_name: col("text", { required: true }),
      guest_email: nullable("text"),
      guest_phone: col("text", { required: true }),
      nationality: nullable("text"),
      preferred_lang: col("text", { default: () => "en", enum: ["en", "ar"] }),
      room_type_id: col("uuid", { required: true }),
      room_id: nullable("uuid"),
      check_in: col("date", { required: true }),
      check_out: col("date", { required: true }),
      nights: col("int", { generated: (r) => nightsBetween(String(r.check_in), String(r.check_out)) }),
      adults: col("int", { default: () => 2 }),
      children: col("int", { default: () => 0 }),
      status: col("text", { default: () => "confirmed", enum: BOOKING_STATUSES }),
      nightly_rates: col("json", { default: () => [] }),
      room_subtotal_omr: col("numeric", { default: () => 0 }),
      discount_omr: col("numeric", { default: () => 0 }),
      service_charge_omr: col("numeric", { default: () => 0 }),
      tourism_fee_omr: col("numeric", { default: () => 0 }),
      vat_omr: col("numeric", { default: () => 0 }),
      total_omr: col("numeric", { default: () => 0 }),
      addons_omr: col("numeric", { default: () => 0 }),
      promo_code: nullable("text"),
      special_requests: nullable("text"),
      internal_notes: nullable("text"),
      source: col("text", { default: () => "website", enum: BOOKING_SOURCES }),
      created_by: nullable("uuid"),
      cancelled_at: nullable("timestamptz"),
      cancel_reason: nullable("text"),
      checked_in_at: nullable("timestamptz"),
      checked_out_at: nullable("timestamptz"),
      created_at: ts(),
      updated_at: ts(),
    },
    unique: [["id"], ["ref"]],
    touchUpdatedAt: true,
  },
  // --- Add-ons (migration 0010) ---------------------------------------------
  bk_addons: {
    columns: {
      id: id(),
      slug: col("text", { required: true }),
      kind: col("text", { default: () => "other", enum: ADDON_KINDS }),
      name_en: col("text", { required: true }),
      name_ar: col("text", { required: true }),
      tagline_en: nullable("text"),
      tagline_ar: nullable("text"),
      description_en: nullable("text"),
      description_ar: nullable("text"),
      price_omr: col("numeric", { required: true }),
      unit: col("text", { default: () => "per_person", enum: ADDON_UNITS }),
      max_quantity: col("int", { default: () => 10 }),
      taxable: col("bool", { default: () => false }),
      requires_note: col("bool", { default: () => false }),
      note_hint_en: nullable("text"),
      note_hint_ar: nullable("text"),
      image: nullable("text"),
      details: col("json", { default: () => ({}) }),
      is_active: col("bool", { default: () => true }),
      sort_order: col("int", { default: () => 0 }),
      created_at: ts(),
      updated_at: ts(),
    },
    unique: [["id"], ["slug"]],
    touchUpdatedAt: true,
  },
  bk_booking_addons: {
    columns: {
      id: id(),
      booking_id: col("uuid", { required: true }),
      addon_id: col("uuid", { required: true }),
      quantity: col("int", { required: true }),
      unit_price_omr: col("numeric", { required: true }),
      total_omr: col("numeric", { required: true }),
      taxable: col("bool", { default: () => false }),
      note: nullable("text"),
      status: col("text", { default: () => "requested", enum: BOOKING_ADDON_STATUSES }),
      created_at: ts(),
      updated_at: ts(),
    },
    unique: [["id"], ["booking_id", "addon_id"]],
    touchUpdatedAt: true,
  },
  bk_settings: {
    columns: {
      key: col("text", { required: true }),
      value: col("json", { required: true }),
      updated_at: ts(),
      updated_by: nullable("uuid"),
    },
    unique: [["key"]],
  },
  bk_scheduled_messages: {
    columns: {
      id: id(),
      booking_id: col("uuid", { required: true }),
      channel: col("text", { required: true, enum: ["email", "whatsapp"] }),
      kind: col("text", { required: true, enum: ["confirmation", "pre_arrival", "post_stay"] }),
      send_at: col("timestamptz", { required: true }),
      status: col("text", { default: () => "pending", enum: MESSAGE_STATUSES }),
      attempts: col("int", { default: () => 0 }),
      last_error: nullable("text"),
      sent_at: nullable("timestamptz"),
      locked_at: nullable("timestamptz"),
      created_at: ts(),
      updated_at: ts(),
    },
    unique: [["id"], ["booking_id", "channel", "kind"]],
    touchUpdatedAt: true,
  },
  bk_message_log: {
    columns: {
      id: id(),
      booking_id: nullable("uuid"),
      scheduled_id: nullable("uuid"),
      channel: col("text", { required: true, enum: ["email", "whatsapp"] }),
      kind: col("text", { required: true }),
      recipient: nullable("text"),
      provider_message_id: nullable("text"),
      payload: nullable("json"),
      status: col("text", { required: true }),
      error: nullable("text"),
      created_at: ts(),
    },
    unique: [["id"]],
  },
  bk_audit_log: {
    columns: {
      id: id(),
      actor_user_id: nullable("uuid"),
      actor_email: nullable("text"),
      action: col("text", { required: true }),
      entity: col("text", { required: true }),
      entity_id: nullable("text"),
      diff: nullable("json"),
      created_at: ts(),
    },
    unique: [["id"]],
  },
  // --- CRM tables the booking engine references -----------------------------
  contacts: {
    columns: {
      id: id(),
      name: col("text", { required: true }),
      phone: col("text", { required: true }),
      email: nullable("text"),
      lang: col("text", { default: () => "ar" }),
      market: col("text", { generated: (r) => marketFromPhone(r.phone) }),
      tags: nullable("text[]"),
      consent: col("bool", { default: () => false }),
      consent_source: nullable("text"),
      consent_at: nullable("timestamptz"),
      last_stay: nullable("date"),
      room_type: nullable("text"),
      birthday: nullable("date"),
      last_inbound_at: nullable("timestamptz"),
      nationality: nullable("text"),
      created_at: ts(),
    },
    unique: [["id"], ["phone"]],
  },
  bookings: {
    columns: {
      id: id(),
      ref: col("text", { required: true }),
      contact_id: nullable("uuid"),
      guest: nullable("text"),
      phone: nullable("text"),
      check_in: nullable("date"),
      check_out: nullable("date"),
      room_type: nullable("text"),
      source: nullable("text"),
      status: col("text", { default: () => "Confirmed" }),
      created_at: ts(),
    },
    unique: [["id"], ["ref"]],
  },
  messages: {
    columns: {
      id: id(),
      campaign_id: nullable("uuid"),
      automation_id: nullable("uuid"),
      contact_id: nullable("uuid"),
      booking_id: nullable("uuid"),
      direction: nullable("text"),
      channel: nullable("text"),
      status: nullable("text"),
      body: nullable("text"),
      provider_msg_id: nullable("text"),
      sent_at: col("timestamptz", { default: now }),
    },
    unique: [["id"]],
  },
  automations: {
    columns: {
      id: id(),
      name: nullable("text"),
      trigger_kind: nullable("text"),
      offset_days: nullable("int"),
      channel: nullable("text"),
      msg_type: nullable("text"),
      market: nullable("text"),
      template: nullable("text"),
      enabled: col("bool", { default: () => true }),
    },
    unique: [["id"]],
  },
  campaigns: {
    columns: {
      id: id(),
      name: nullable("text"),
      channel: nullable("text"),
      segment: nullable("text"),
      market: nullable("text"),
      body: nullable("text"),
      status: nullable("text"),
      sent: col("int", { default: () => 0 }),
      opened: col("int", { default: () => 0 }),
      clicked: col("int", { default: () => 0 }),
      scheduled_for: nullable("timestamptz"),
      created_at: ts(),
    },
    unique: [["id"]],
  },
  profiles: {
    columns: {
      id: col("uuid", { required: true }),
      full_name: nullable("text"),
      role: col("text", { default: () => "reservation_desk", enum: ["super_admin", "reservation_desk"] }),
      created_at: ts(),
    },
    unique: [["id"]],
  },
};

/** Foreign-key based embeds: parent table → embed name → FK column on the parent. */
export const RELATIONS: Record<string, Record<string, { table: string; fk: string }>> = {
  bk_bookings: {
    bk_room_types: { table: "bk_room_types", fk: "room_type_id" },
    bk_rooms: { table: "bk_rooms", fk: "room_id" },
    contacts: { table: "contacts", fk: "contact_id" },
  },
  bk_rooms: { bk_room_types: { table: "bk_room_types", fk: "room_type_id" } },
  bk_inventory_blocks: {
    bk_rooms: { table: "bk_rooms", fk: "room_id" },
    bk_room_types: { table: "bk_room_types", fk: "room_type_id" },
  },
  bk_rate_plans: { bk_room_types: { table: "bk_room_types", fk: "room_type_id" } },
  bk_scheduled_messages: { bk_bookings: { table: "bk_bookings", fk: "booking_id" } },
  bk_message_log: {
    bk_bookings: { table: "bk_bookings", fk: "booking_id" },
    bk_scheduled_messages: { table: "bk_scheduled_messages", fk: "scheduled_id" },
  },
  bk_addons: {},
  bk_booking_addons: {
    bk_bookings: { table: "bk_bookings", fk: "booking_id" },
    bk_addons: { table: "bk_addons", fk: "addon_id" },
  },
  messages: {
    contacts: { table: "contacts", fk: "contact_id" },
    bookings: { table: "bookings", fk: "booking_id" },
    automations: { table: "automations", fk: "automation_id" },
    campaigns: { table: "campaigns", fk: "campaign_id" },
  },
  bookings: { contacts: { table: "contacts", fk: "contact_id" } },
  profiles: {},
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

/** Coerce an incoming JSON value to the column's storage form (mirrors Postgres input casts). */
export function coerce(table: string, column: string, value: unknown): unknown {
  const spec = TABLES[table]?.columns[column];
  if (!spec || value === null || value === undefined) return value ?? null;
  switch (spec.type) {
    case "uuid":
      if (!isUuid(value)) throw new DbError("22P02", `invalid input syntax for type uuid: "${String(value)}"`);
      return String(value).toLowerCase();
    case "int": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isInteger(n)) throw new DbError("22P02", `invalid input syntax for type integer: "${String(value)}"`);
      return n;
    }
    case "numeric": {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(n)) throw new DbError("22P02", `invalid input syntax for type numeric: "${String(value)}"`);
      return Math.round(n * 1000) / 1000;
    }
    case "bool":
      if (typeof value === "boolean") return value;
      if (value === "true" || value === "t") return true;
      if (value === "false" || value === "f") return false;
      throw new DbError("22P02", `invalid input syntax for type boolean: "${String(value)}"`);
    case "date": {
      const s = String(value).slice(0, 10);
      if (!isIsoDate(s)) throw new DbError("22007", `invalid input syntax for type date: "${String(value)}"`);
      return s;
    }
    case "timestamptz": {
      const ms = Date.parse(String(value));
      if (Number.isNaN(ms)) throw new DbError("22007", `invalid input syntax for type timestamp with time zone: "${String(value)}"`);
      return new Date(ms).toISOString();
    }
    case "text[]":
      if (!Array.isArray(value)) throw new DbError("22P02", `malformed array literal: "${String(value)}"`);
      return value.map(String);
    case "int[]":
      if (!Array.isArray(value)) throw new DbError("22P02", `malformed array literal: "${String(value)}"`);
      return value.map((v) => Number(v));
    case "text":
      return typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
    case "json":
      return value;
  }
}

export interface DbSettingsReader {
  setting(key: string): Record<string, unknown> | null;
}

export class Db implements DbSettingsReader {
  private tables = new Map<string, Row[]>();

  constructor() {
    for (const name of Object.keys(TABLES)) this.tables.set(name, []);
  }

  hasTable(name: string): boolean {
    return this.tables.has(name);
  }

  /** Live array (callers must not mutate). */
  rows(table: string): Row[] {
    const rows = this.tables.get(table);
    if (!rows) throw new DbError("PGRST205", `Could not find the table 'public.${table}' in the schema cache`, null, null, 404);
    return rows;
  }

  clear(): void {
    for (const name of Object.keys(TABLES)) this.tables.set(name, []);
  }

  setting(key: string): Record<string, unknown> | null {
    const row = this.rows("bk_settings").find((r) => r.key === key);
    const v = row?.value;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  }

  messagingSchedule(): MessagingSchedule {
    const m = this.setting("messaging") ?? {};
    return {
      pre_arrival_days_before: Number(m.pre_arrival_days_before ?? DEFAULT_SCHEDULE.pre_arrival_days_before),
      pre_arrival_time: String(m.pre_arrival_time ?? DEFAULT_SCHEDULE.pre_arrival_time),
      post_stay_days_after: Number(m.post_stay_days_after ?? DEFAULT_SCHEDULE.post_stay_days_after),
      post_stay_time: String(m.post_stay_time ?? DEFAULT_SCHEDULE.post_stay_time),
    };
  }

  /** bk_send_at(kind, check_in, check_out) */
  sendAt(kind: string, checkIn: string, checkOut: string): string {
    if (kind !== "confirmation" && kind !== "pre_arrival" && kind !== "post_stay") {
      throw new DbError("P0001", `unknown_kind ${kind}`);
    }
    return computeSendAt(kind, checkIn, checkOut, this.messagingSchedule()).toISOString();
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  private prepareInsert(table: string, values: Row): Row {
    const spec = TABLES[table];
    const row: Row = {};
    for (const [name, c] of Object.entries(spec.columns)) {
      if (c.generated) continue;
      if (Object.prototype.hasOwnProperty.call(values, name) && values[name] !== undefined) {
        row[name] = coerce(table, name, values[name]);
      } else if (c.default) {
        row[name] = c.default();
      } else {
        row[name] = null;
      }
      if (row[name] === null && c.required) {
        throw new DbError("23502", `null value in column "${name}" of relation "${table}" violates not-null constraint`);
      }
      if (c.enum && row[name] !== null && !c.enum.includes(String(row[name]))) {
        throw new DbError("23514", `new row for relation "${table}" violates check constraint "${table}_${name}_check"`);
      }
    }
    for (const key of Object.keys(values)) {
      if (!spec.columns[key]) {
        throw new DbError("PGRST204", `Could not find the '${key}' column of '${table}' in the schema cache`);
      }
    }
    this.applyGenerated(table, row);
    this.checkConstraints(table, row);
    return row;
  }

  private applyGenerated(table: string, row: Row): void {
    for (const [name, c] of Object.entries(TABLES[table].columns)) {
      if (c.generated) row[name] = c.generated(row);
    }
  }

  private checkConstraints(table: string, row: Row): void {
    const fail = (name: string) => {
      throw new DbError("23514", `new row for relation "${table}" violates check constraint "${name}"`);
    };
    if (table === "bk_bookings" && String(row.check_out) <= String(row.check_in)) fail("bk_bookings_check");
    if (table === "bk_inventory_blocks") {
      if (String(row.end_date) <= String(row.start_date)) fail("bk_inventory_blocks_check");
      if (row.room_id === null && row.room_type_id === null) fail("bk_inventory_blocks_check1");
    }
    if (table === "bk_rate_plans") {
      if (String(row.end_date) < String(row.start_date)) fail("bk_rate_plans_check");
      if (row.rate_omr === null && row.adjust_pct === null) fail("bk_rate_plans_check1");
      const ms = Number(row.min_stay);
      if (ms < 1 || ms > 30) fail("bk_rate_plans_min_stay_check");
    }
    if (table === "bk_room_types" && Number(row.base_rate_omr) < 0) fail("bk_room_types_base_rate_omr_check");
    if (table === "bk_addons") {
      if (Number(row.price_omr) < 0) fail("bk_addons_price_omr_check");
      const mq = Number(row.max_quantity);
      if (mq < 1 || mq > 50) fail("bk_addons_max_quantity_check");
    }
    if (table === "bk_booking_addons") {
      const q = Number(row.quantity);
      if (q < 1 || q > 50) fail("bk_booking_addons_quantity_check");
    }
  }

  private findConflict(table: string, row: Row, exceptRow?: Row, constraint?: string[]): { key: string[]; existing: Row } | null {
    const spec = TABLES[table];
    const keys = constraint ? [constraint] : spec.unique;
    for (const key of keys) {
      if (key.some((k) => row[k] === null || row[k] === undefined)) continue;
      const existing = this.rows(table).find((r) => r !== exceptRow && key.every((k) => r[k] === row[k]));
      if (existing) return { key, existing };
    }
    return null;
  }

  /** INSERT (optionally ON CONFLICT (cols) DO UPDATE / DO NOTHING). Fires triggers. */
  insert(table: string, values: Row[], opts: { onConflict?: string[]; resolution?: "merge" | "ignore" } = {}): Row[] {
    const spec = TABLES[table];
    if (!spec) throw new DbError("PGRST205", `Could not find the table 'public.${table}' in the schema cache`, null, null, 404);
    const out: Row[] = [];
    for (const v of values) {
      const row = this.prepareInsert(table, v);
      const conflictKey = opts.onConflict ?? (spec.unique.find((u) => u.length === 1 && (u[0] === "id" || u[0] === "key")) ?? spec.unique[0]);
      if (opts.resolution) {
        const c = this.findConflict(table, row, undefined, conflictKey);
        if (c) {
          if (opts.resolution === "ignore") continue;
          const patch: Row = {};
          for (const k of Object.keys(v)) if (!spec.columns[k]?.generated) patch[k] = row[k];
          out.push(this.updateRow(table, c.existing, patch));
          continue;
        }
      }
      const dup = this.findConflict(table, row);
      if (dup) {
        throw new DbError(
          "23505",
          `duplicate key value violates unique constraint "${table}_${dup.key.join("_")}_key"`,
          `Key (${dup.key.join(", ")})=(${dup.key.map((k) => String(row[k])).join(", ")}) already exists.`,
          null,
          409
        );
      }
      this.checkForeignKeys(table, row);
      this.rows(table).push(row);
      this.afterWrite(table, null, row);
      out.push(row);
    }
    return out;
  }

  private checkForeignKeys(table: string, row: Row): void {
    const rel = RELATIONS[table] ?? {};
    for (const { table: target, fk } of Object.values(rel)) {
      const v = row[fk];
      if (v === null || v === undefined) continue;
      // CRM contacts may be referenced by rows created outside the engine; only bk_ FKs are enforced.
      if (!target.startsWith("bk_")) continue;
      const pk = target === "bk_settings" ? "key" : "id";
      if (!this.rows(target).some((r) => r[pk] === v)) {
        throw new DbError(
          "23503",
          `insert or update on table "${table}" violates foreign key constraint "${table}_${fk}_fkey"`,
          `Key (${fk})=(${String(v)}) is not present in table "${target}".`,
          null,
          409
        );
      }
    }
  }

  private updateRow(table: string, existing: Row, patch: Row): Row {
    const spec = TABLES[table];
    const before = { ...existing };
    const next: Row = { ...existing };
    for (const [k, v] of Object.entries(patch)) {
      const c = spec.columns[k];
      if (!c) throw new DbError("PGRST204", `Could not find the '${k}' column of '${table}' in the schema cache`);
      if (c.generated) throw new DbError("428C9", `column "${k}" can only be updated to DEFAULT`);
      next[k] = coerce(table, k, v);
      if (next[k] === null && c.required) {
        throw new DbError("23502", `null value in column "${k}" of relation "${table}" violates not-null constraint`);
      }
      if (c.enum && next[k] !== null && !c.enum.includes(String(next[k]))) {
        throw new DbError("23514", `new row for relation "${table}" violates check constraint "${table}_${k}_check"`);
      }
    }
    if (spec.touchUpdatedAt) next.updated_at = now();
    this.applyGenerated(table, next);
    this.checkConstraints(table, next);
    const dup = this.findConflict(table, next, existing);
    if (dup) {
      throw new DbError(
        "23505",
        `duplicate key value violates unique constraint "${table}_${dup.key.join("_")}_key"`,
        `Key (${dup.key.join(", ")})=(${dup.key.map((k) => String(next[k])).join(", ")}) already exists.`,
        null,
        409
      );
    }
    this.checkForeignKeys(table, next);
    Object.assign(existing, next);
    this.afterWrite(table, before, existing);
    return existing;
  }

  /** UPDATE ... WHERE predicate. Fires triggers. Returns the updated rows. */
  update(table: string, patch: Row, predicate: (r: Row) => boolean): Row[] {
    const targets = this.rows(table).filter(predicate);
    return targets.map((r) => this.updateRow(table, r, patch));
  }

  /** DELETE ... WHERE predicate. Applies ON DELETE cascade / set null. */
  delete(table: string, predicate: (r: Row) => boolean): Row[] {
    const rows = this.rows(table);
    const removed = rows.filter(predicate);
    if (removed.length === 0) return [];
    if (table === "bk_room_types") {
      for (const rt of removed) {
        if (this.rows("bk_rooms").some((r) => r.room_type_id === rt.id) || this.rows("bk_bookings").some((b) => b.room_type_id === rt.id)) {
          throw new DbError("23503", `update or delete on table "bk_room_types" violates foreign key constraint`, null, null, 409);
        }
        this.delete("bk_rate_plans", (p) => p.room_type_id === rt.id);
        this.delete("bk_inventory_blocks", (b) => b.room_type_id === rt.id);
      }
    }
    if (table === "bk_rooms") {
      for (const room of removed) {
        this.delete("bk_inventory_blocks", (b) => b.room_id === room.id);
        for (const b of this.rows("bk_bookings")) if (b.room_id === room.id) b.room_id = null;
      }
    }
    if (table === "bk_bookings") {
      for (const b of removed) {
        this.delete("bk_scheduled_messages", (s) => s.booking_id === b.id);
        this.delete("bk_booking_addons", (a) => a.booking_id === b.id);
        for (const l of this.rows("bk_message_log")) if (l.booking_id === b.id) l.booking_id = null;
      }
    }
    if (table === "bk_addons") {
      // ON DELETE RESTRICT: an add-on that has ever been booked cannot be deleted.
      for (const a of removed) {
        if (this.rows("bk_booking_addons").some((x) => x.addon_id === a.id)) {
          throw new DbError(
            "23503",
            `update or delete on table "bk_addons" violates foreign key constraint "bk_booking_addons_addon_id_fkey" on table "bk_booking_addons"`,
            `Key (id)=(${String(a.id)}) is still referenced from table "bk_booking_addons".`,
            null,
            409
          );
        }
      }
    }
    if (table === "bk_scheduled_messages") {
      for (const s of removed) for (const l of this.rows("bk_message_log")) if (l.scheduled_id === s.id) l.scheduled_id = null;
    }
    this.tables.set(
      table,
      rows.filter((r) => !removed.includes(r))
    );
    return removed;
  }

  // ---------------------------------------------------------------------------
  // Triggers (after insert / update)
  // ---------------------------------------------------------------------------

  private afterWrite(table: string, before: Row | null, row: Row): void {
    if (table === "bk_bookings") this.mirrorBooking(before, row);
  }

  /** bk_mirror_booking(): mirror into CRM bookings + cancel/reschedule side effects. */
  private mirrorBooking(old: Row | null, b: Row): void {
    const rt = this.rows("bk_room_types").find((t) => t.id === b.room_type_id);
    const status = b.status === "cancelled" || b.status === "no_show" ? "Cancelled" : b.status === "checked_out" ? "Completed" : "Confirmed";
    const source = b.source === "website" ? "Website" : b.source === "ota" ? "OTA" : "Offline";
    const mirror: Row = {
      id: b.id,
      ref: b.ref,
      contact_id: b.contact_id,
      guest: b.guest_name,
      phone: b.guest_phone,
      check_in: b.check_in,
      check_out: b.check_out,
      room_type: rt?.crm_value ?? null,
      source,
      status,
      created_at: b.created_at,
    };
    const existing = this.rows("bookings").find((r) => r.id === b.id);
    if (existing) {
      const { id: _id, created_at: _c, ...rest } = mirror;
      Object.assign(existing, rest);
    } else {
      this.rows("bookings").push(this.prepareInsert("bookings", mirror));
    }

    if (old) {
      const cancelledNow = (b.status === "cancelled" || b.status === "no_show") && !(old.status === "cancelled" || old.status === "no_show");
      if (cancelledNow) {
        for (const s of this.rows("bk_scheduled_messages")) {
          if (s.booking_id === b.id && (s.status === "pending" || s.status === "failed")) {
            s.status = "cancelled";
            s.updated_at = now();
          }
        }
        // Migration 0010: a cancelled booking cancels its add-on requests too.
        for (const a of this.rows("bk_booking_addons")) {
          if (a.booking_id === b.id && (a.status === "requested" || a.status === "confirmed")) {
            a.status = "cancelled";
            a.updated_at = now();
          }
        }
      }
      const datesChanged = b.check_in !== old.check_in || b.check_out !== old.check_out;
      if (datesChanged && b.status !== "cancelled" && b.status !== "no_show") {
        for (const s of this.rows("bk_scheduled_messages")) {
          if (s.booking_id === b.id && (s.kind === "pre_arrival" || s.kind === "post_stay") && s.status === "pending") {
            s.send_at = this.sendAt(String(s.kind), String(b.check_in), String(b.check_out));
            s.updated_at = now();
          }
        }
      }
    }
  }
}
