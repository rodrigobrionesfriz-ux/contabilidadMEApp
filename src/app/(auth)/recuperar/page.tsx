'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { recuperar, type EstadoForm } from '../acciones';
import { BotonEnviar, Mensaje } from '@/components/form-estado';

export default function RecuperarPage() {
  const [estado, accion] = useActionState<EstadoForm, FormData>(recuperar, {});
  return (
    <form action={accion} className="space-y-4">
      <h1 className="text-lg font-semibold">Recuperar contraseña</h1>
      <p className="text-sm text-tenue">Te enviaremos un enlace para crear una nueva contraseña.</p>
      <div>
        <label className="etiqueta" htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="campo" />
      </div>
      <Mensaje {...estado} />
      <BotonEnviar pendiente="Enviando…">Enviar enlace</BotonEnviar>
      <p className="text-center text-sm"><Link href="/login" className="text-tenue hover:text-texto">Volver a ingresar</Link></p>
    </form>
  );
}
