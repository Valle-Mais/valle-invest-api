/**
 * Firestore em memória para testes do motor de rateio. Cobre só o que os
 * serviços usam: collection/doc/where/orderBy/limit/count/get, runTransaction
 * com get/set/update/delete (escritas aplicadas no commit) e startAfter.
 * Datas são comparadas por getTime.
 */
type Op = '==' | '>' | '>=' | '<' | '<=';
interface Filter {
  field: string;
  op: Op;
  value: unknown;
}

function cmp(a: unknown, b: unknown): number {
  const av = a instanceof Date ? a.getTime() : (a as number | string);
  const bv = b instanceof Date ? b.getTime() : (b as number | string);
  if (av === bv) return 0;
  return (av as number) < (bv as number) ? -1 : 1;
}

export class FakeDocSnapshot {
  constructor(
    public readonly ref: FakeDocRef,
    private readonly value: Record<string, unknown> | undefined,
  ) {}
  get id() {
    return this.ref.id;
  }
  /** Momento da primeira escrita do documento, como no Firestore real. */
  get createTime(): { toDate: () => Date } | undefined {
    const created = this.ref.db.createdAt(this.ref.collection, this.ref.id);
    return created ? { toDate: () => created } : undefined;
  }
  get exists() {
    return this.value !== undefined;
  }
  data() {
    return this.value ? { ...this.value } : undefined;
  }
}

export class FakeDocRef {
  constructor(
    public readonly db: FakeFirestore,
    public readonly collection: string,
    public readonly id: string,
  ) {}
  get path() {
    return `${this.collection}/${this.id}`;
  }
  async get() {
    return new FakeDocSnapshot(this, this.db.read(this.collection, this.id));
  }
  async set(data: Record<string, unknown>) {
    this.db.write(this.collection, this.id, data);
  }
  async update(data: Record<string, unknown>) {
    const cur = this.db.read(this.collection, this.id);
    if (!cur) throw new Error(`update em documento inexistente ${this.path}`);
    this.db.write(this.collection, this.id, { ...cur, ...data });
  }
  async delete() {
    this.db.remove(this.collection, this.id);
  }
}

export class FakeQuery {
  constructor(
    public readonly db: FakeFirestore,
    public readonly collection: string,
    private readonly filters: Filter[] = [],
    private readonly orders: { field: string; dir: 'asc' | 'desc' }[] = [],
    private readonly lim?: number,
    private readonly after?: FakeDocSnapshot,
  ) {}
  where(field: string, op: Op, value: unknown) {
    return new FakeQuery(
      this.db,
      this.collection,
      [...this.filters, { field, op, value }],
      this.orders,
      this.lim,
      this.after,
    );
  }
  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
    return new FakeQuery(
      this.db,
      this.collection,
      this.filters,
      [...this.orders, { field, dir }],
      this.lim,
      this.after,
    );
  }
  limit(n: number) {
    return new FakeQuery(
      this.db,
      this.collection,
      this.filters,
      this.orders,
      n,
      this.after,
    );
  }
  startAfter(snap: FakeDocSnapshot) {
    return new FakeQuery(
      this.db,
      this.collection,
      this.filters,
      this.orders,
      this.lim,
      snap,
    );
  }
  doc(id?: string) {
    return new FakeDocRef(this.db, this.collection, id ?? this.db.nextId());
  }
  count() {
    return {
      get: async () => ({ data: () => ({ count: this.run().length }) }),
    };
  }
  private run(): FakeDocSnapshot[] {
    let docs = this.db
      .all(this.collection)
      .map(
        ([id, v]) =>
          new FakeDocSnapshot(new FakeDocRef(this.db, this.collection, id), v),
      );
    for (const f of this.filters) {
      docs = docs.filter((d) => {
        const c = cmp((d.data() ?? {})[f.field], f.value);
        switch (f.op) {
          case '==':
            return c === 0;
          case '>':
            return c > 0;
          case '>=':
            return c >= 0;
          case '<':
            return c < 0;
          case '<=':
            return c <= 0;
        }
      });
    }
    if (this.orders.length) {
      docs.sort((a, b) => {
        for (const o of this.orders) {
          const c = cmp((a.data() ?? {})[o.field], (b.data() ?? {})[o.field]);
          if (c !== 0) return o.dir === 'asc' ? c : -c;
        }
        return a.id.localeCompare(b.id);
      });
    }
    if (this.after) {
      const idx = docs.findIndex((d) => d.id === this.after!.id);
      docs = idx >= 0 ? docs.slice(idx + 1) : docs;
    }
    if (this.lim !== undefined) docs = docs.slice(0, this.lim);
    return docs;
  }
  async get() {
    const docs = this.run();
    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
      forEach: (fn: (d: FakeDocSnapshot) => void) => docs.forEach(fn),
    };
  }
}

export class FakeTransaction {
  private writes: (() => void)[] = [];
  private writing = false;
  constructor(private readonly db: FakeFirestore) {}
  async get(target: FakeQuery | FakeDocRef) {
    if (this.writing)
      throw new Error('Firestore: leitura depois de escrita na transação');
    return target.get();
  }
  set(ref: FakeDocRef, data: Record<string, unknown>) {
    this.writing = true;
    this.writes.push(() => this.db.write(ref.collection, ref.id, data));
  }
  update(ref: FakeDocRef, data: Record<string, unknown>) {
    this.writing = true;
    this.writes.push(() => {
      const cur = this.db.read(ref.collection, ref.id);
      if (!cur) throw new Error(`update em documento inexistente ${ref.path}`);
      this.db.write(ref.collection, ref.id, { ...cur, ...data });
    });
  }
  delete(ref: FakeDocRef) {
    this.writing = true;
    this.writes.push(() => this.db.remove(ref.collection, ref.id));
  }
  commit() {
    this.writes.forEach((w) => w());
  }
}

/** Relógio determinístico: cada chamada avança 1 segundo a partir de uma base fixa. */
export class FakeClock {
  private t = Date.UTC(2026, 0, 1, 12, 0, 0);
  next(): Date {
    this.t += 1000;
    return new Date(this.t);
  }
}

export class FakeFirestore {
  private store = new Map<string, Map<string, Record<string, unknown>>>();
  private created = new Map<string, Date>();
  readonly clock = new FakeClock();
  private seq = 0;

  nextId() {
    return `id${++this.seq}`;
  }
  collection(name: string) {
    return new FakeQuery(this, name);
  }
  async runTransaction<T>(fn: (t: FakeTransaction) => Promise<T>): Promise<T> {
    const t = new FakeTransaction(this);
    const result = await fn(t);
    t.commit();
    return result;
  }

  // Acesso direto para montar cenários e inspecionar resultados.
  seed(collection: string, id: string, data: Record<string, unknown>) {
    this.write(collection, id, data);
    return id;
  }
  read(collection: string, id: string) {
    return this.store.get(collection)?.get(id);
  }
  write(collection: string, id: string, data: Record<string, unknown>) {
    if (!this.store.has(collection)) this.store.set(collection, new Map());
    const key = `${collection}/${id}`;
    if (!this.created.has(key)) this.created.set(key, this.clock.next());
    this.store.get(collection)!.set(id, { ...data });
  }
  remove(collection: string, id: string) {
    this.store.get(collection)?.delete(id);
    this.created.delete(`${collection}/${id}`);
  }
  /** createTime de um documento (primeira escrita). */
  createdAt(collection: string, id: string): Date | undefined {
    return this.created.get(`${collection}/${id}`);
  }
  all(collection: string): [string, Record<string, unknown>][] {
    return [...(this.store.get(collection)?.entries() ?? [])];
  }
}
