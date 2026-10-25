'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { registrar, type EstadoForm } from '../acciones';
import { BotonEnviar, Mensaje } from '@/components/form-estado';

export default function RegistroPage() {
  const [estado, accion] = useActionState<EstadoForm, FormData>(registrar, {});
  return (
    <form action={accion} className="space-y-4">
      <h1 className="text-lg font-semibold">Crear cuenta</h1>
      <div>
        <label className="etiqueta" htmlFor="nombre">Nombre</label>
        <input id="nombre" name="nombre" autoComplete="name" required className="campo" defaultValue={estado.valores?.nombre} />
      </div>
      <div>
        <label className="etiqueta" htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="campo" defaultValue={estado.valores?.email} />
      </div>
      <div>
        <label className="etiqueta" htmlFor="clave">Contraseña (mín. 8)</label>
        <input id="clave" name="clave" type="password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} required minLength={8} className="campo" />
      </div>
      <div>
        <label className="etiqueta" htmlFor="clave2">Repetir contraseña</label>
        <input id="clave2" name="clave2" type="password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} required className="campo" />
      </div>
      <Mensaje error={estado.error} ok={estado.ok} />
      <BotonEnviar pendiente="Creando…">Crear cuenta</BotonEnviar>
      <p className="text-center text-sm text-tenue">
        ¿Ya tienes cuenta? <Link href="/login" className="text-acento hover:underline">Ingresar</Link>
      </p>
    </form>
  );
}
