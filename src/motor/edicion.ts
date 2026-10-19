// Edición de comprobantes: advertencias cuando el asiento deja de coincidir con su documento (RCV o manual).

import { rutParse } from './rut';

export interface LineaEdicion { cuenta: string; debe: number; haber: number; rut?: string | null }
export interface DocumentoAsiento {
  tipo: 'compra' | 'venta' | 'honorario' | string;
  tipo_dte?: number | null;
  folio?: string | null;
  rut?: string | null;
  iva?: number | null;
  total?: number | null;
  /** IVA recuperable de la compra (si viene en los datos del documento) */
  ivaRecuperable?: number | null;
  /** 'RCV', 'manual', etc. */
  origen?: string | null;
}

const CUENTAS_IVA = { compra: ['1108002', '1108008'], venta: ['2103003'] } as const;
const rutClave = (r?: string | null) => rutParse(r ?? '').raw;
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

/** Diferencias entre el asiento editado y el documento que lo originó. Vacío = coincide. */
export function advertenciasDocumento(doc: DocumentoAsiento, lineas: LineaEdicion[]): string[] {
  const out: string[] = [];
  const total = Math.round(Number(doc.total) || 0);
  const debe = lineas.reduce((s, l) => s + (l.debe || 0), 0);
  if (total && debe !== total) out.push(`El total del asiento (${fmt(debe)}) no coincide con el total del documento (${fmt(total)}).`);

  if (doc.tipo === 'compra' || doc.tipo === 'venta') {
    const ctas: readonly string[] = CUENTAS_IVA[doc.tipo];
    const neto = lineas.filter((l) => ctas.includes(l.cuenta)).reduce((s, l) => s + (doc.tipo === 'compra' ? l.debe - l.haber : l.haber - l.debe), 0);
    const esperado = Math.round(Number(doc.tipo === 'compra' ? (doc.ivaRecuperable ?? doc.iva) : doc.iva) || 0);
    if (neto !== esperado) out.push(`El IVA del asiento (${fmt(neto)}) no coincide con el IVA del documento (${fmt(esperado)}): el F29 y el libro de ${doc.tipo}s usan el del documento.`);

    const r = rutClave(doc.rut);
    if (r && total) {
      const aux = lineas.filter((l) => rutClave(l.rut) === r).reduce((s, l) => s + (doc.tipo === 'compra' ? l.haber - l.debe : l.debe - l.haber), 0);
      if (aux !== total) out.push(`El saldo del ${doc.tipo === 'compra' ? 'proveedor' : 'cliente'} en el asiento (${fmt(aux)}) no coincide con el total del documento (${fmt(total)}): el auxiliar y el aging quedarán descuadrados.`);
    }
  }
  return out;
}

/** ¿Cambió algún monto respecto del asiento original (misma cuenta y orden)? */
export function cambiaronMontos(antes: LineaEdicion[], despues: LineaEdicion[]): boolean {
  const k = (ls: LineaEdicion[]) => ls.map((l) => `${l.cuenta}:${l.debe}:${l.haber}`).sort().join('|');
  return k(antes) !== k(despues);
}
