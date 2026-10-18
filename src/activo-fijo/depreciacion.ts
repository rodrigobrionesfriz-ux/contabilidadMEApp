// Activo fijo y depreciación: traslado fiel de activofijo.js del sistema actual.
// Vida útil normal según la tabla del SII; depreciación acelerada del Art. 31 N°5 LIR
// (1/3 de la vida normal, sin fracción, mínimo 1 año). Contable y tributaria por separado:
// los asientos usan la contable; la tributaria sirve para la conciliación de renta.

export interface Categoria { k: string; lbl: string; activo: string; deprAcum: string; gasto: string; vida: number }
export const AF_CATEGORIAS: Categoria[] = [
  { k: 'bienes_raices', lbl: 'Bienes raíces (construcciones)', activo: '1201002', deprAcum: '1201202', gasto: '3301002', vida: 40 },
  { k: 'maquinarias', lbl: 'Maquinarias y equipos', activo: '1201003', deprAcum: '1201203', gasto: '3301003', vida: 15 },
  { k: 'instalaciones', lbl: 'Instalaciones', activo: '1201004', deprAcum: '1201204', gasto: '3301004', vida: 10 },
  { k: 'vehiculos', lbl: 'Vehículos (camiones, remolques)', activo: '1201005', deprAcum: '1201205', gasto: '3301005', vida: 7 },
  { k: 'equipos_ofic', lbl: 'Equipos de oficina / muebles', activo: '1201006', deprAcum: '1201206', gasto: '3301006', vida: 7 },
];
export const afCat = (k: string | undefined) => AF_CATEGORIAS.find((c) => c.k === k) || AF_CATEGORIAS[0];
export const vidaAcelerada = (vidaNormal: number) => Math.max(1, Math.floor(vidaNormal / 3));

export interface Bien {
  id?: string; desc?: string; cat: string; fecha: string; estado?: string;
  valor?: number; residual?: number; vida?: number; metodo?: string;
  valorContable?: number; residualContable?: number; vidaContable?: number; metodoContable?: string; fechaInicioDepContable?: string;
  valorTributario?: number; residualTributario?: number; vidaTributaria?: number; metodoTributario?: string; fechaInicioDepTributaria?: string;
}

export function calcularDepreciacionBase(bien: Bien, anioCierre: number, ambito: 'contable' | 'tributario' = 'contable') {
  const esTrib = ambito === 'tributario';
  const vidaNormal = +((esTrib ? (bien.vidaTributaria || bien.vida) : (bien.vidaContable || bien.vida)) as number) || afCat(bien.cat).vida;
  const metodo = esTrib ? (bien.metodoTributario || bien.metodo || 'lineal') : (bien.metodoContable || 'lineal');
  const vidaUsada = metodo === 'acelerada' ? vidaAcelerada(vidaNormal) : vidaNormal;
  const valor = +((esTrib ? (bien.valorTributario ?? bien.valor) : (bien.valorContable ?? bien.valor)) as number) || 0;
  const residual = +((esTrib ? (bien.residualTributario ?? 0) : (bien.residualContable ?? bien.residual)) as number) || 0;
  const base = Math.max(0, valor - residual);
  const fechaInicio = esTrib ? bien.fechaInicioDepTributaria : bien.fechaInicioDepContable;
  // Con fecha de inicio se prorratea por meses
  if (fechaInicio && /^\d{4}-\d{2}-\d{2}$/.test(fechaInicio)) {
    const [yi, mi] = fechaInicio.split('-').map(Number);
    const totalMeses = Math.max(1, Math.round(vidaUsada * 12));
    const indiceInicio = yi * 12 + (mi - 1);
    const inicioEj = anioCierre * 12, finEj = inicioEj + 12;
    const finVida = indiceInicio + totalMeses;
    const desde = Math.max(indiceInicio, inicioEj), hasta = Math.min(finVida, finEj);
    const mesesEsteAnio = Math.max(0, hasta - desde);
    const mesesHastaCierre = Math.max(0, Math.min(finVida, finEj) - indiceInicio);
    const cuotaMensual = totalMeses > 0 ? base / totalMeses : 0;
    const deprEsteAnio = Math.min(base, Math.round(cuotaMensual * mesesEsteAnio));
    const acumulada = Math.min(base, Math.round(cuotaMensual * mesesHastaCierre));
    const valorLibro = valor - acumulada;
    return { ambito, metodo, vidaNormal, vidaUsada, base, cuotaAnual: Math.round(cuotaMensual * 12), cuotaMensual, fechaInicio, mesesEsteAnio, deprEsteAnio, acumulada, valorLibro, totalmenteDepreciado: mesesHastaCierre >= totalMeses } as Depreciacion;
  }
  // Fichas históricas sin fecha de inicio: depreciación anual desde el ejercicio siguiente a la compra
  const cuotaAnual = vidaUsada > 0 ? Math.round(base / vidaUsada) : 0;
  const anioCompra = +(bien.fecha || '').slice(0, 4);
  const anioInicio = anioCompra + 1;
  let aniosTranscurridos = anioCierre - anioInicio + 1;
  if (aniosTranscurridos < 0) aniosTranscurridos = 0;
  if (aniosTranscurridos > vidaUsada) aniosTranscurridos = vidaUsada;
  const deprEsteAnio = anioCierre >= anioInicio && anioCierre < anioInicio + vidaUsada ? cuotaAnual : 0;
  let acumulada = cuotaAnual * aniosTranscurridos;
  if (acumulada > base) acumulada = base;
  const valorLibro = valor - acumulada;
  return { ambito, metodo, vidaNormal, vidaUsada, base, cuotaAnual, anioInicio, aniosTranscurridos, deprEsteAnio, acumulada, valorLibro, totalmenteDepreciado: aniosTranscurridos >= vidaUsada, legacy: true } as Depreciacion;
}
export interface Depreciacion {
  ambito: string; metodo: string; vidaNormal: number; vidaUsada: number; base: number; cuotaAnual: number; deprEsteAnio: number; acumulada: number; valorLibro: number;
  totalmenteDepreciado: boolean; cuotaMensual?: number; fechaInicio?: string; mesesEsteAnio?: number; anioInicio?: number; aniosTranscurridos?: number; legacy?: boolean;
}
export const calcularDepreciacionContable = (b: Bien, anio: number) => calcularDepreciacionBase(b, anio, 'contable');
export const calcularDepreciacionTributaria = (b: Bien, anio: number) => calcularDepreciacionBase(b, anio, 'tributario');

