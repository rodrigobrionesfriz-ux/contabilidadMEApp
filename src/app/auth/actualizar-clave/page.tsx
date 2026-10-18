'use client';

import { useActionState } from 'react';
import { actualizarClave, type EstadoForm } from '../../(auth)/acciones';
import { BotonEnviar, Mensaje } from '@/components/form-estado';

export default function ActualizarClavePage() {
  const [estado, accion] = useActionState<EstadoForm, FormData>(actualizarClave, {});
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <form action={accion} className="tarjeta w-full max-w-sm space-y-4 p-6">
        <h1 className="text-lg font-semibold">Nueva contraseña</h1>
        <div>
          <label className="etiqueta" htmlFor="clave">Contraseña (mín. 8)</label>
          <input id="clave" name="clave" type="password" autoComplete="new-password" required minLength={8} className="campo" />
        </div>
        <div>
          <label className="etiqueta" htmlFor="clave2">Repetir contraseña</label>
          <input id="clave2" name="clave2" type="password" autoComplete="new-password" required className="campo" />
        </div>
        <Mensaje {...estado} />
        <BotonEnviar pendiente="Guardando…">Guardar contraseña</BotonEnviar>
      </form>
    </main>
  );
}
