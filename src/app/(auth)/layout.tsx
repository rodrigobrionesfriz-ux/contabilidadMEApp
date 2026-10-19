import { BotonTema } from '@/components/tema';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="relative flex flex-1 items-center justify-center px-4 py-10">
      <BotonTema className="absolute top-4 right-4" />
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold">📊 Contabilidad ME</div>
          <div className="text-sm text-tenue">Sistema contable multiempresa</div>
        </div>
        <div className="tarjeta p-6">{children}</div>
      </div>
    </main>
  );
}
