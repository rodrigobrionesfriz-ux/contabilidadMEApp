// Guía para dejar lista una empresa nueva. Cada paso se detecta solo cuando se puede (hay centros de costo,
// balance de apertura, UF del mes...) y el resto se marca a mano como listo u omitido.

import { regimenInfo } from '@/estados/regimenes';

export type EstadoPaso = 'listo' | 'omitido' | 'pendiente';
export interface DatosPasos {
  regimen: string | null; representante: string | null; tasaPpm: number | null;
  /** Campos de la ficha de la empresa (giro, domicilio, comuna, ciudad, rut_representante...). */
  ficha?: Record<string, string | null>;
  cuentas: number; centros: number; apertura: boolean; importado: boolean; ufMesAnterior: boolean;
  auxiliares: number; trabajadores: number; parametrosRem: boolean; miembros: number;
  marcas: Record<string, string>;
}
export interface Paso { id: string; n: number; titulo: string; detalle: string; ruta: string; opcional: boolean; estado: EstadoPaso; auto: boolean; nota?: string }

export function primerosPasos(d: DatosPasos): Paso[] {
  const r = regimenInfo(d.regimen);
  // Ficha completa = paso 1 listo solo (el régimen siempre tiene valor, viene por defecto en 14D3).
  const CAMPOS: [string, string][] = [['giro', 'giro'], ['domicilio', 'domicilio'], ['comuna', 'comuna'], ['representante', 'representante legal'], ['rut_representante', 'RUT del representante']];
  const ficha: Record<string, string | null> = { ...(d.ficha ?? {}), representante: d.representante };
  const faltan = CAMPOS.filter(([k]) => !String(ficha[k] ?? '').trim()).map(([, n]) => n);
  const base: Omit<Paso, 'n' | 'estado'>[] = [
    { id: 'datos', titulo: 'Datos de la empresa y régimen tributario', ruta: '/empresa', opcional: false, auto: faltan.length === 0,
      detalle: 'Revisa razón social, giro, domicilio y representante legal. Elige el régimen tributario: define el tipo de contabilidad (completa o simplificada), la tasa de primera categoría y el PPM.',
      nota: `Régimen: ${r.corto} · ${r.nm} (contabilidad ${r.contabilidad})${faltan.length ? ` · falta: ${faltan.join(', ')}` : ''}` },
    { id: 'plan', titulo: 'Plan de cuentas', ruta: '/plan-cuentas', opcional: false, auto: false,
      detalle: 'La empresa parte con el plan base. Agrega las cuentas propias (bancos, activos, gastos por área), desactiva las que no uses y marca cuáles piden centro de costo o auxiliar.',
      nota: `${d.cuentas} cuentas imputables cargadas` },
    { id: 'centros', titulo: 'Centros de costo', ruta: '/centros-costo', opcional: true, auto: d.centros > 0,
      detalle: 'Crea los centros de costo (campos, faenas, áreas) para distribuir gastos e ingresos. Omítelo si la empresa no los usa.',
      nota: d.centros ? `${d.centros} centros creados` : undefined },
    { id: 'apertura', titulo: 'Balance de apertura', ruta: '/apertura', opcional: false, auto: d.apertura || d.importado,
      detalle: `Ingresa los saldos iniciales del ejercicio según la contabilidad que traía la empresa (${r.contabilidad === 'completa' ? 'contabilidad completa: activos, pasivos y patrimonio' : 'contabilidad simplificada: saldos de caja, bancos, clientes, proveedores y activos'}), con el detalle por auxiliar. Si viene del sistema anterior, también puedes importar el respaldo Excel. Si es una empresa sin movimientos, omítelo.`,
      nota: d.importado && !d.apertura ? 'Se importó un respaldo del sistema anterior' : undefined },
    { id: 'indicadores', titulo: 'Indicadores UF y UTM', ruta: '/remuneraciones/parametros#uf-mensual', opcional: false, auto: d.ufMesAnterior,
      detalle: 'Actualiza la UF del último día de cada mes y la UTM (botón "Actualizar desde el SII"). Son comunes a todas las empresas y se exigen para cerrar el libro de remuneraciones.' },
    { id: 'auxiliares', titulo: 'Proveedores y clientes', ruta: '/fichas', opcional: true, auto: d.auxiliares > 0,
      detalle: 'Revisa las fichas de proveedores y clientes con su cuenta y centro de costo por defecto. Se crean solas al importar el RCV, así que puedes dejarlo para después.',
      nota: d.auxiliares ? `${d.auxiliares} fichas` : undefined },
    { id: 'remuneraciones', titulo: 'Remuneraciones', ruta: '/remuneraciones', opcional: true, auto: d.trabajadores > 0,
      detalle: 'Si la empresa tiene trabajadores: revisa los parámetros (mutual, caja de compensación, seguro de cesantía) y crea las fichas de los trabajadores. Omítelo si no tiene personal.',
      nota: d.trabajadores ? `${d.trabajadores} trabajadores${d.parametrosRem ? '' : ' · parámetros sin revisar'}` : undefined },
    { id: 'usuarios', titulo: 'Usuarios', ruta: '/usuarios', opcional: true, auto: d.miembros > 1,
      detalle: 'Invita a quienes trabajarán en la empresa (contador o consulta).',
      nota: d.miembros > 1 ? `${d.miembros} usuarios` : undefined },
  ];
  return base.map((p, i) => {
    const m = d.marcas[p.id];
    const estado: EstadoPaso = p.auto || m === 'listo' ? 'listo' : m === 'omitido' ? 'omitido' : 'pendiente';
    return { ...p, n: i + 1, estado };
  });
}

/** Avance: pasos resueltos (listos u omitidos) sobre el total. */
export function avancePasos(p: Paso[]) {
  const hechos = p.filter((x) => x.estado !== 'pendiente').length;
  return { hechos, total: p.length, completo: hechos === p.length, faltanObligatorios: p.filter((x) => !x.opcional && x.estado === 'pendiente').length };
}
