import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { calcularSaldos, claveDoc, type InfoDoc, type LineaAux, type SaldoRut, type TipoAuxiliar } from '@/auxiliares/saldos';

const TIPO_DOC: Record<TipoAuxiliar, string> = { cliente: 'venta', proveedor: 'compra', honorario: 'honorario' };

/** Saldos por RUT del ejercicio (1 de enero del año de `hasta` hasta esa fecha; incluye la apertura). */
export async function saldosAuxiliar(empresaId: string, tipo: TipoAuxiliar, hasta: string, hoy = hasta): Promise<SaldoRut[]> {
  const supabase = await crearClienteServidor();
  const anio = Number(hasta.slice(0, 4));
  const [lineas, docs] = await Promise.all([
    traerTodo((d, h) => supabase.rpc('movimientos_auxiliar', { p_empresa: empresaId, p_tipo_auxiliar: tipo, p_desde: `${anio}-01-01`, p_hasta: hasta }).range(d, h)),
    traerTodo((d, h) => supabase.from('documentos')
      .select('rut,tipo_dte,folio,fecha,razon_social,vence:datos->>fechaVencimiento,ref:datos->referencia->>folio')
      .eq('empresa_id', empresaId).eq('tipo', TIPO_DOC[tipo]).gte('fecha', `${anio - 1}-01-01`).neq('estado', 'anulado')
      .order('fecha').range(d, h)),
  ]);
  const info = new Map<string, InfoDoc>();
  for (const x of docs as { rut: string; tipo_dte: number; folio: string; fecha: string; razon_social: string | null; vence: string | null; ref: string | null }[]) {
    info.set(claveDoc(x.rut, x.tipo_dte, x.folio), { fecha: x.fecha, vence: x.vence, razon: x.razon_social, refFolio: x.ref });
  }
  const ls = (lineas as LineaAux[]).map((l) => ({ ...l, fecha: String(l.fecha).slice(0, 10), debe: Number(l.debe), haber: Number(l.haber) }));
  return calcularSaldos(tipo, ls, info, hoy);
}

/** Cuentas de caja y banco (1101xxx imputables y activas). */
export async function cuentasDeTesoreria(empresaId: string) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('cuentas').select('codigo,nombre')
    .eq('empresa_id', empresaId).like('codigo', '1101%').eq('acepta_movimientos', true).eq('activa', true).order('codigo');
  if (error) throw new Error(error.message);
  return data;
}
