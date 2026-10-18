import Link from 'next/link';
import { salir } from '../(auth)/acciones';
import type { Usuario } from '@/lib/auth';

export function BarraUsuario({ usuario, children }: { usuario: Usuario; children?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-4 border-b border-borde bg-panel px-4 py-2.5">
      <Link href="/empresas" className="font-bold whitespace-nowrap">📊 Contabilidad ME</Link>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="hidden text-right text-xs sm:block">
        <div className="font-medium">{usuario.nombre}</div>
        <div className="text-tenue">{usuario.email}</div>
      </div>
      <form action={salir}>
        <button className="boton-sec" type="submit">Salir</button>
      </form>
    </header>
  );
}
