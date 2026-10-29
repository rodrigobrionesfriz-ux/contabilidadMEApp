// El SII nombra el archivo del RCV con el RUT de la empresa, el tipo y el período:
// RCV_COMPRA_REGISTRO_77684700-3_202607.csv · RCV_VENTA_77684700-3_202607.csv
// Con eso se evita cargar el RCV de una empresa en otra (el contenido sólo trae los RUT de proveedores o clientes).

import { rutDV, rutFmt, rutParse } from '@/motor/rut';
import type { TipoRCV } from './leer';

export interface DatosNombreRCV { rut?: string; tipo?: TipoRCV; periodo?: string }

/** RUT (sin puntos, "77684700-3"), tipo y período que trae el nombre del archivo, si los trae. */
export function datosDelNombre(nombre: string): DatosNombreRCV {
  const base = String(nombre || '').split(/[\\/]/).pop() ?? '';
  const out: DatosNombreRCV = {};
  if (/RCV_COMPRA/i.test(base)) out.tipo = 'compra';
  else if (/RCV_VENTA/i.test(base)) out.tipo = 'venta';
  // RUT con guion y DV que cuadra (así no se confunde con un folio u otro número)
  for (const m of base.matchAll(/(\d{7,8})-([\dkK])/g)) {
    if (rutDV(m[1]) === m[2].toUpperCase()) { out.rut = `${m[1]}-${m[2].toUpperCase()}`; const p = base.slice(m.index! + m[0].length).match(/^_(\d{4})(0[1-9]|1[0-2])/); if (p) out.periodo = `${p[1]}-${p[2]}`; break; }
  }
  return out;
}

const mismoRut = (a: string, b: string) => { const x = rutParse(a), y = rutParse(b); return !!x.codigo && x.codigo.replace(/^0+/, '') === y.codigo.replace(/^0+/, '') && x.dv === y.dv; };
const fmt = (r: string) => { const p = rutParse(r); return p.codigo ? rutFmt(p.codigo, p.dv) : r; };

/** Error si el archivo es de otra empresa o del otro libro; null si corresponde (o si el nombre no permite saberlo). */
export function errorArchivoRCV(nombre: string, tipo: TipoRCV, rutEmpresa: string): string | null {
  const d = datosDelNombre(nombre);
  if (d.rut && rutEmpresa && !mismoRut(d.rut, rutEmpresa))
    return `El archivo es el RCV del RUT ${fmt(d.rut)} y la empresa activa es RUT ${fmt(rutEmpresa)}. Cambia de empresa o sube el RCV de esta empresa.`;
  if (d.tipo && d.tipo !== tipo)
    return `El archivo es un RCV de ${d.tipo === 'compra' ? 'compras' : 'ventas'} y estás en el importador de ${tipo === 'compra' ? 'compras' : 'ventas'}.`;
  return null;
}
