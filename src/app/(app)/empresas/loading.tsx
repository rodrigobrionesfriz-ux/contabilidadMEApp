export default function Cargando() {
  return (
    <div className="mx-auto max-w-5xl space-y-3 p-6" aria-busy="true">
      <div className="h-6 w-48 animate-pulse rounded bg-panel-2" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="tarjeta h-20 animate-pulse" />)}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
