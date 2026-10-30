// Abono del operador de tarjetas (Transbank, Getnet, etc.): traspasa a banco las ventas con tarjeta que quedaron
// por cobrar en 1107004. El operador deposita la venta menos su comisión; la comisión se rebaja
//   · contra el proveedor del servicio (su factura de comisión se registra en Compras y el abono la deja saldada), o
//   · directo a una cuenta de gasto (sin factura).
// Asiento: Debe banco (depositado) + Debe proveedor o gasto (comisión) / Haber 1107004 (depositado + comisión).

import { CUENTA_TARJETAS } from '@/motor/contable';
import { rutParse } from '@/motor/rut';
import type { LineaAsiento } from './pago';

export const CUENTA_PROVEEDORES = '2102001';

export interface DatosAbonoTarjetas {
  banco: string;
  depositado: number;
  /** Comisión cobrada por el operador (con IVA); 0 si no hay. */
  comision: number;
  trato: 'proveedor' | 'gasto';
  rut?: string;
  razon?: string;
  cuentaGasto?: string;
  glosa?: string;
}

export type ResultadoAbono = { ok: true; glosa: string; lineas: LineaAsiento[]; total: number } | { ok: false; errores: string[] };

export function construirAbonoTarjetas(d: DatosAbonoTarjetas): ResultadoAbono {
  const errores: string[] = [];
  const dep = Math.round(+d.depositado || 0), com = Math.round(+d.comision || 0);
  if (!d.banco) errores.push('Elige el banco donde se depositó.');
  if (!(dep > 0)) errores.push('Ingresa el monto depositado.');
  if (com < 0) errores.push('La comisión no puede ser negativa.');
  const r = rutParse(d.rut ?? '');
  if (com > 0 && d.trato === 'proveedor' && !r.valido) errores.push('Ingresa un RUT válido del proveedor del servicio.');
  if (com > 0 && d.trato === 'gasto' && !d.cuentaGasto) errores.push('Elige la cuenta de gasto de la comisión.');
  if (errores.length) return { ok: false, errores };
  const total = dep + com;
  const lineas: LineaAsiento[] = [{ cuenta: d.banco, debe: dep, haber: 0, glosa: 'Abono ventas con tarjeta' }];
  if (com > 0) {
    lineas.push(d.trato === 'gasto'
      ? { cuenta: d.cuentaGasto!, debe: com, haber: 0, glosa: 'Comisión ventas con tarjeta' }
      : { cuenta: CUENTA_PROVEEDORES, debe: com, haber: 0, glosa: `Comisión ${d.razon?.trim() || 'operador de tarjetas'}`, rut_auxiliar: `${r.codigo}-${r.dv}` });
  }
  lineas.push({ cuenta: CUENTA_TARJETAS, debe: 0, haber: total, glosa: 'Ventas con tarjeta abonadas' });
  const glosa = d.glosa?.trim() || `Abono ventas con tarjeta${com > 0 ? ` (comisión $${com.toLocaleString('es-CL')})` : ''}`;
  return { ok: true, glosa, lineas, total };
}
