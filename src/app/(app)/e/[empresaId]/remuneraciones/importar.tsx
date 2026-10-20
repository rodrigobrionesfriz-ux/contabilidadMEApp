'use client';

import { useState, useTransition } from 'react';
import { importarTrabajadores } from './acciones';
import { Mensaje } from '@/components/form-estado';

/** Importa la hoja "Trabajadores" del respaldo Excel del sistema actual. */
export function ImportarTrabajadores({ empresaId, compacto }: { empresaId: string; compacto?: boolean }) {
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();
  async function leer(f: File) {
    setMsg({});
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' });
      const hoja = wb.Sheets['Trabajadores'];
      if (!hoja) throw new Error('El archivo no tiene la hoja "Trabajadores" (usa el respaldo de "📥 Exportar Excel" del sistema anterior).');
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' });
      const n = (v: unknown) => Number(String(v ?? '').replace(',', '.')) || 0;
      const datos = filas.map((x) => ({
        ref: String(x.id ?? ''), rut: String(x.rut ?? ''), nombre: String(x.nombre ?? ''),
        ficha: {
          cargo: String(x.cargo ?? ''), base: n(x.base), grat: n(x.grat), gratifModo: 'monto', otros: n(x.otros), colacion: n(x.colacion), movilizacion: n(x.movilizacion),
          afp: String(x.afp || 'habitat'), salud: String(x.salud || 'fonasa'), plan: n(x.plan), contrato: String(x.contrato || 'indefinido'), tipoPago: 'mensual', lre: {},
        },
      }));
      iniciar(async () => {
        const r = await importarTrabajadores(empresaId, datos);
        setMsg(r.ok ? { ok: `${r.mensaje} Revisa en cada ficha la gratificación, fechas de contrato y cargas: el respaldo no las trae.` } : { error: r.error });
      });
    } catch (e) {
      setMsg({ error: e instanceof Error ? e.message : String(e) });
    }
  }
  return (
    <div className={compacto ? 'text-sm' : 'space-y-2'}>
      <label className={`inline-flex cursor-pointer items-center gap-2 ${compacto ? 'text-tenue hover:text-texto' : 'boton-sec'}`}>
        📥 {pendiente ? 'Importando…' : 'Importar trabajadores desde el respaldo Excel del sistema anterior'}
        <input type="file" accept=".xlsx" className="sr-only" onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
      </label>
      <Mensaje {...msg} />
    </div>
  );
}
