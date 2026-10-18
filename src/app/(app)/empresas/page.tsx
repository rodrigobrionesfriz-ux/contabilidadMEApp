import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirUsuario, empresasDelUsuario } from '@/lib/auth';
import { NOMBRE_ROL } from '@/lib/formato';
import { BarraUsuario } from '../barra-usuario';

export const metadata: Metadata = { title: 'Empresas' };

export default async function EmpresasPage() {
  const [usuario, empresas] = await Promise.all([requerirUsuario(), empresasDelUsuario()]);
  return (
    <>
      <BarraUsuario usuario={usuario} />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Tus empresas</h1>
            <p className="text-sm text-tenue">Elige con cuál trabajar.</p>
          </div>
          <Link href="/empresas/nueva" className="boton">+ Nueva empresa</Link>
        </div>
        {empresas.length === 0 ? (
          <div className="tarjeta p-8 text-center text-tenue">
            Aún no tienes empresas. Crea la primera o pide a un administrador que te agregue con tu correo
            <span className="text-texto"> {usuario.email}</span>.
          </div>
        ) : (
          <ul className="grid gap-3">
            {empresas.map((e) => (
              <li key={e.id}>
                <Link href={`/e/${e.id}`} className="tarjeta flex items-center justify-between gap-4 p-4 hover:border-acento">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.razon_social}</div>
                    <div className="text-sm text-tenue"><span className="num">{e.rut}</span>{e.giro ? ` · ${e.giro}` : ''}</div>
                  </div>
                  <span className="text-xs whitespace-nowrap text-tenue">{NOMBRE_ROL[e.rol]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
