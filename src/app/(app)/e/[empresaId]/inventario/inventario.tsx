'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { DatosInventario } from '@/lib/datos/inventario';
import { recalcularInventario, type Movimiento, type Producto } from '@/inventario/motor';
import { Mensaje } from '@/components/form-estado';
import { Kpi, fmt, mon, type Apoyo, type Ctx, type Resultado } from './comun';
import { Existencias } from './existencias';
import { Movimientos } from './movimientos';
import { Tomas } from './tomas';
import { Ordenes } from './ordenes';
import { Productos } from './productos';
import { Bodegas, Grupos } from './maestros';

const TABS: [string, string][] = [['stock', 'Existencias'], ['movimientos', 'Movimientos'], ['tomas', 'Tomas físicas'], ['oc', 'Órdenes de compra'], ['productos', 'Productos'], ['bodegas', 'Bodegas'], ['grupos', 'Grupos y subgrupos']];

export function Inventario({ empresaId, datos, apoyo, escribe, tab, hoy }: { empresaId: string; datos: DatosInventario; apoyo: Apoyo; escribe: boolean; tab: string; hoy: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const calc = useMemo(() => recalcularInventario(datos.movimientos as unknown as Movimiento[], datos.productos as unknown as Producto[]), [datos]);
  const run = (fn: () => Promise<Resultado>) => new Promise<boolean>((res) => iniciar(async () => {
    const r = await fn();
    setMsg(r.ok ? { ok: r.mensaje } : { error: r.error });
    router.refresh();
    res(r.ok);
  }));
  const c: Ctx = { empresaId, datos, apoyo, escribe, calc, pendiente, hoy, run, avisar: setMsg, msg };
  const unidades = calc.stock.reduce((s, x) => s + Math.max(0, x.cantidad), 0);
  const valor = calc.stock.reduce((s, x) => s + Math.max(0, x.valor), 0);
  const bajoMinimo = calc.stock.filter((s) => { const p = datos.productos.find((x) => x.id === s.productoId); return p && p.stockMinimo > 0 && s.cantidad < p.stockMinimo; }).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi lbl="Productos activos" v={datos.productos.filter((p) => p.activo !== false).length} />
        <Kpi lbl="Bodegas activas" v={datos.bodegas.filter((b) => b.activo !== false).length} />
        <Kpi lbl="Unidades en stock" v={fmt(unidades)} />
        <Kpi lbl="Valor inventario" v={mon(valor)} />
        <Kpi lbl="Bajo mínimo" v={bajoMinimo} aviso={bajoMinimo > 0} />
      </div>
      {calc.errores.length > 0 && (
        <details className="rounded-md border border-peligro/40 bg-peligro/10 p-3 text-sm text-peligro">
          <summary className="cursor-pointer"><strong>⚠ {calc.errores.length} inconsistencia(s) en el libro.</strong> No se ocultan los saldos negativos. Revisa los movimientos señalados.</summary>
          <ul className="mt-2 list-disc pl-5 text-xs">{calc.errores.slice(0, 30).map((e, i) => <li key={i}>{e.mensaje}</li>)}</ul>
        </details>
      )}
      <nav className="no-print flex flex-wrap gap-1 border-b border-borde text-sm">
        {TABS.map(([k, l]) => <Link key={k} href={`?tab=${k}`} scroll={false} className={`rounded-t-md px-3 py-1.5 ${tab === k ? 'bg-panel-2 font-medium text-acento' : 'text-tenue hover:text-texto'}`}>{l}</Link>)}
      </nav>
      <Mensaje {...msg} />
      {tab === 'stock' && <Existencias c={c} />}
      {tab === 'movimientos' && <Movimientos c={c} />}
      {tab === 'tomas' && <Tomas c={c} />}
      {tab === 'oc' && <Ordenes c={c} />}
      {tab === 'productos' && <Productos c={c} />}
      {tab === 'bodegas' && <Bodegas c={c} />}
      {tab === 'grupos' && <Grupos c={c} />}
    </div>
  );
}
