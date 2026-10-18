import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { param } from '@/lib/formato';
import { LIBROS, filasDiario, filasCaja, filasMayor, filasInventario, normalizarConfig, type AsientoLibro, type CuentaMayor, type FilaLibro, type Rango } from '@/herramientas/folios';
import { HojasFoliadas, type ReservaVista } from './hojas';

export const metadata: Metadata = { title: 'Hojas foliadas' };

export default async function HojasFoliadasPage({ params, searchParams }: PageProps<'/e/[empresaId]/hojas-foliadas'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const y = new Date().getFullYear();
  const libro = param(sp.libro) in LIBROS ? param(sp.libro) : 'diario';
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(param(sp.desde)) ? param(sp.desde) : `${y}-01-01`;
  const hasta0 = /^\d{4}-\d{2}-\d{2}$/.test(param(sp.hasta)) ? param(sp.hasta) : `${desde.slice(0, 4)}-12-31`;
  const hasta = hasta0 < desde ? desde : hasta0;
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const inicioAnio = `${hasta.slice(0, 4)}-01-01`;
  const [rangos, reservas, cfg] = await Promise.all([
    supabase.from('folios_rangos').select('id,desde,hasta,fecha_autorizacion,activo').eq('empresa_id', empresaId).order('desde'),
    supabase.from('folios_reservas').select('id,libro,desde,hasta,folios,estado,config,paginas,usuario,creado,cerrado_por').eq('empresa_id', empresaId).order('creado', { ascending: false }),
    supabase.from('folios_config').select('config').eq('empresa_id', empresaId).maybeSingle(),
  ]);
  let filas: FilaLibro[] = [];
  if (libro === 'inventario') {
    const { data } = await supabase.rpc('saldos_periodo', { p_empresa: empresaId, p_desde: inicioAnio, p_hasta: hasta, p_excluir_cierre: false });
    filas = filasInventario(((data ?? []) as { cuenta: string; nombre: string; debe: number; haber: number }[]).map((s) => ({ cd: s.cuenta, nm: s.nombre, saldo: Math.round(Number(s.debe) - Number(s.haber)) })));
  } else {
    const lineas = (await traerTodo((d, h) => supabase.rpc('lineas_libro', { p_empresa: empresaId, p_desde: libro === 'mayor' ? (desde < inicioAnio ? desde : inicioAnio) : desde, p_hasta: hasta }).range(d, h))) as Record<string, unknown>[];
    if (libro === 'mayor') {
      const M = new Map<string, CuentaMayor>();
      for (const l of lineas) {
        const cd = String(l.cuenta), f = String(l.fecha).slice(0, 10), m = Number(l.debe) - Number(l.haber);
        if (!M.has(cd)) M.set(cd, { cd, nm: String(l.nombre_cuenta || ''), saldoAnterior: 0, movs: [] });
        const a = M.get(cd)!;
        if (f < desde) a.saldoAnterior += m;
        else a.movs.push({ fecha: f, n: Number(l.numero), glosa: String(l.glosa), debe: Number(l.debe), haber: Number(l.haber) });
      }
      filas = filasMayor([...M.values()]);
    } else {
      const A: AsientoLibro[] = [];
      for (const l of lineas) {
        let a = A[A.length - 1];
        if (!a || a.numero !== Number(l.numero) || a.fecha !== String(l.fecha).slice(0, 10)) { a = { numero: Number(l.numero), fecha: String(l.fecha).slice(0, 10), glosa: String(l.glosa), lineas: [] }; A.push(a); }
        a.lineas.push({ cuenta: String(l.cuenta), nombre: String(l.nombre_cuenta || ''), glosa: (l.glosa_linea as string) || null, debe: Number(l.debe), haber: Number(l.haber) });
      }
      filas = libro === 'caja' ? filasCaja(A) : filasDiario(A);
    }
  }
  const rs: Rango[] = (rangos.data ?? []).map((r) => ({ id: r.id, desde: r.desde, hasta: r.hasta, activo: r.activo, fechaAutorizacion: r.fecha_autorizacion }));
  const res: ReservaVista[] = (reservas.data ?? []).map((r) => ({ id: r.id, libro: r.libro, desde: String(r.desde).slice(0, 10), hasta: String(r.hasta).slice(0, 10), folios: r.folios, estado: r.estado, config: r.config, paginas: r.paginas as FilaLibro[][], usuario: r.usuario, creado: r.creado }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Libros en hojas foliadas</h1>
        <p className="max-w-3xl text-sm text-tenue">Hojas sueltas de contabilidad computacional. Registra aquí sólo rangos de folios ya autorizados o timbrados ante el SII: la aplicación administra su uso e imprime el contenido, no solicita ni reemplaza la autorización del Servicio.</p>
      </div>
      <HojasFoliadas empresaId={empresaId} empresa={{ nombre: empresa.razon_social, rut: empresa.rut }} escribe={puedeEscribir(empresa.rol)} libro={libro} desde={desde} hasta={hasta}
        filas={filas} rangos={rs} reservas={res} config={normalizarConfig(cfg.data?.config as never)} />
    </div>
  );
}
