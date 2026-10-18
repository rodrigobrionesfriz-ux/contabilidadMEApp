import type { Metadata } from 'next';
import { requerirEmpresa } from '@/lib/auth';
import { parametrosDeEmpresa } from '@/lib/datos/remuneraciones';
import { iuscTabla } from '@/remuneraciones/parametros';
import { Pestanas } from '../pestanas';
import { FormParametros } from './form';

export const metadata: Metadata = { title: 'Parámetros de remuneraciones' };

export default async function ParametrosPage({ params }: PageProps<'/e/[empresaId]/remuneraciones/parametros'>) {
  const { empresaId } = await params;
  const empresa = await requerirEmpresa(empresaId);
  const { P } = await parametrosDeEmpresa(empresaId);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Parámetros de remuneraciones</h1>
        <p className="text-sm text-tenue">Valores de referencia Previred / Superintendencia de Pensiones (oct-2026). Actualízalos cuando cambien por ley o resolución.</p>
      </div>
      <Pestanas empresaId={empresaId} activa="/parametros" />
      <FormParametros empresaId={empresaId} P={P} editable={empresa.rol === 'admin'} />
      <section className="tarjeta p-4 text-xs">
        <h2 className="mb-2 text-sm font-semibold">Impuesto único de segunda categoría (Art. 43 N°1 LIR, en UTM)</h2>
        <table className="w-full max-w-lg">
          <thead className="text-left text-tenue"><tr><th>Desde</th><th>Hasta</th><th className="text-right">Factor</th><th className="text-right">Rebaja (UTM)</th></tr></thead>
          <tbody>{iuscTabla(P).map((t) => <tr key={t.desde} className="num border-t border-borde/30"><td>{t.desde}</td><td>{t.hasta >= 1e8 ? 'y más' : t.hasta}</td><td className="text-right">{(t.factor * 100).toFixed(1)}%</td><td className="text-right">{t.rebajaUTM}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}
