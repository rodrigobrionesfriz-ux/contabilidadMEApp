import type { Metadata } from 'next';
import Link from 'next/link';
import { confirmarEnlace } from './acciones';

export const metadata: Metadata = { title: 'Confirmar' };

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Destino de los enlaces de correo: se confirma con un botón (ver confirmarEnlace). */
export default async function ConfirmarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const token_hash = uno(sp.token_hash), type = uno(sp.type), code = uno(sp.code), next = uno(sp.next) || '/empresas';
  const valido = !!(token_hash && type) || !!code;
  const recuperar = type === 'recovery' || next.includes('actualizar-clave');
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <form action={confirmarEnlace} className="tarjeta w-full max-w-sm space-y-4 p-6 text-center">
        <h1 className="text-lg font-semibold">{recuperar ? 'Crear una nueva contraseña' : 'Confirmar tu cuenta'}</h1>
        {valido ? (<>
          <p className="text-sm text-tenue">{recuperar ? 'Toca el botón para continuar y elegir tu nueva contraseña.' : 'Toca el botón para confirmar tu correo y entrar a Contabilidad ME.'}</p>
          <input type="hidden" name="token_hash" value={token_hash} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="next" value={next} />
          <button type="submit" className="boton w-full">{recuperar ? 'Continuar' : 'Confirmar y entrar'}</button>
        </>) : (
          <p className="text-sm text-peligro">El enlace no es válido o está incompleto. Pide uno nuevo desde <Link href="/recuperar" className="underline">¿Olvidaste tu contraseña?</Link>.</p>
        )}
      </form>
    </main>
  );
}
