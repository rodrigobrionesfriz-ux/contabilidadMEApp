'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ingresar, type EstadoForm } from '../acciones';
import { BotonEnviar, Mensaje } from '@/components/form-estado';

export function FormLogin({ next, errorInicial }: { next?: string; errorInicial?: string }) {
  const [estado, accion] = useActionState<EstadoForm, FormData>(ingresar, { error: errorInicial });
  return (
    <form action={accion} className="space-y-4">
      <h1 className="text-lg font-semibold">Ingresar</h1>
      <input type="hidden" name="next" value={next ?? ''} />
      <div>
        <label className="etiqueta" htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="campo" defaultValue={estado.valores?.email} />
      </div>
      <div>
        <label className="etiqueta" htmlFor="clave">Contraseña</label>
        <input id="clave" name="clave" type="password" autoComplete="current-password" required className="campo" />
      </div>
      <Mensaje error={estado.error} ok={estado.ok} />
      <BotonEnviar pendiente="Ingresando…">Ingresar</BotonEnviar>
      <div className="flex justify-between text-sm">
        <Link href="/recuperar" className="text-tenue hover:text-texto">¿Olvidaste tu contraseña?</Link>
        <Link href="/registro" className="text-acento hover:underline">Crear cuenta</Link>
      </div>
    </form>
  );
}
