import Link from 'next/link';
import { salir } from '../(auth)/acciones';
import { miAcceso, type Usuario } from '@/lib/auth';
import { BotonTema } from '@/components/tema';
import Image from 'next/image';

export async function BarraUsuario({ usuario, children }: { usuario: Usuario; children?: React.ReactNode }) {
  const acceso = await miAcceso();
  return (
    <header className="flex items-center gap-4 border-b border-borde bg-panel px-4 py-2.5">
      <Link href="/empresas" className="flex items-center gap-1.5 font-bold whitespace-nowrap"><Image src="/icons/icon-192.png" alt="" width={24} height={24} priority />Contabilidad ME</Link>
      <div className="min-w-0 flex-1">{children}</div>
      {acceso.admin && <Link href="/admin/perfiles" className="boton-sec whitespace-nowrap text-xs" title="Perfiles de acceso y usuarios del sistema">🛡️ Perfiles</Link>}
      <div className="hidden text-right text-xs sm:block">
        <div className="font-medium">{usuario.nombre}</div>
        <div className="text-tenue">{acceso.admin ? '🛡️ Administrador del sistema' : acceso.perfil ? `${acceso.tipo === 'senior' ? '⭐' : '📝'} ${acceso.perfil}` : usuario.email}</div>
      </div>
      <BotonTema />
      <form action={salir}>
        <button className="boton-sec" type="submit">Salir</button>
      </form>
    </header>
  );
}
