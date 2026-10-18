import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { contextoContratos } from '@/lib/datos/remuneraciones';
import { validarContrato, venceRegistro } from '@/remuneraciones/contrato-dt';
import { plantillasContrato, plantillaSugerida } from '@/remuneraciones/contrato-trabajo';
import { param, hoyISO } from '@/lib/formato';
import { Pestanas } from '../pestanas';
import { ListaContratos, type FilaContrato } from './lista';
import { DefaultsForm } from './defaults';

export const metadata: Metadata = { title: 'Contratos' };

export default async function ContratosPage({ params, searchParams }: PageProps<'/e/[empresaId]/remuneraciones/contratos'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const todos = param(sp.todos) === '1';
  const empresa = await requerirEmpresa(empresaId);
  const c = await contextoContratos(empresaId);
  const pls = plantillasContrato(c.plantillasGuardadas);
  const activos = c.trabajadores.filter((t) => t.activo);
  const filas: FilaContrato[] = activos.map((t) => {
    const v = validarContrato(t, c.D);
    return {
      id: t.id, nombre: t.nombre, rut: t.rut, cargo: t.cargo || '', ok: v.ok, faltan: v.faltan, avisos: v.avisos,
      suscripcion: v.dc.fechaSuscripcion, vence: venceRegistro(v.dc.fechaSuscripcion), informado: v.dc.informado,
      plantilla: plantillaSugerida(t, c.D, pls, c.contratos.get(t.id)?.plantilla).nombre,
    };
  });
  const visibles = filas.filter((f) => todos || !f.informado);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Contratos de trabajo</h1>
          <p className="text-sm text-tenue">Se registran en Mi DT (Registro de contratos → carga masiva) dentro de los 15 días hábiles siguientes a su firma. El CSV sigue el Instructivo de Registro Masivo de la DT: un archivo por cargo, hasta 1.000 trabajadores. El plazo que se muestra es aproximado (no descuenta feriados).</p>
        </div>
        <Link href={`/e/${empresaId}/remuneraciones/contratos/plantillas`} className="boton-sec">📄 Plantillas</Link>
      </div>
      <Pestanas empresaId={empresaId} activa="/contratos" />
      <ListaContratos empresaId={empresaId} filas={visibles} total={filas.length} todos={todos} escribe={puedeEscribir(empresa.rol)} hoy={hoyISO()} />
      <DefaultsForm empresaId={empresaId} D={c.D} escribe={puedeEscribir(empresa.rol)} />
    </div>
  );
}
