'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { crearEmpresa } from '../acciones';
import type { EstadoForm } from '../../../(auth)/acciones';
import { BotonEnviar, Mensaje } from '@/components/form-estado';

const CAMPOS: [string, string, boolean][] = [
  ['rut', 'RUT', true], ['razon_social', 'Razón social', true], ['giro', 'Giro', false],
  ['domicilio', 'Domicilio', false], ['comuna', 'Comuna', false], ['ciudad', 'Ciudad', false],
];

export default function NuevaEmpresaPage() {
  const [estado, accion] = useActionState<EstadoForm, FormData>(crearEmpresa, {});
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <Link href="/empresas" className="text-sm text-tenue hover:text-texto">← Empresas</Link>
      <form action={accion} className="tarjeta mt-3 space-y-4 p-6">
        <h1 className="text-lg font-semibold">Nueva empresa</h1>
        <p className="text-sm text-tenue">Quedarás como administrador y se cargará el plan de cuentas base (295 cuentas).</p>
        {CAMPOS.map(([n, l, req]) => (
          <div key={n}>
            <label className="etiqueta" htmlFor={n}>{l}{req ? ' *' : ''}</label>
            <input id={n} name={n} required={req} className="campo" placeholder={n === 'rut' ? '76.123.456-7' : undefined} defaultValue={estado.valores?.[n]} />
          </div>
        ))}
        <Mensaje {...estado} />
        <BotonEnviar pendiente="Creando…">Crear empresa</BotonEnviar>
      </form>
    </main>
  );
}
