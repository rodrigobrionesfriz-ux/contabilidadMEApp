// Saldos de auxiliares (clientes, proveedores, honorarios) a partir del mayor.
// Cada línea de una cuenta auxiliar trae RUT y, si corresponde, tipo DTE y folio.
// Reglas (equivalentes a pagos.js y calcularAging del sistema actual):
//   1. Los movimientos con el mismo DTE y folio forman un documento (cargo − abonos ligados).
//   2. Una nota de crédito con folio de referencia se aplica a ese documento.
//   3. Abonos sin documento y notas sin referencia se imputan FIFO a lo más antiguo.
//   4. Lo que sobra queda como saldo a favor.
//   5. El aging clasifica el saldo de cada documento por días desde su vencimiento.

export type TipoAuxiliar = 'cliente' | 'proveedor' | 'honorario';

export interface LineaAux {
  cuenta: string;
  rut: string;
  tipo_dte: number | null;
  folio: string | null;
  fecha: string;
  numero: number;
  glosa: string | null;
  debe: number;
  haber: number;
}

export interface InfoDoc {
  fecha?: string | null;
  vence?: string | null;
  razon?: string | null;
  refFolio?: string | null;
}

export interface ItemSaldo {
  clave: string;
  tipo_dte: number | null;
  folio: string | null;
  fecha: string;
  vence: string;
  descripcion: string;
  cargo: number;
  abonos: number;
  saldo: number;
  cuenta: string;
}

export interface SaldoRut {
  rut: string;
  razon: string;
  saldo: number;
  aFavor: number;
  items: ItemSaldo[];
  buckets: Record<BucketKey, number>;
  movimientos: (LineaAux & { monto: number })[];
}

export const BUCKETS = [
  { k: 'aldia', lbl: 'Al día', min: -Infinity, max: 0 },
  { k: 'd30', lbl: '1-30', min: 1, max: 30 },
  { k: 'd60', lbl: '31-60', min: 31, max: 60 },
  { k: 'd90', lbl: '61-90', min: 61, max: 90 },
  { k: 'd120', lbl: '91-120', min: 91, max: 120 },
  { k: 'mas', lbl: '+120', min: 121, max: Infinity },
] as const;
export type BucketKey = (typeof BUCKETS)[number]['k'];

const NOTAS_CREDITO = new Set([61]);
export const claveDoc = (rut: string, tipoDte: number | null | undefined, folio: string | null | undefined) =>
  `${rut}|${Number(tipoDte) || 0}|${String(folio ?? '').trim()}`;

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000);
}

export function bucketDe(dias: number): BucketKey {
  return (BUCKETS.find((b) => dias >= b.min && dias <= b.max) ?? BUCKETS[0]).k;
}

/** Signo económico: cuánto aumenta lo adeudado (cliente: debe − haber; proveedor/honorario: haber − debe). */
export const naturaleza = (tipo: TipoAuxiliar) => (tipo === 'cliente' ? 1 : -1);

export function calcularSaldos(tipo: TipoAuxiliar, lineas: LineaAux[], docs: Map<string, InfoDoc>, hoy: string): SaldoRut[] {
  const s = naturaleza(tipo);
  const porRut = new Map<string, LineaAux[]>();
  for (const l of lineas) {
    if (!l.rut) continue;
    (porRut.get(l.rut) ?? porRut.set(l.rut, []).get(l.rut)!).push(l);
  }
  const out: SaldoRut[] = [];
  for (const [rut, ls] of porRut) {
    const movimientos = ls.map((l) => ({ ...l, monto: s * (Number(l.debe) - Number(l.haber)) }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero);
    const grupos = new Map<string, ItemSaldo>();
    const sinDoc: ItemSaldo[] = [];
    let pozo = 0; // abonos por imputar (positivo)
    let razon = '';
    for (const m of movimientos) {
      if (m.folio && String(m.folio).trim()) {
        const clave = claveDoc(rut, m.tipo_dte, m.folio);
        const info = docs.get(clave);
        if (info?.razon && !razon) razon = info.razon;
        let g = grupos.get(clave);
        if (!g) {
          g = { clave, tipo_dte: m.tipo_dte, folio: String(m.folio).trim(), fecha: info?.fecha || m.fecha, vence: info?.vence || info?.fecha || m.fecha,
            descripcion: m.glosa ?? '', cargo: 0, abonos: 0, saldo: 0, cuenta: m.cuenta };
          grupos.set(clave, g);
        }
        if (m.monto >= 0) g.cargo += m.monto; else g.abonos += -m.monto;
        g.saldo += m.monto;
      } else if (m.monto > 0) {
        sinDoc.push({ clave: `${rut}|sd|${m.numero}|${sinDoc.length}`, tipo_dte: null, folio: null, fecha: m.fecha, vence: m.fecha,
          descripcion: m.glosa || 'Movimiento sin documento', cargo: m.monto, abonos: 0, saldo: m.monto, cuenta: m.cuenta });
      } else {
        pozo += -m.monto;
      }
    }
    // Documentos con saldo negativo (notas de crédito, pagos de más): se aplican a su referencia o van al pozo
    const items = [...grupos.values()];
    for (const g of items) {
      if (g.saldo >= 0) continue;
      const ref = NOTAS_CREDITO.has(Number(g.tipo_dte)) ? docs.get(g.clave)?.refFolio : null;
      const destino = ref ? items.find((x) => x !== g && x.folio === String(ref).trim() && x.saldo > 0) : undefined;
      if (destino) {
        const aplica = Math.min(destino.saldo, -g.saldo);
        destino.saldo -= aplica; destino.abonos += aplica; g.saldo += aplica;
      }
      if (g.saldo < 0) { pozo += -g.saldo; g.saldo = 0; }
    }
    // FIFO del pozo sobre documentos y movimientos sin documento, del más antiguo al más nuevo
    const cola = [...items.filter((x) => x.saldo > 0), ...sinDoc]
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.folio ?? '').localeCompare(String(b.folio ?? '')));
    for (const x of cola) {
      if (pozo <= 0) break;
      const aplica = Math.min(x.saldo, pozo);
      x.saldo -= aplica; x.abonos += aplica; pozo -= aplica;
    }
    const conSaldo = [...items, ...sinDoc].filter((x) => Math.abs(x.saldo) >= 1)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    const buckets = Object.fromEntries(BUCKETS.map((b) => [b.k, 0])) as Record<BucketKey, number>;
    for (const x of conSaldo) buckets[bucketDe(diasEntre(x.vence, hoy))] += x.saldo;
    const aFavor = pozo >= 1 ? -pozo : 0;
    buckets.aldia += aFavor;
    const saldo = conSaldo.reduce((a, x) => a + x.saldo, 0) + aFavor;
    if (!razon) razon = movimientos.find((m) => m.glosa)?.glosa?.split(' · ')[0] ?? '';
    out.push({ rut, razon, saldo, aFavor, items: conSaldo, buckets, movimientos });
  }
  return out.sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
}

export function totalesAging(saldos: SaldoRut[]) {
  const t = Object.fromEntries(BUCKETS.map((b) => [b.k, 0])) as Record<BucketKey, number>;
  for (const r of saldos) for (const b of BUCKETS) t[b.k] += r.buckets[b.k];
  return { buckets: t, total: saldos.reduce((a, r) => a + r.saldo, 0) };
}
