import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerirEmpresa } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { contextoRemuneraciones, indicadoresMes } from '@/lib/datos/remuneraciones';
import { liquidacionMes } from '@/remuneraciones/calculo';
import { lineaLibro, type LineaLibro } from '@/remuneraciones/libro';
import { clp, fechaCL, param, MESES } from '@/lib/formato';
import { numeroALetras } from '@/lib/numletras';
import { Imprimir } from './imprimir';
import { anioContable } from '@/lib/anio-contable';

export const metadata: Metadata = { title: 'Liquidación de sueldo' };

export default async function LiquidacionPage({ params, searchParams }: PageProps<'/e/[empresaId]/remuneraciones/liquidacion/[id]'>) {
  const { empresaId, id } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || await anioContable();
  const mes = Number(param(sp.mes)) || new Date().getMonth() + 1;
  await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const [{ ctx, trabajadores, libros, indicadores }, { data: emp }] = await Promise.all([
    contextoRemuneraciones(empresaId, anio),
    supabase.from('empresas').select('rut,razon_social,giro,domicilio,comuna,ciudad').eq('id', empresaId).single(),
  ]);
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  const t = trabajadores.find((x) => x.id === id);
  const guardado = libros.find((l) => l.periodo === periodo);
  let l: LineaLibro | undefined = guardado ? (guardado.lineas as LineaLibro[]).find((x) => x.id === id) : undefined;
  if (!l && t) {
    const { uf, utm } = indicadoresMes(ctx.P, anio, mes, indicadores);
    l = lineaLibro(t, liquidacionMes(t, uf, utm, anio, mes, ctx), periodo);
  }
  if (!l) notFound();
  const fila = (a: string, b: number | string, neg = false, negrita = false) => (
    <tr className={`border-b border-borde/40 ${negrita ? 'font-semibold' : ''}`}><td className="py-1">{a}</td><td className="num py-1 text-right">{typeof b === 'number' ? (neg && b ? `-${clp(b)}` : clp(b)) : b}</td></tr>
  );
  const lre = l.lre as Record<string, string>;
  return (
    <div className="space-y-3">
      <div className="no-print flex items-center gap-3">
        <Link href={`/e/${empresaId}/remuneraciones?anio=${anio}&mes=${mes}`} className="text-sm text-tenue hover:text-texto">← Remuneraciones</Link>
        <Imprimir />
        {!guardado && <span className="text-xs text-aviso">Provisoria: el libro del mes aún no está cerrado.</span>}
        {l.liquido < 0 && <span className="text-xs font-semibold text-peligro">⚠️ El líquido es negativo: revisa la ficha del trabajador{l.planUF > 20 ? ` (el plan Isapre dice ${String(l.planUF).replace('.', ',')} UF)` : ''}.</span>}
      </div>
      <article className="hoja tarjeta mx-auto max-w-3xl space-y-4 p-6 text-sm">
        <header className="flex justify-between gap-4 border-b border-borde pb-3">
          <div><div className="font-semibold">{emp?.razon_social}</div><div className="text-xs">RUT {emp?.rut} · {emp?.giro}</div><div className="text-xs">{[emp?.domicilio, emp?.comuna, emp?.ciudad].filter(Boolean).join(', ')}</div></div>
          <div className="text-right"><div className="font-semibold">LIQUIDACIÓN DE SUELDO</div><div>{MESES[mes - 1]} {anio}</div></div>
        </header>
        <section className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <div><span className="text-tenue">Trabajador:</span> {l.nombre}</div><div><span className="text-tenue">RUT:</span> {l.rut}</div>
          <div><span className="text-tenue">Cargo:</span> {l.cargo}</div>
          <div><span className="text-tenue">Fecha de incorporación:</span> {lre.fechaInicio ? fechaCL(lre.fechaInicio) : '—'}</div>
          <div><span className="text-tenue">AFP:</span> {l.afp}</div><div><span className="text-tenue">Salud:</span> {l.salud}{l.planUF ? ` (plan ${String(l.planUF).replace('.', ',')} UF)` : ''}</div>
          <div><span className="text-tenue">Días trabajados:</span> {l.horas != null ? `${l.horas} horas` : l.diasPagados}</div>
          <div><span className="text-tenue">Contrato:</span> {l.contrato === 'plazo' ? 'Plazo fijo' : l.contrato === 'indefinido11' ? 'Indefinido, más de 11 años' : 'Indefinido'}</div>
        </section>
        <div className="grid gap-6 sm:grid-cols-2">
          <table className="w-full text-xs">
            <thead><tr><th colSpan={2} className="pb-1 text-left text-tenue uppercase">Haberes</th></tr></thead>
            <tbody>
              {fila('Sueldo base', l.base)}{fila(`Gratificación (${l.gratDetalle.replace(' (topeada)', ', con tope')})`, l.gratificacion)}{l.otros ? fila('Otros haberes imponibles', l.otros) : null}
              {fila('Total imponible', l.totalImponible, false, true)}
              {l.colacion ? fila('Colación', l.colacion) : null}{l.movilizacion ? fila('Movilización', l.movilizacion) : null}
              {l.asigFamiliar ? fila(`Asignación familiar (tramo ${l.tramoAF})`, l.asigFamiliar) : null}
              {fila('Total haberes', l.totalHaberes, false, true)}
            </tbody>
          </table>
          <table className="w-full text-xs">
            <thead><tr><th colSpan={2} className="pb-1 text-left text-tenue uppercase">Descuentos</th></tr></thead>
            <tbody>
              {fila(`AFP ${l.afp}`, l.descAFP, true)}
              {fila(`Salud ${l.salud} (7%)`, l.saludLegal, true)}{l.adicionalIsapre ? fila('Adicional Isapre', l.adicionalIsapre, true) : null}
              {fila('Seguro de cesantía', l.descCesantia, true)}{l.descTrabPesado ? fila('Trabajo pesado', l.descTrabPesado, true) : null}
              {fila('Impuesto único', l.iusc, true)}{l.anticipo ? fila('Anticipos', l.anticipo, true) : null}
              {fila('Total descuentos', l.totalDescuentos, true, true)}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between rounded-md border border-borde px-4 py-3">
          <span className="font-semibold">LÍQUIDO A PAGAR</span><span className="num text-lg font-semibold">{clp(l.liquido)}</span>
        </div>
        <p className="text-xs">Son: {numeroALetras(l.liquido)}.</p>
        <p className="text-xs text-tenue">Certifico que he recibido de mi empleador, a mi entera satisfacción, el saldo líquido indicado en la presente liquidación, sin tener cargo ni cobro posterior que hacer.</p>
        <div className="grid grid-cols-2 gap-10 pt-10 text-center text-xs">
          <div className="border-t border-borde pt-1">Firma empleador</div><div className="border-t border-borde pt-1">Firma trabajador</div>
        </div>
      </article>
    </div>
  );
}
