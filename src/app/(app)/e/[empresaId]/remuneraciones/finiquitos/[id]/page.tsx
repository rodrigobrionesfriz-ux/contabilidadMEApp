import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { finiquitosDeEmpresa, plantillasFiniquito, empresaParaDocumentos, contextoFiniquitos, indicadoresMes, centrosDeEmpresaLista } from '@/lib/datos/remuneraciones';
import { calcularFiniquito, plantillasDisponibles, textoFiniquito, valoresMarcadores, bloquesDocumento, marcadoresPendientes, combinar, CUENTAS_FIN, type FormFiniquito, type FiniquitoOk, type LineaFin } from '@/remuneraciones/finiquito';
import { clp, fechaCL } from '@/lib/formato';
import { numeroALetras } from '@/lib/numletras';
import { AccionesFiniquito } from './acciones-doc';

export const metadata: Metadata = { title: 'Finiquito' };

export default async function FiniquitoPage({ params }: PageProps<'/e/[empresaId]/remuneraciones/finiquitos/[id]'>) {
  const { empresaId, id } = await params;
  const empresa = await requerirEmpresa(empresaId);
  const [f] = await finiquitosDeEmpresa(empresaId, id);
  if (!f) notFound();
  const d = f.datos as unknown as FormFiniquito;
  const anio = +f.fecha_termino.slice(0, 4), mes = +f.fecha_termino.slice(5, 7);
  const [guardadas, E, { ctx, trabajadores, feriados }, centros] = await Promise.all([plantillasFiniquito(empresaId), empresaParaDocumentos(empresaId), contextoFiniquitos(empresaId, anio), centrosDeEmpresaLista(empresaId)]);
  const t = trabajadores.find((x) => x.id === f.trabajador_id) || null;
  // Recalcula con los datos guardados; si no se puede, usa la foto del cálculo
  const rc = t ? calcularFiniquito(t, d, { ctx, utm: indicadoresMes(ctx.P, anio, mes).utm, feriados }) : null;
  const foto = f.calc as unknown as { lineas: LineaFin[]; desc: LineaFin[]; total: number; inicio?: string };
  const r: FiniquitoOk | null = rc && rc.ok ? rc : null;
  const det = r || { lineas: foto.lineas, desc: foto.desc, total: f.total };
  const cambio = r && Math.round(r.total) !== Math.round(f.total);
  const plantillas = plantillasDisponibles(guardadas);
  const texto = textoFiniquito({ texto: f.texto, plantillaId: d.plantillaId, causal: f.causal }, plantillas);
  const vals = valoresMarcadores(d, t, r, E);
  if (!r) { vals.total = clp(f.total); vals.total_palabras = numeroALetras(f.total); }
  const bloques = bloquesDocumento(texto, vals, det);
  const pendientes = marcadoresPendientes(texto, vals);
  const faltan = /\[(indicar los hechos|fecha de aviso)\]/.test(combinar(texto, vals));
  const contabilizado = !!(f.asiento && !f.asiento.anulado);
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href={`/e/${empresaId}/remuneraciones/finiquitos`} className="text-sm text-tenue hover:text-texto">← Finiquitos</Link>
        <span className="text-xs text-tenue">{f.estado === 'ratificado' ? `✅ Ratificado${f.ratificado_en ? ' el ' + new Date(f.ratificado_en).toLocaleDateString('es-CL') : ''}` : 'Borrador'}</span>
      </div>
      {pendientes.length > 0 && <p className="no-print text-xs text-amber-500">⚠️ Marcadores sin reemplazar: {pendientes.join(', ')}</p>}
      {faltan && <p className="no-print text-xs text-amber-500">⚠️ Faltan datos en el texto (fecha de aviso o hechos). Complétalos editando el finiquito.</p>}
      {(!E.rep || !E.rutrep || !E.domicilio) && <p className="no-print text-xs text-amber-500">⚠️ Faltan datos de la empresa para el documento (representante legal, su RUT o domicilio). Complétalos en Configuración → Empresa.</p>}
      {cambio && <p className="no-print text-xs text-amber-500">⚠️ El cálculo cambió desde que se guardó (guardado {clp(f.total)}, ahora {clp(r!.total)}): edita y guarda el finiquito de nuevo.</p>}
      <article className="hoja tarjeta mx-auto max-w-3xl space-y-4 p-10 text-sm leading-relaxed">
        {bloques.map((b, i) => b.tipo === 'titulo' ? <h1 key={i} className="text-center text-base font-bold tracking-wide whitespace-pre-line">{b.texto}</h1>
          : b.tipo === 'detalle' ? (
            <table key={i} className="mx-auto w-full max-w-xl text-xs">
              <tbody>
                <tr><td colSpan={2} className="pt-1 font-semibold">HABERES</td></tr>
                {det.lineas.map((x, j) => <tr key={j} className="border-b border-borde/30"><td className="py-1 pr-3">{x.d}</td><td className="num text-right whitespace-nowrap">{clp(x.m)}</td></tr>)}
                <tr className="font-semibold"><td className="py-1">Total haberes</td><td className="num text-right">{clp(det.lineas.reduce((s, x) => s + x.m, 0))}</td></tr>
                {det.desc.length > 0 && <tr><td colSpan={2} className="pt-2 font-semibold">DESCUENTOS</td></tr>}
                {det.desc.map((x, j) => <tr key={j} className="border-b border-borde/30"><td className="py-1 pr-3">{x.d}</td><td className="num text-right whitespace-nowrap">{clp(x.m)}</td></tr>)}
                {det.desc.length > 0 && <tr className="font-semibold"><td className="py-1">Total descuentos</td><td className="num text-right">{clp(det.desc.reduce((s, x) => s + x.m, 0))}</td></tr>}
                <tr className="border-t-2 border-borde text-sm font-bold"><td className="py-1.5">TOTAL A PAGAR</td><td className="num text-right">{clp(det.total)}</td></tr>
              </tbody>
            </table>
          ) : <p key={i} className="text-justify whitespace-pre-line">{b.rotulo && <b>{b.rotulo}</b>}{b.texto}</p>)}
        <div className="grid grid-cols-2 gap-10 pt-16 text-center text-xs">
          <div><div className="mb-1 border-t border-current" /><b>{vals.trabajador}</b><div>RUT {vals.rut_trabajador}</div><div>Trabajador</div></div>
          <div><div className="mb-1 border-t border-current" /><b>{E.nombre}</b><div>RUT {E.rut}</div><div>{E.rep ? `p.p. ${E.rep}` : 'Empleador'}</div></div>
        </div>
        <div className="mx-auto w-1/2 pt-12 text-center text-xs"><div className="mb-1 border-t border-current" /><b>Ministro de fe</b><div>Nombre, firma y timbre</div></div>
      </article>
      <AccionesFiniquito empresaId={empresaId} id={id} escribe={puedeEscribir(empresa.rol)} ratificado={f.estado === 'ratificado'}
        contabilizado={contabilizado ? { numero: f.asiento!.numero, fecha: f.asiento!.fecha } : null} anulado={!!(f.asiento && f.asiento.anulado)}
        puedeContabilizar={!!r && !cambio && r.total > 0} fechaTermino={f.fecha_termino} centros={centros}
        conceptos={Object.entries(CUENTAS_FIN).map(([k, v]) => ({ k, cd: v.cd, nm: v.nm, prov: v.prov, ayuda: v.ayuda }))}
        lineasCalc={r ? { mes: r.lineas.some((x) => x.k === 'mes'), feriado: r.lineas.some((x) => x.k === 'feriado'), ias: r.lineas.some((x) => x.k === 'ias' || x.k === 'aviso'), extraH: r.lineas.some((x) => x.k === 'extra'), afc: r.afc > 0, extraD: r.desc.some((x) => x.k === 'extra') } : null} />
      <p className="no-print text-center text-[10px] text-tenue">Término {fechaCL(f.fecha_termino)} · Total {clp(f.total)}</p>
    </div>
  );
}
