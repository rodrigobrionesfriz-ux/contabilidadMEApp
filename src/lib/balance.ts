// Balance tributario de 8 columnas a partir de sumas por cuenta.

export interface SumaCuenta { cuenta: string; nombre: string; tipo: string; debe: number; haber: number }
export interface FilaBalance extends SumaCuenta {
  deudor: number; acreedor: number; activo: number; pasivo: number; perdida: number; ganancia: number;
}
export interface Balance8 {
  filas: FilaBalance[];
  sumas: Omit<FilaBalance, 'cuenta' | 'nombre' | 'tipo'>;
  /** Utilidad (+) o pérdida (−) del ejercicio */
  resultado: number;
}

export function balance8(sumas: SumaCuenta[]): Balance8 {
  const filas = sumas.map((s) => {
    const debe = Number(s.debe), haber = Number(s.haber);
    const saldo = debe - haber;
    const deudor = saldo > 0 ? saldo : 0, acreedor = saldo < 0 ? -saldo : 0;
    const resultado = s.tipo === 'C' || s.tipo === 'I';
    return {
      ...s, debe, haber, deudor, acreedor,
      activo: resultado ? 0 : deudor, pasivo: resultado ? 0 : acreedor,
      perdida: resultado ? deudor : 0, ganancia: resultado ? acreedor : 0,
    };
  });
  const t = (k: keyof Balance8['sumas']) => filas.reduce((a, f) => a + f[k], 0);
  const tot = { debe: t('debe'), haber: t('haber'), deudor: t('deudor'), acreedor: t('acreedor'), activo: t('activo'), pasivo: t('pasivo'), perdida: t('perdida'), ganancia: t('ganancia') };
  return { filas, sumas: tot, resultado: tot.ganancia - tot.perdida };
}
