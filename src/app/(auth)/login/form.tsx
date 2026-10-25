'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { ingresar, type EstadoForm } from '../acciones';
import { BotonEnviar, Mensaje } from '@/components/form-estado';

export function FormLogin({ next, errorInicial }: { next?: string; errorInicial?: string }) {
  const [estado, accion] = useActionState<EstadoForm, FormData>(ingresar, { error: errorInicial });
  const [ver, setVer] = useState(false);
  return (
    <form action={accion} className="space-y-4">
      <h1 className="text-lg font-semibold">Ingresar</h1>
      <input type="hidden" name="next" value={next ?? ''} />
      <div>
        <label className="etiqueta" htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} required className="campo" defaultValue={estado.valores?.email} />
      </div>
      <div>
        <label className="etiqueta" htmlFor="clave">Contraseña</label>
        {/* En el celular el teclado no debe poner mayúscula ni corregir (las contraseñas temporales son exactas) */}
        <div className="relative">
          <input id="clave" name="clave" type={ver ? 'text' : 'password'} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} required className="campo pr-20" />
          <button type="button" onClick={() => setVer(!ver)} className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-xs text-tenue hover:text-texto" aria-pressed={ver}>{ver ? 'Ocultar' : 'Mostrar'}</button>
        </div>
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
