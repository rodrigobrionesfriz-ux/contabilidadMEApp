import { Suspense } from 'react';
import Link from 'next/link';
import { requerirUsuario, requerirEmpresa } from '@/lib/auth';
import { NOMBRE_ROL } from '@/lib/formato';
import { BarraUsuario } from '../../barra-usuario';
import { Navegacion } from './navegacion';
import { Buscador } from './buscador';

export default async function EmpresaLayout({ children, params }: LayoutProps<'/e/[empresaId]'>) {
  const { empresaId } = await params;
  const [usuario, empresa] = await Promise.all([requerirUsuario(), requerirEmpresa(empresaId)]);
  return (
    <>
      <BarraUsuario usuario={usuario}>
        <Link href="/empresas" className="block truncate text-sm hover:text-acento" title="Cambiar de empresa">
          🏢 {empresa.razon_social} <span className="num text-tenue">{empresa.rut}</span>
          <span className="ml-2 text-xs text-tenue">{NOMBRE_ROL[empresa.rol]}</span>
        </Link>
      </BarraUsuario>
      <div className="flex flex-1 flex-col md:flex-row md:items-start">
        <Suspense>
          <Navegacion base={`/e/${empresaId}`} rol={empresa.rol} empresa={empresa.razon_social} buscador={<Buscador empresaId={empresaId} />} />
        </Suspense>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </>
  );
}
