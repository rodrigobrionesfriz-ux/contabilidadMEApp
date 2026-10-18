'use client';

import { useActionState } from 'react';
import { guardarEmpresa } from './acciones';
import type { EstadoForm } from '../../../../(auth)/acciones';
import { BotonEnviar, Mensaje } from '@/components/form-estado';
import { REGIMENES, tasaIDPC } from '@/estados/regimenes';

const CAMPOS: [string, string][] = [
  ['razon_social', 'Razón social'], ['giro', 'Giro'], ['domicilio', 'Domicilio'], ['comuna', 'Comuna'],
  ['ciudad', 'Ciudad'], ['representante', 'Representante legal'], ['rut_representante', 'RUT representante legal'], ['tasa_ppm', 'Tasa PPM (%)'],
];

export function FormEmpresa({ empresaId, datos, editable }: { empresaId: string; datos: Record<string, string | null>; editable: boolean }) {
  const [estado, accion] = useActionState<EstadoForm, FormData>(guardarEmpresa, {});
  return (
    <form action={accion} className="tarjeta space-y-4 p-5">
      <input type="hidden" name="empresaId" value={empresaId} />
      <div>
        <span className="etiqueta">RUT</span>
        <div className="num">{datos.rut}</div>
        <p className="text-xs text-tenue">El RUT identifica a la empresa y no se puede cambiar.</p>
      </div>
      <fieldset disabled={!editable} className="space-y-4">
        {CAMPOS.map(([n, l]) => (
          <div key={n}>
            <label className="etiqueta" htmlFor={n}>{l}</label>
            <input id={n} name={n} defaultValue={datos[n] ?? ''} required={n === 'razon_social'} className="campo" />
          </div>
        ))}
        <div>
          <label className="etiqueta" htmlFor="regimen">Régimen tributario</label>
          <select id="regimen" name="regimen" defaultValue={datos.regimen || '14D3'} className="campo">
            {REGIMENES.map((r) => <option key={r.k} value={r.k}>{r.corto} · {r.nm}</option>)}
          </select>
          <p className="mt-1 text-xs text-tenue">Define el impuesto a la renta estimado en el estado de resultados y el aviso de corrección monetaria en el cierre.</p>
        </div>
        <div>
          <label className="etiqueta" htmlFor="tasa_renta">Tasa de impuesto a la renta (%)</label>
          <input id="tasa_renta" name="tasa_renta" defaultValue={datos.tasa_renta ?? ''} placeholder={`Según régimen (${String(tasaIDPC(datos.regimen, new Date().getFullYear())).replace('.', ',')}% este año)`} className="campo" />
          <p className="mt-1 text-xs text-tenue">Déjala vacía para usar la del régimen y año (incluye las tasas transitorias).</p>
        </div>
      </fieldset>
      <Mensaje error={estado.error} ok={estado.ok} />
      {editable && <BotonEnviar pendiente="Guardando…">Guardar</BotonEnviar>}
    </form>
  );
}
