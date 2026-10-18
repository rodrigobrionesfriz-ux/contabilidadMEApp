// Reglas del plan de cuentas (traslado de pdc-reglas.js). En vez de un PDC global,
// cada función recibe el plan de la empresa como parámetro.

export interface CuentaBase {
  cd: string;
  nm: string;
  /** A activo, P pasivo, C costo/gasto, I ingreso, T/S agrupadoras */
  tp?: string;
  nat?: string;
  tipoAuxiliar?: string;
  aceptaMovimientos?: boolean;
  requiereAuxiliar?: boolean;
  aceptaCentroCosto?: boolean;
  requiereCentroCosto?: boolean;
  tipoIVA?: string;
  esCuentaTributaria?: boolean;
  permiteAsientoManual?: boolean;
  permiteCierre?: boolean;
  permiteApertura?: boolean;
  activa?: boolean;
}

export interface ReglaCuenta {
  codigo: string;
  nombre: string;
  tipo: string;
  naturaleza: string;
  aceptaMovimientos: boolean;
  requiereAuxiliar: boolean;
  tipoAuxiliar: string;
  aceptaCentroCosto: boolean;
  requiereCentroCosto: boolean;
  tipoIVA: string;
  esCuentaTributaria: boolean;
  permiteAsientoManual: boolean;
  permiteCierre: boolean;
  permiteApertura: boolean;
  activa: boolean;
}

export const AUX_POR_DEFECTO: Record<string, string> = {
  '1104001': 'cliente',
  '2102001': 'proveedor',
  '2102006': 'honorario',
  '3202019': 'honorario',
};

export const IVA_POR_DEFECTO: Record<string, string> = {
  '1108002': 'iva_credito',
  '1108008': 'iva_credito_activo_fijo',
  '1108006': 'impuesto_adicional_recuperable',
  '2103003': 'iva_debito',
  '2103005': 'iva_retenido',
};

export function inferirReglasCuenta(c: CuentaBase): ReglaCuenta {
  const tp = c.tp ?? '';
  const movimiento = tp !== 'T' && tp !== 'S';
  const tipoAux = c.tipoAuxiliar || AUX_POR_DEFECTO[c.cd] || '';
  const b = (v: boolean | undefined, def: boolean) => (v != null ? !!v : def);
  return {
    codigo: c.cd,
    nombre: c.nm,
    tipo: tp,
    naturaleza: c.nat ?? '',
    aceptaMovimientos: b(c.aceptaMovimientos, movimiento),
    requiereAuxiliar: b(c.requiereAuxiliar, !!tipoAux),
    tipoAuxiliar: tipoAux,
    aceptaCentroCosto: b(c.aceptaCentroCosto, tp === 'C' || tp === 'I'),
    requiereCentroCosto: b(c.requiereCentroCosto, false),
    tipoIVA: c.tipoIVA || IVA_POR_DEFECTO[c.cd] || '',
    esCuentaTributaria: b(c.esCuentaTributaria, !!IVA_POR_DEFECTO[c.cd]),
    permiteAsientoManual: b(c.permiteAsientoManual, movimiento),
    permiteCierre: b(c.permiteCierre, movimiento),
    permiteApertura: b(c.permiteApertura, movimiento),
    activa: c.activa !== false,
  };
}

/** Plan de cuentas de una empresa, con búsqueda por código. */
export class PlanCuentas {
  private porCodigo = new Map<string, CuentaBase>();
  private reglas = new Map<string, ReglaCuenta>();
  constructor(cuentas: CuentaBase[]) {
    for (const c of cuentas) this.porCodigo.set(String(c.cd), c);
  }
  nombre(cd: string): string {
    return this.porCodigo.get(cd)?.nm ?? cd;
  }
  regla(cd: string | null | undefined): ReglaCuenta | null {
    const k = String(cd ?? '');
    if (!this.reglas.has(k)) {
      const c = this.porCodigo.get(k);
      if (!c) return null;
      this.reglas.set(k, inferirReglasCuenta(c));
    }
    return this.reglas.get(k) ?? null;
  }
}

export interface MovimientoValidable {
  cd: string;
  rutCodigo?: string;
  cc?: string;
}

export function validarMovimiento(
  plan: PlanCuentas,
  m: MovimientoValidable,
  { manual = false, apertura = false, cierre = false } = {},
): string[] {
  const errs: string[] = [];
  const r = plan.regla(m.cd);
  if (!r) return [`La cuenta ${m.cd || '(vacía)'} no existe en el Plan de Cuentas`];
  if (!r.activa) errs.push(`La cuenta ${m.cd} está inactiva`);
  if (!r.aceptaMovimientos) errs.push(`La cuenta ${m.cd} es agrupadora y no acepta movimientos`);
  if (manual && !r.permiteAsientoManual) errs.push(`La cuenta ${m.cd} no permite asientos manuales`);
  if (apertura && !r.permiteApertura) errs.push(`La cuenta ${m.cd} no permite apertura`);
  if (cierre && !r.permiteCierre) errs.push(`La cuenta ${m.cd} no permite cierre`);
  if (r.requiereAuxiliar && !m.rutCodigo) errs.push(`La cuenta ${m.cd} requiere auxiliar (${r.tipoAuxiliar || 'identificación'})`);
  if (r.requiereCentroCosto && !m.cc) errs.push(`La cuenta ${m.cd} exige centro de costo`);
  if (m.cc && !r.aceptaCentroCosto) errs.push(`La cuenta ${m.cd} no admite centro de costo`);
  return errs;
}

export function validarMovimientos(plan: PlanCuentas, movs: MovimientoValidable[], opts = {}) {
  const errores: string[] = [];
  movs.forEach((m, i) => validarMovimiento(plan, m, opts).forEach((e) => errores.push(`Línea ${i + 1}: ${e}`)));
  return { ok: errores.length === 0, errores };
}
