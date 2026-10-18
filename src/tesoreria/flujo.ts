// Flujo de caja: traslado de flujocaja.js. Efectivo = cuentas 1101xxx.
//  - Realizado: entradas (cargos) y salidas (abonos) por mes; la apertura es el saldo inicial.
//  - Proyectado: efectivo actual + documentos por cobrar − por pagar, por tramo de vencimiento.
//    Diferencia con el sistema actual: usa el SALDO pendiente de cada documento (descontando pagos
//    y notas de crédito), no su total.

export const esCuentaEfectivo = (cd: string) => cd.length === 7 && cd.startsWith('1101');

export interface MovEfectivo { fecha: string; debe: number; haber: number; apertura: boolean }
export function flujoRealizado(movs: MovEfectivo[]) {
  const meses = Array.from({ length: 12 }, () => ({ entradas: 0, salidas: 0, neto: 0, saldo: 0 }));
  let saldoInicial = 0;
  for (const m of movs) {
    if (m.apertura) { saldoInicial += (m.debe || 0) - (m.haber || 0); continue; }
    const mes = +(m.fecha || '').slice(5, 7);
    if (mes >= 1 && mes <= 12) { meses[mes - 1].entradas += m.debe || 0; meses[mes - 1].salidas += m.haber || 0; }
  }
  let saldo = saldoInicial, entradas = 0, salidas = 0;
  for (const m of meses) { m.neto = m.entradas - m.salidas; saldo += m.neto; m.saldo = saldo; entradas += m.entradas; salidas += m.salidas; }
  return { meses, saldoInicial, entradas, salidas, saldoFinal: saldo };
}

export const TRAMOS = [
  { k: 'vencido', lbl: 'Vencido' }, { k: 'b30', lbl: '0–30 días' }, { k: 'b60', lbl: '31–60 días' }, { k: 'b90', lbl: '61–90 días' }, { k: 'futuro', lbl: '+90 días' },
] as const;
export type Tramo = (typeof TRAMOS)[number]['k'];
export function tramoDe(vence: string, hoy: string): Tramo {
  const d = Math.round((new Date(vence + 'T00:00:00Z').getTime() - new Date(hoy + 'T00:00:00Z').getTime()) / 86400000);
  if (d < 0) return 'vencido';
  if (d <= 30) return 'b30';
  if (d <= 60) return 'b60';
  if (d <= 90) return 'b90';
  return 'futuro';
}
export interface Pendiente { vence: string; monto: number; tipo: 'cobrar' | 'pagar' }
export function flujoProyectado(efectivo: number, pendientes: Pendiente[], hoy: string) {
  const b: Record<Tramo, { cobrar: number; pagar: number }> = { vencido: { cobrar: 0, pagar: 0 }, b30: { cobrar: 0, pagar: 0 }, b60: { cobrar: 0, pagar: 0 }, b90: { cobrar: 0, pagar: 0 }, futuro: { cobrar: 0, pagar: 0 } };
  for (const p of pendientes) { if (p.monto > 0) b[tramoDe(p.vence, hoy)][p.tipo] += p.monto; }
  let posicion = efectivo, cobrar = 0, pagar = 0;
  const filas = TRAMOS.map((t) => { const c = b[t.k].cobrar, q = b[t.k].pagar, neto = c - q; posicion += neto; cobrar += c; pagar += q; return { ...t, cobrar: c, pagar: q, neto, posicion }; });
  return { filas, efectivo, cobrar, pagar, posicionFinal: efectivo + cobrar - pagar, vencido: b.vencido };
}
