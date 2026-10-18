const fmtCLP = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

/** $1.234.567 (los montos contables van en pesos enteros) */
export const clp = (n: number | string | null | undefined) => '$' + fmtCLP.format(Math.round(Number(n ?? 0)));

/** 2026-03-10 → 10/03/2026 */
export const fechaCL = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

export const hoyISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const NOMBRE_ROL = { admin: '👑 Administrador', contador: '📝 Contador', consulta: '👁 Consulta' } as const;
