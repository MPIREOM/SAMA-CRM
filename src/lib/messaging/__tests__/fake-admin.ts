// Tiny in-memory stand-in for the Supabase service-role client, covering the
// query shapes the dispatcher uses (select/update/insert with eq/in/lte/lt/is,
// order, limit, select-after-update, maybeSingle). Enough to exercise the
// lock → send → log → status pipeline without a database.

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

interface Result<T = Row[] | Row | null> {
  data: T;
  error: { message: string } | null;
}

export interface FakeTables {
  bk_scheduled_messages: Row[];
  bk_message_log: Row[];
  messages: Row[];
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return String(a) < String(b) ? -1 : 1;
}

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private op: "select" | "update" | "insert" = "select";
  private patch: Row = {};
  private inserted: Row[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private returning = false;
  private single = false;

  constructor(
    private readonly tables: FakeTables,
    private readonly table: keyof FakeTables,
    private readonly hooks: FakeHooks
  ) {}

  select(): this {
    if (this.op !== "select") this.returning = true;
    return this;
  }
  update(patch: Row): this {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  insert(rows: Row | Row[]): this {
    this.op = "insert";
    this.inserted = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]): this {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  lte(col: string, val: unknown): this {
    this.filters.push((r) => cmp(r[col], val) <= 0);
    return this;
  }
  lt(col: string, val: unknown): this {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined && cmp(r[col], val) < 0);
    return this;
  }
  is(col: string, val: null | boolean): this {
    this.filters.push((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  maybeSingle(): this {
    this.single = true;
    return this;
  }

  private run(): Result {
    const rows = this.tables[this.table];
    if (this.op === "insert") {
      for (const r of this.inserted) rows.push({ id: `${this.table}-${rows.length + 1}`, ...r });
      return { data: null, error: null };
    }
    let matched = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      matched = [...matched].sort((a, b) => (asc ? cmp(a[col], b[col]) : cmp(b[col], a[col])));
    }
    if (this.limitN !== null) matched = matched.slice(0, this.limitN);
    if (this.op === "update") {
      const veto = this.hooks.beforeUpdate?.(this.table, matched, this.patch);
      if (veto) matched = matched.filter((r) => !veto.includes(r));
      for (const r of matched) Object.assign(r, this.patch);
      return { data: this.returning ? matched.map((r) => ({ ...r })) : null, error: null };
    }
    const data = matched.map((r) => ({ ...r }));
    return { data: this.single ? (data[0] ?? null) : data, error: null };
  }

  then<R1 = Result, R2 = never>(
    onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }
}

export interface FakeHooks {
  /** Return rows that must NOT be updated (simulates another worker winning the lock). */
  beforeUpdate?: (table: keyof FakeTables, rows: Row[], patch: Row) => Row[] | void;
}

export function createFakeAdmin(tables: FakeTables, hooks: FakeHooks = {}) {
  return {
    tables,
    from(table: keyof FakeTables) {
      return new Query(tables, table, hooks);
    },
  };
}

export type FakeAdmin = ReturnType<typeof createFakeAdmin>;
