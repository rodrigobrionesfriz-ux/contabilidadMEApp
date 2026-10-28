// Resumen de la empresa: cálculos puros a partir de las sumas por cuenta de
// cada mes (balance_comprobacion del mes). Mismo criterio que el dashboard del
// sistema actual (dashboard.js):
//   · Ingresos = cuentas tipo I (haber − debe) · Gastos = tipo C (debe − haber)
//   · Disponible = cuentas 1101xxx (caja y bancos), saldo acumulado al cierre.

export interface SumaMes { cuenta: string; nombre: string; tipo: string; debe: number; haber: number }

export interface Resumen {
  /** índice 0..11 = enero..diciembre */
  ingresos: number[];
  gastos: number[];
  resultadoAcumulado: number[];
  disponible: number[];
  /** cuenta → movimiento neto (debe − haber) de cada mes */
  netoCuenta: Record<string, number[]>;
  nombres: Record<string, string>;
  tipos: Record<string, string>;
}

export const esDisponible = (cd: string) => /^1101\d{3}$/.test(cd);

export function resumenAnual(meses: SumaMes[][]): Resumen {
  const ingresos = Array(12).fill(0), gastos = Array(12).fill(0);
  const netoCuenta: Record<string, number[]> = {}, nombres: Record<string, string> = {}, tipos: Record<string, string> = {};
  meses.slice(0, 12).forEach((filas, i) => {
    for (const f of filas || []) {
      const d = Number(f.debe) || 0, h = Number(f.haber) || 0;
      nombres[f.cuenta] = f.nombre;
      tipos[f.cuenta] = f.tipo;
      (netoCuenta[f.cuenta] ??= Array(12).fill(0))[i] += d - h;
      if (f.tipo === 'I') ingresos[i] += h - d;
      else if (f.tipo === 'C') gastos[i] += d - h;
    }
  });
  const resultadoAcumulado: number[] = [], disponible: number[] = [];
  let r = 0, s = 0;
  for (let i = 0; i < 12; i++) {
    r += ingresos[i] - gastos[i];
    resultadoAcumulado.push(r);
    for (const [cd, arr] of Object.entries(netoCuenta)) if (esDisponible(cd)) s += arr[i];
    disponible.push(s);
  }
  return { ingresos, gastos, resultadoAcumulado, disponible, netoCuenta, nombres, tipos };
}

/** Variación porcentual contra el mes anterior (null si no hay base). */
export const variacion = (a: number, b: number) => (b ? ((a - b) / Math.abs(b)) * 100 : null);

/** Último mes con movimiento hasta `tope` (1-12); si no hay ninguno, `tope`. */
export function mesConMovimiento(r: Resumen, tope: number) {
  for (let m = tope; m >= 1; m--) {
    if (r.ingresos[m - 1] || r.gastos[m - 1] || Object.values(r.netoCuenta).some((a) => a[m - 1])) return m;
  }
  return tope;
}

/** Cuentas de balance con saldo contrario a lo esperado al cierre del mes (caja, bancos, clientes, proveedores). */
export function saldosContrarios(r: Resumen, mes: number) {
  const out: { cuenta: string; nombre: string; saldo: number; motivo: string }[] = [];
  for (const [cd, arr] of Object.entries(r.netoCuenta)) {
    const saldo = arr.slice(0, mes).reduce((s, v) => s + v, 0);
    if (r.tipos[cd] === 'A' && /^110[1-4]/.test(cd) && saldo < -1) out.push({ cuenta: cd, nombre: r.nombres[cd], saldo, motivo: 'saldo acreedor' });
    if (r.tipos[cd] === 'P' && /^210[1-5]/.test(cd) && saldo > 1) out.push({ cuenta: cd, nombre: r.nombres[cd], saldo, motivo: 'saldo deudor' });
  }
  return out;
}

/** Gastos por cuenta de enero al mes, de mayor a menor. */
export function gastosPorCuenta(r: Resumen, mes: number, top = 7) {
  return Object.entries(r.netoCuenta)
    .filter(([cd]) => r.tipos[cd] === 'C')
    .map(([cd, arr]) => ({ cuenta: cd, nombre: r.nombres[cd], monto: arr.slice(0, mes).reduce((s, v) => s + v, 0) }))
    .filter((x) => x.monto > 0)
    .sort((a, b) => b.monto - a.monto)
    .slice(0, top);
}
