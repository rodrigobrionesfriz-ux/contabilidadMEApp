import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerirUsuario, empresasDelUsuario, permisosModulos, miAcceso } from '@/lib/auth';
import { anioContable } from '@/lib/anio-contable';
import { NOMBRE_ROL } from '@/lib/formato';
import { BarraUsuario } from '../../barra-usuario';
import { Navegacion } from './navegacion';
import { Buscador } from './buscador';

export default async function EmpresaLayout({ children, params }: LayoutProps<'/e/[empresaId]'>) {
  const { empresaId } = await params;
  const [usuario, empresas, anio, permisos, acceso] = await Promise.all([requerirUsuario(), empresasDelUsuario(), anioContable(), permisosModulos(), miAcceso()]);
  // El layout no aplica el perfil del módulo (lo hace cada página con requerirEmpresa): sólo exige ser miembro
  const empresa = empresas.find((e) => e.id === empresaId);
  if (!empresa) notFound();
  return (
    <>
      <BarraUsuario usuario={usuario}>
        <Link href="/empresas" className="block truncate text-sm hover:text-acento" title="Cambiar de empresa">
          🏢 {empresa.razon_social} <span className="num text-tenue">{empresa.rut}</span>
          <span className="ml-2 text-xs text-tenue">{acceso.admin ? '🛡️ Administrador' : NOMBRE_ROL[empresa.rol]}</span>
        </Link>
      </BarraUsuario>
      <div className="flex flex-1 flex-col md:flex-row md:items-start">
        <Suspense>
          <Navegacion base={`/e/${empresaId}`} rol={empresa.rol} empresa={empresa.razon_social} buscador={<Buscador empresaId={empresaId} />}
            empresaId={empresaId} empresas={empresas.map((e) => ({ id: e.id, nombre: e.razon_social, rut: e.rut }))} anio={anio} permisos={permisos} />
        </Suspense>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </>
  );
}