/** Conciliación financiera/tributaria para renta. Con depreciación instantánea, la tributaria del año es el valor de las adquisiciones del ejercicio. */
export function conciliacionDepreciacionAF(bienes: Bien[], anio: number, { deprInstantanea = false } = {}) {
  const detalle = bienes.filter((b) => b.estado !== 'anulado').map((b) => {
    const c = calcularDepreciacionContable(b, anio);
    const t = calcularDepreciacionTributaria(b, anio);
    const adquirido = +(String(b.fecha || '').slice(0, 4)) === +anio;
    const depTribEj = deprInstantanea ? (adquirido ? Math.max(0, +((b.valorTributario ?? b.valor) as number) || 0) : 0) : Math.max(0, t.deprEsteAnio);
    return { id: b.id, nm: b.desc || 'Activo', fecha: b.fecha, contable: c.deprEsteAnio, tributaria: depTribEj, diferencia: depTribEj - c.deprEsteAnio, valorTributario: +((b.valorTributario ?? b.valor) as number) || 0 };
  });
  return {
    contable: detalle.reduce((s, x) => s + x.contable, 0), tributaria: detalle.reduce((s, x) => s + x.tributaria, 0),
    diferencia: detalle.reduce((s, x) => s + x.diferencia, 0), detalle, instantanea: !!deprInstantanea,
  };
}

/** Asiento de depreciación del ejercicio: gasto contra depreciación acumulada, agrupado por cuenta. */
export function asientoDepreciacion(bienes: (Bien & { cuentaGasto: string; cuentaDeprAcum: string })[], anio: number) {
  const porGasto: Record<string, number> = {}, porAcum: Record<string, number> = {};
  const detalle: { id?: string; desc?: string; monto: number }[] = [];
  let total = 0;
  for (const b of bienes.filter((x) => x.estado !== 'anulado')) {
    const d = calcularDepreciacionContable(b, anio);
    if (d.deprEsteAnio <= 0) continue;
    porGasto[b.cuentaGasto] = (porGasto[b.cuentaGasto] || 0) + d.deprEsteAnio;
    porAcum[b.cuentaDeprAcum] = (porAcum[b.cuentaDeprAcum] || 0) + d.deprEsteAnio;
    detalle.push({ id: b.id, desc: b.desc, monto: d.deprEsteAnio });
    total += d.deprEsteAnio;
  }
  const lineas = [
    ...Object.keys(porGasto).sort().map((cuenta) => ({ cuenta, debe: porGasto[cuenta], haber: 0, glosa: `Depreciación ${anio}` })),
    ...Object.keys(porAcum).sort().map((cuenta) => ({ cuenta, debe: 0, haber: porAcum[cuenta], glosa: `Depreciación acumulada ${anio}` })),
  ];
  return { lineas, total, detalle, fecha: `${anio}-12-31`, glosa: `Depreciación del ejercicio ${anio}` };
}
