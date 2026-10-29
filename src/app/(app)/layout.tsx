import { CierreInactividad } from './inactividad';
import { MarcaAgua } from '@/components/marca-agua';

/** Páginas privadas: marca de agua de fondo y cierre de sesión tras 30 minutos sin actividad. */
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return <><MarcaAgua />{children}<CierreInactividad /></>;
}
