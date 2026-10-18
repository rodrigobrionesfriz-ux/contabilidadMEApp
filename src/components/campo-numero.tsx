'use client';

import { decimalCL } from '@/lib/formato';

/** Campo numérico escrito a la chilena: acepta "1.500.000", "12,5" o "12.5". Confirma el valor al salir del campo. */
export function CampoNumero({ id, valor, onCambio, decimales = false, vacio = false, className = 'campo', disabled, placeholder }: {
  id?: string; valor: number | null; onCambio: (v: number | null) => void; decimales?: boolean; vacio?: boolean; className?: string; disabled?: boolean; placeholder?: string;
}) {
  const texto = valor == null ? '' : decimales ? String(valor).replace('.', ',') : Math.round(valor).toLocaleString('es-CL');
  return (
    <input id={id} key={texto} type="text" inputMode="decimal" className={`${className} num text-right`} defaultValue={texto} disabled={disabled} placeholder={placeholder}
      onBlur={(e) => {
        const s = e.target.value.trim();
        if (!s && vacio) { if (valor != null) onCambio(null); return; }
        const n = decimales ? decimalCL(s) : Math.round(decimalCL(s));
        if (n !== valor) onCambio(n);
        else e.target.value = texto;
      }} />
  );
}
