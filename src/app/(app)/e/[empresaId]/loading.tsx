// Se muestra apenas se hace clic en un módulo, mientras el servidor arma la
// página: el menú y la barra quedan quietos y el contenido muestra que viene en camino.
export default function Cargando() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-1 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full w-1/3 animate-[cargando_1.1s_ease-in-out_infinite] rounded-full bg-acento" />
      </div>
      <div className="h-6 w-64 animate-pulse rounded bg-panel-2" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="tarjeta h-24 animate-pulse" />)}
      </div>
      <div className="tarjeta h-64 animate-pulse" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
