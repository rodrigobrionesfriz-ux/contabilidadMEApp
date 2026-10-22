import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { saldosAuxiliar, cuentasDeTesoreria } from '@/lib/datos/auxiliares';
import { planDeEmpresa, centrosDeEmpresa } from '@/lib/datos/maestros';
import { clp, fechaCL, hoyISO, param, MESES } from '@/lib/formato';
import { claveDoc } from '@/auxiliares/saldos';
import { retencionHonorarios } from '@/importador/respaldo';
import { SelectorPeriodo } from '@/components/selector-periodo';
import { AnularDocumento } from '../libro/anular';
import { FormBoleta } from './form';
import { anioContable } from '@/lib/anio-contable';

export const metadata: Metadata = { title: 'Honorarios' };

interface Boleta {
  id: string; tipo_dte: number; folio: string; fecha: string; rut: string; razon_social: string | null; total: number;
  estado: string | null; retencion: string | null; asientos: { numero: number } | null;
}

export default async function HonorariosPage({ params, searchParams }: PageProps<'/e/[empresaId]/honorarios'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || await anioContable();
  const mes = Number(param(sp.mes)) || new Date().getMonth() + 1;
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  const empresa = await requerirEmpresa(empresaId);
  const escribe = puedeEscribir(empresa.rol);
  const supabase = await crearClienteServidor();
  const hoy = hoyISO();
  const [boletas, saldos, plan, centros, cuentas] = await Promise.all([
    traerTodo((d, h) => supabase.from('documentos').select('id,tipo_dte,folio,fecha,rut,razon_social,total,estado,retencion:datos->>retencion,asientos(numero)')
      .eq('empresa_id', empresaId).eq('tipo', 'honorario').eq('periodo', periodo).order('fecha').range(d, h)) as Promise<unknown> as Promise<Boleta[]>,
    saldosAuxiliar(empresaId, 'honorario', `${anio}-12-31` < hoy ? `${anio}-12-31` : hoy),
    escribe ? planDeEmpresa(empresaId) : Promise.resolve([]),
    escribe ? centrosDeEmpresa(empresaId) : Promise.resolve([]),
    escribe ? cuentasDeTesoreria(empresaId) : Promise.resolve([]),
  ]);
  const pendiente = new Map(saldos.flatMap((s) => s.items.map((i) => [i.clave, i.saldo] as const)));
  const vigentes = boletas.filter((b) => b.estado !== 'anulado');
  const tBruto = vigentes.reduce((a, b) => a + Number(b.total), 0);
  const tRet = vigentes.reduce((a, b) => a + Number(b.retencion ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Honorarios · {MESES[mes - 1]} {anio}</h1>
          <p className="text-sm text-tenue">Retención vigente {anio}: {(retencionHonorarios(anio) * 100).toFixed(2).replace('.', ',')}%</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <SelectorPeriodo anio={anio} mes={mes} etiquetaMes="Mes" conAnioCompleto={false} />
          <Link href={`/e/${empresaId}/pagos?tipo=honorario`} className="boton-sec">💸 Pagar honorarios</Link>
        </div>
      </div>
      {escribe && <FormBoleta empresaId={empresaId} cuentas={plan} centros={centros} tesoreria={cuentas} />}
      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="text-left text-tenue uppercase">
            <tr className="border-b border-borde">
              <th className="px-3 py-2">Fecha</th><th className="px-2 py-2">Boleta</th><th className="px-2 py-2">Prestador</th>
              <th className="px-2 py-2 text-right">Bruto</th><th className="px-2 py-2 text-right">Retención</th><th className="px-2 py-2 text-right">Líquido</th>
              <th className="px-2 py-2">Estado</th><th className="px-2 py-2">Asiento</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {boletas.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-tenue">Sin boletas en el período.</td></tr>}
            {boletas.map((b) => {
              const anulada = b.estado === 'anulado';
              const ret = Number(b.retencion ?? 0);
              const saldo = pendiente.get(claveDoc(b.rut, b.tipo_dte, b.folio)) ?? 0;
              return (
                <tr key={b.id} className={`border-b border-borde/40 ${anulada ? 'opacity-50' : ''}`}>
                  <td className="num px-3 py-1.5">{fechaCL(b.fecha)}</td>
                  <td className="num px-2 py-1.5">N° {b.folio}{b.tipo_dte === 71 && <span className="ml-1 text-tenue">sin ret.</span>}</td>
                  <td className="px-2 py-1.5"><div>{b.razon_social}</div><div className="num text-tenue">{b.rut}</div></td>
                  <td className="num px-2 py-1.5 text-right">{clp(b.total)}</td>
                  <td className="num px-2 py-1.5 text-right">{ret ? clp(ret) : ''}</td>
                  <td className="num px-2 py-1.5 text-right">{clp(Number(b.total) - ret)}</td>
                  <td className="px-2 py-1.5">
                    {anulada ? <span className="text-peligro">ANULADA</span> : saldo >= 1 ? <span className="text-aviso">Pendiente {clp(saldo)}</span> : <span className="text-acento">Pagada</span>}
                  </td>
                  <td className="num px-2 py-1.5">{b.asientos ? `N° ${b.asientos.numero}` : '—'}</td>
                  <td className="px-3 py-1.5 text-right">{!anulada && escribe && <AnularDocumento empresaId={empresaId} id={b.id} etiqueta={`boleta ${b.folio}`} />}</td>
                </tr>
              );
            })}
          </tbody>
          {vigentes.length > 0 && (
            <tfoot className="font-semibold">
              <tr className="border-t border-borde"><td colSpan={3} className="px-3 py-1.5">{vigentes.length} boletas</td>
                <td className="num px-2 py-1.5 text-right">{clp(tBruto)}</td><td className="num px-2 py-1.5 text-right">{clp(tRet)}</td>
                <td className="num px-2 py-1.5 text-right">{clp(tBruto - tRet)}</td><td colSpan={3} /></tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-tenue">La retención del mes se declara en el F29 (código 151). Anular una boleta pagada no anula su pago: anúlalo desde el libro diario.</p>
    </div>
  );
}
