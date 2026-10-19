import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { param } from '@/lib/formato';

export const metadata: Metadata = { title: 'Registro de actividad' };

// Nombre legible e ícono de cada acción registrada por la base
const ACCIONES: Record<string, [string, string]> = {
  crear_asiento: ['➕', 'Registró un asiento'], anular_asiento: ['🚫', 'Anuló un asiento'], registrar_documento: ['🧾', 'Registró un documento'], anular_documento: ['🚫', 'Anuló un documento'],
  cerrar_periodo: ['🔒', 'Cerró un mes'], reabrir_periodo: ['🔓', 'Reabrió un mes'], cerrar_ejercicio: ['🔒', 'Cerró el ejercicio'], reabrir_ejercicio: ['🔓', 'Reabrió el ejercicio'], generar_apertura: ['🔰', 'Generó la apertura'], guardar_apertura: ['🏁', 'Registró o corrigió el balance de apertura'], editar_asiento: ['✏️', 'Editó un comprobante'],
  cerrar_libro_remuneraciones: ['📗', 'Cerró el libro de remuneraciones'], reabrir_libro_remuneraciones: ['📗', 'Reabrió el libro de remuneraciones'], contabilizar_finiquito: ['📝', 'Contabilizó un finiquito'],
  importar_respaldo: ['📥', 'Importó un respaldo'], eliminar_importacion: ['🗑', 'Eliminó una importación'], crear_empresa: ['🏢', 'Creó la empresa'], inventario: ['📦', 'Cambió el inventario'],
  asignar_centro_costo: ['🌳', 'Asignó centros de costo'], folios_rango: ['📑', 'Registró un rango de folios'], folios_reserva: ['🖨️', 'Reservó folios para imprimir'], folios_usado: ['✅', 'Confirmó folios usados'], folios_inutilizado: ['✕', 'Marcó folios inutilizados'],
  guardar_renta: ['🧾', 'Guardó la declaración de renta'], estado_dj: ['📋', 'Cambió el estado de una declaración jurada'], crear_plantilla: ['📋', 'Creó un asiento tipo'], editar_plantilla: ['✏️', 'Editó un asiento tipo'], eliminar_plantilla: ['🗑', 'Eliminó un asiento tipo'],
  exportar_excel: ['📊', 'Exportó la contabilidad a Excel'], exportar_iecv: ['📤', 'Generó el XML IECV'],
};
const resumen = (d: Record<string, unknown>) => Object.entries(d || {}).filter(([k, v]) => v != null && v !== '' && !['id', 'operaciones'].includes(k) && typeof v !== 'object').map(([k, v]) => `${k}: ${v}`).join(' · ');

export default async function ActividadPage({ params, searchParams }: PageProps<'/e/[empresaId]/actividad'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const empresa = await requerirEmpresa(empresaId);
  if (empresa.rol !== 'admin') return <p className="tarjeta p-6 text-center text-tenue">🚫 Sólo los administradores pueden ver el registro de actividad.</p>;
  const antes = param(sp.antes) || null;
  const filtro = param(sp.accion);
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc('actividad_empresa', { p_empresa: empresaId, p_limite: 300, p_antes: antes });
  if (error) throw new Error(error.message);
  const filas = (data as { id: number; creado: string; accion: string; detalle: Record<string, unknown>; usuario: string }[]).filter((f) => !filtro || f.accion === filtro);
  const ultimo = (data as { creado: string }[]).at(-1)?.creado;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Registro de actividad</h1>
          <p className="text-sm text-tenue">Acciones registradas por la base de datos con usuario y fecha. Desde la aplicación no se puede editar ni borrar.</p>
        </div>
        <form className="flex items-end gap-2">
          <div><label className="etiqueta" htmlFor="accion">Acción</label>
            <select id="accion" name="accion" defaultValue={filtro} className="campo w-72"><option value="">Todas</option>{Object.entries(ACCIONES).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <button className="boton-sec">Filtrar</button>
        </form>
      </div>
      <div className="tarjeta overflow-x-auto"><table className="w-full min-w-[720px] text-xs">
        <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="w-8 p-2" /><th>Acción</th><th>Usuario</th><th className="pr-2">Fecha</th></tr></thead>
        <tbody>{filas.length ? filas.map((f) => {
          const [ico, lbl] = ACCIONES[f.accion] || ['📝', f.accion];
          return (
            <tr key={f.id} className="border-b border-borde/30 align-top">
              <td className="p-2 text-center text-base">{ico}</td>
              <td className="py-1.5">{lbl}{resumen(f.detalle) && <div className="num text-[10px] text-tenue">{resumen(f.detalle)}</div>}</td>
              <td>{f.usuario || '–'}</td>
              <td className="num pr-2 whitespace-nowrap text-tenue">{new Date(f.creado).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
            </tr>
          );
        }) : <tr><td colSpan={4} className="p-6 text-center text-tenue">Sin actividad registrada.</td></tr>}</tbody>
      </table></div>
      {(data as unknown[]).length === 300 && ultimo && <Link className="boton-sec" href={`?antes=${encodeURIComponent(ultimo)}${filtro ? `&accion=${filtro}` : ''}`}>Ver más antiguas →</Link>}
    </div>
  );
}
