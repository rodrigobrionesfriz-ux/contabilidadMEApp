import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { contextoContratos } from '@/lib/datos/remuneraciones';
import { validarContrato } from '@/remuneraciones/contrato-dt';
import { plantillasContrato, plantillaSugerida, valoresContrato } from '@/remuneraciones/contrato-trabajo';
import { DocumentoContrato } from './documento';

export const metadata: Metadata = { title: 'Contrato de trabajo' };

export default async function ContratoDocPage({ params }: PageProps<'/e/[empresaId]/remuneraciones/contratos/[id]/documento'>) {
  const { empresaId, id } = await params;
  const empresa = await requerirEmpresa(empresaId);
  const c = await contextoContratos(empresaId);
  const t = c.trabajadores.find((x) => x.id === id);
  if (!t) notFound();
  const pls = plantillasContrato(c.plantillasGuardadas);
  const item = c.contratos.get(id);
  const sugerida = plantillaSugerida(t, c.D, pls, item?.plantilla);
  const v = validarContrato(t, c.D);
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href={`/e/${empresaId}/remuneraciones/contratos`} className="text-sm text-tenue hover:text-texto">← Contratos</Link>
        <Link href={`/e/${empresaId}/remuneraciones/contratos/${id}`} className="text-sm text-acento hover:underline">Datos del contrato (DT)</Link>
      </div>
      {!v.ok && <p className="no-print text-xs text-aviso">⚠️ Faltan datos del registro DT: {v.faltan.join(', ')}. Los datos vacíos aparecen entre corchetes en el contrato.</p>}
      <DocumentoContrato empresaId={empresaId} trabajador={{ id: t.id, nombre: t.nombre, cargo: t.cargo || '' }} vals={valoresContrato(t, c.D, c.empresa, c.imponible(t))}
        plantillas={pls.map((p) => ({ id: p.id, nombre: p.nombre, texto: p.texto, tipo: !!p.tipo }))} plantillaId={sugerida.id} textoPropio={item?.texto || ''}
        empresa={{ nombre: c.empresa.nombre || '', rut: c.empresa.rut || '', rep: c.empresa.rep || '' }} escribe={puedeEscribir(empresa.rol)} />
    </div>
  );
}
