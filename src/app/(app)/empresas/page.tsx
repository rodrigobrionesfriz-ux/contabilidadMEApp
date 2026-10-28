import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirUsuario, empresasDelUsuario, miAcceso, puedeCrearEmpresas, type EmpresaDelUsuario } from '@/lib/auth';
import { NOMBRE_ROL } from '@/lib/formato';
import { BarraUsuario } from '../barra-usuario';

export const metadata: Metadata = { title: 'Empresas' };

export default async function EmpresasPage({ searchParams }: PageProps<'/empresas'>) {
  const [usuario, empresas, acceso, sp] = await Promise.all([requerirUsuario(), empresasDelUsuario(), miAcceso(), searchParams]);
  const crea = puedeCrearEmpresas(acceso);
  // Al elegir una empresa se entra a su Resumen (inicio de la empresa)
  const destino = (id: string) => `/e/${id}`;
  const propias = empresas.filter((e) => e.propia);
  const deOtros = empresas.filter((e) => !e.propia);
  const verOtras = sp.otras === '1' && deOtros.length > 0;
  const lista = verOtras ? deOtros : propias;

  const Tarjeta = ({ e }: { e: EmpresaDelUsuario }) => (
    <Link href={destino(e.id)} className="tarjeta block p-3 hover:border-acento sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 font-medium leading-snug break-words">{e.razon_social}</div>
        {!acceso.admin && <span className="shrink-0 text-xs text-tenue">{NOMBRE_ROL[e.rol]}</span>}
      </div>
      <div className="mt-0.5 truncate text-xs text-tenue sm:text-sm"><span className="num">{e.rut}</span>{e.giro ? ` · ${e.giro}` : ''}</div>
      {verOtras && e.duenos && <div className="mt-1 text-xs text-tenue">👤 {e.duenos.length ? e.duenos.join(', ') : 'Sin dueño asignado'}</div>}
    </Link>
  );

  return (
    <>
      <BarraUsuario usuario={usuario} />
      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">{verOtras ? 'Empresas de otros usuarios' : 'Tus empresas'}</h1>
            <p className="text-sm text-tenue">{verOtras ? 'Como administrador puedes entrar a cualquiera.' : 'Elige con cuál trabajar.'}</p>
          </div>
          {crea && !verOtras && <Link href="/empresas/nueva" className="boton whitespace-nowrap">+ Nueva empresa</Link>}
        </div>
        {lista.length === 0 ? (
          <div className="tarjeta p-6 text-center text-sm text-tenue">
            {crea ? 'Aún no tienes empresas. Crea la primera o pide que te agreguen con tu correo' : acceso.perfil ? 'Aún no tienes empresas asignadas. Pide al dueño de la empresa o al administrador que te agregue con tu correo' : 'Tu cuenta aún no tiene un perfil de acceso. Pide al administrador del sistema que te asigne uno; tu correo es'}
            <span className="break-all text-texto"> {usuario.email}</span>.
          </div>
        ) : (
          <ul className="grid gap-2 sm:gap-3">
            {lista.map((e) => <li key={e.id}><Tarjeta e={e} /></li>)}
          </ul>
        )}
        {acceso.admin && deOtros.length > 0 && (
          <div className="mt-5 text-center text-sm">
            {verOtras
              ? <Link href="/empresas" className="text-acento hover:underline">← Volver a tus empresas</Link>
              : <Link href="/empresas?otras=1" className="text-acento hover:underline">🛡️ Empresas de otros usuarios ({deOtros.length})</Link>}
          </div>
        )}
      </main>
    </>
  );
}
