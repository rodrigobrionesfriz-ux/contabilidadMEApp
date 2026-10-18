import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { finiquitosDeEmpresa } from '@/lib/datos/remuneraciones';
import { causalInfo } from '@/remuneraciones/finiquito';
import { clp, fechaCL } from '@/lib/formato';
import { Pestanas } from '../pestanas';

export const metadata: Metadata = { title: 'Finiquitos' };

export default async function FiniquitosPage({ params }: PageProps<'/e/[empresaId]/remuneraciones/finiquitos'>) {
  const { empresaId } = await params;
  const empresa = await requerirEmpresa(empresaId);
  const lista = await finiquitosDeEmpresa(empresaId);
  const escribe = puedeEscribir(empresa.rol);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Finiquitos</h1>
          <p className="text-sm text-tenue">Feriado proporcional, indemnizaciones (Arts. 161 a 163 y 172 del Código del Trabajo), documento con plantilla editable y asiento contable.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/e/${empresaId}/remuneraciones/finiquitos/plantillas`} className="boton-sec">📄 Plantillas</Link>
          {escribe && <Link href={`/e/${empresaId}/remuneraciones/finiquitos/nuevo`} className="boton">+ Finiquito</Link>}
        </div>
      </div>
      <Pestanas empresaId={empresaId} activa="/finiquitos" />
      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[800px] text-xs">
          <thead className="text-left text-tenue uppercase">
            <tr className="border-b border-borde"><th className="px-3 py-2">Trabajador</th><th className="px-2 py-2">Término</th><th className="px-2 py-2">Causal</th>
              <th className="px-2 py-2 text-right">Total</th><th className="px-2 py-2">Estado</th><th className="px-2 py-2">Asiento</th><th /></tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-tenue">Aún no hay finiquitos.</td></tr>}
            {lista.map((f) => (
              <tr key={f.id} className="border-b border-borde/40">
                <td className="px-3 py-1.5"><div className="font-medium">{String(f.datos.nombre || '')}</div><div className="num text-tenue">{String(f.datos.rut || '')}</div></td>
                <td className="num px-2 py-1.5">{fechaCL(f.fecha_termino)}</td>
                <td className="px-2 py-1.5">{causalInfo(f.causal).art.replace('artículo', 'Art.')}</td>
                <td className="num px-2 py-1.5 text-right font-semibold">{clp(f.total)}</td>
                <td className="px-2 py-1.5">{f.estado === 'ratificado' ? '✅ Ratificado' : 'Borrador'}</td>
                <td className="px-2 py-1.5">{f.asiento && !f.asiento.anulado ? `N° ${f.asiento.numero}` : <span className="text-tenue">Sin contabilizar</span>}</td>
                <td className="px-3 py-1.5 text-right"><Link className="text-acento hover:underline" href={`/e/${empresaId}/remuneraciones/finiquitos/${f.id}`}>Ver</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
