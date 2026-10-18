import Link from 'next/link';

const TABS = [
  ['', '👷 Trabajadores'], ['/asistencia', '🗓️ Asistencia'], ['/vacaciones', '🏖️ Vacaciones'], ['/libro', '📘 Libro del mes'], ['/imposiciones', '🏛️ Imposiciones'], ['/contratos', '📑 Contratos'], ['/finiquitos', '📝 Finiquitos'], ['/parametros', '⚙️ Parámetros'],
] as const;

export function Pestanas({ empresaId, activa, query = '' }: { empresaId: string; activa: string; query?: string }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-borde pb-2 text-sm">
      {TABS.map(([sub, nombre]) => (
        <Link key={sub} href={`/e/${empresaId}/remuneraciones${sub}${query}`}
          className={`rounded-md px-3 py-1.5 ${activa === sub ? 'bg-panel-2 font-medium text-acento' : 'text-tenue hover:text-texto'}`}>{nombre}</Link>
      ))}
    </div>
  );
}
