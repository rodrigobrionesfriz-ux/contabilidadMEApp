import type { Metadata } from 'next';
import { requerirEmpresa } from '@/lib/auth';
import { lineasDelMes } from '@/lib/datos/remuneraciones';
import { construirImposiciones, hojasImposiciones } from '@/herramientas/imposiciones';
import { clp, MESES, param } from '@/lib/formato';
import { Pestanas } from '../pestanas';
import { ExcelImposiciones } from './excel';
import { anioContable } from '@/lib/anio-contable';

export const metadata: Metadata = { title: 'Imposiciones del mes' };

export default async function ImposicionesPage({ params, searchParams }: PageProps<'/e/[empresaId]/remuneraciones/imposiciones'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const hoy = new Date();
  const anio = Number(param(sp.anio)) || await anioContable();
  const mes = Number(param(sp.mes)) || hoy.getMonth() + 1;
  const empresa = await requerirEmpresa(empresaId);
  const d = await lineasDelMes(empresaId, anio, mes);
  const I = construirImposiciones({ periodo: d.periodo, lineas: d.lineas, cerrado: !!d.guardado }, d.ctx.P);
  const per = `${MESES[mes - 1]} ${anio}`;
  const hojas = hojasImposiciones(I, { nombre: empresa.razon_social, rut: empresa.rut }, per);
  const q = `?anio=${anio}&mes=${mes}`;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Remuneraciones</h1>
      <Pestanas empresaId={empresaId} activa="/imposiciones" query={q} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Detalle del pago de imposiciones · {per}</h2>
          <p className="text-sm text-tenue">Cuánto se paga a cada institución y por qué concepto, separando lo descontado al trabajador del aporte del empleador. Usa el libro {d.guardado ? 'cerrado' : 'provisorio (calculado en vivo)'} y el mismo reparto del archivo Previred. No incluye el impuesto único, que va en el F29.</p>
        </div>
        <div className="flex items-end gap-2">
          <form className="flex items-end gap-2">
            <div><label className="etiqueta" htmlFor="mes">Mes</label><select id="mes" name="mes" defaultValue={mes} className="campo w-36">{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
            <div><label className="etiqueta" htmlFor="anio">Año</label><select id="anio" name="anio" defaultValue={anio} className="campo w-28">{Array.from({ length: 5 }, (_, i) => hoy.getFullYear() + 1 - i).map((y) => <option key={y}>{y}</option>)}</select></div>
            <button className="boton-sec">Ver</button>
          </form>
          {I.detalle.length > 0 && <ExcelImposiciones hojas={hojas} nombre={`${empresa.razon_social.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}_imposiciones_${d.periodo}.xlsx`} />}
        </div>
      </div>
      {!I.detalle.length ? <p className="tarjeta p-6 text-center text-tenue">No hay trabajadores con remuneración en el período.</p> : <>
        <div className="grid gap-3 sm:grid-cols-4">
          {([['Total a pagar', I.totales.total], ['Descontado a trabajadores', I.totales.trabajador], ['Aporte del empleador', I.totales.empleador], ['Asignación familiar (se descuenta)', -I.totales.asigFam]] as [string, number][]).map(([k, v]) => <div key={k} className="tarjeta p-3"><div className="text-[10px] text-tenue uppercase">{k}</div><div className="num text-lg font-semibold">{clp(v)}</div></div>)}
        </div>
        {I.avisos.includes('libro') && <p className="rounded-md border border-aviso/40 p-2 text-sm text-aviso">Aviso: el libro de este mes se cerró con una versión anterior; la comisión AFP va incluida en la cotización obligatoria. Reábrelo y ciérralo de nuevo para separarla.</p>}
        <div className="tarjeta overflow-x-auto p-3"><table className="w-full min-w-[700px] text-xs">
          <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Institución</th><th>Concepto</th><th>Cargo de</th><th className="text-right">Trabajadores</th><th className="text-right">Monto</th></tr></thead>
          <tbody>{I.instituciones.map((i) => [
            ...i.conceptos.map((c, k) => <tr key={i.institucion + k} className="border-b border-borde/20"><td className="py-1">{k === 0 ? <strong>{i.institucion}</strong> : ''}</td><td>{c.concepto}</td><td className="text-tenue">{c.cargo}</td><td className="num text-right">{c.trabajadores}</td><td className={`num text-right ${c.monto < 0 ? 'text-peligro' : ''}`}>{clp(c.monto)}</td></tr>),
            <tr key={i.institucion + 't'} className="border-b border-borde font-semibold"><td /><td colSpan={3} className="py-1">Total {i.institucion}</td><td className="num text-right">{clp(i.total)}</td></tr>,
          ])}</tbody>
          <tfoot><tr className="text-sm font-bold"><td colSpan={4} className="py-2">TOTAL A PAGAR EN IMPOSICIONES</td><td className="num text-right">{clp(I.totales.total)}</td></tr></tfoot>
        </table></div>
      </>}
    </div>
  );
}
