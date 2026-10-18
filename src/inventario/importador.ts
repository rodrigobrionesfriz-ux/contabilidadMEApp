// Validación pura de la plantilla de productos: traslado fiel de inventario-importador.js.

export const TIPOS = ['MERCADERÍA', 'MATERIA PRIMA', 'PRODUCTO TERMINADO', 'INSUMO', 'ACTIVO FIJO', 'SERVICIO'];
export const UNIDADES = ['UN', 'KG', 'LT', 'MT', 'M2', 'M3', 'CAJA', 'SACO', 'PQT', 'GL'];
const TIPOS_SET = new Set(TIPOS), UNIDADES_SET = new Set(UNIDADES);
const texto = (v: unknown) => String(v ?? '').trim();
const mayus = (v: unknown) => texto(v).toUpperCase();
const cab = (v: unknown) => mayus(v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
const tipoCanon = (v: unknown) => ({ MERCADERIA: 'MERCADERÍA' } as Record<string, string>)[cab(v)] || mayus(v);
const unidadCanon = (v: unknown) => ({ UND: 'UN', UNIDAD: 'UN', UNIDADES: 'UN', LTS: 'LT', LITRO: 'LT', LITROS: 'LT', MTS: 'MT', METRO: 'MT', METROS: 'MT', PAQUETE: 'PQT', PAQUETES: 'PQT' } as Record<string, string>)[cab(v)] || mayus(v);
const numero = (v: unknown) => {
  if (v === '' || v == null) return 0;
  const s = String(v).trim().replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  return Number(s);
};
function booleano(v: unknown, defecto: boolean): boolean | null {
  const s = mayus(v); if (!s) return defecto;
  if (['SI', 'SÍ', 'S', '1', 'TRUE', 'VERDADERO', 'X'].includes(s)) return true;
  if (['NO', 'N', '0', 'FALSE', 'FALSO'].includes(s)) return false;
  return null;
}

export interface ProductoImport {
  id: string; codigo: string; ean: string; descripcion: string; tipo: string; unidad: string; grupoNombre: string; subgrupo: string;
  stockMinimo: number; cuentaInventario: string; cuentaCosto: string; aplicaIVA: boolean; manejaLotes: boolean; inventariable: boolean; activo: boolean;
}
interface ProdExistente { id: string; codigo: string; ean?: string | null; tipo?: string; unidad?: string; aplicaIVA?: boolean; manejaLotes?: boolean; inventariable?: boolean; activo?: boolean; cuentaCosto?: string }

export interface OpcionesImport { productos?: ProdExistente[]; actualizar?: boolean; cuentaGastoExiste?: (c: string) => boolean; cuentaInventarioFija?: string; productosConMovimientos?: string[] }
export function prepararImportacionProductos(filas: unknown[][], { productos = [], actualizar = false, cuentaGastoExiste = () => true, cuentaInventarioFija = '1109007', productosConMovimientos = [] }: OpcionesImport = {}) {
  if (!Array.isArray(filas) || !filas.length) throw new Error('El archivo está vacío');
  let hi = -1;
  for (let i = 0; i < Math.min(10, filas.length); i++) {
    const hs = (filas[i] || []).map(cab);
    if (hs.includes('CODIGO') && hs.includes('DESCRIPCION')) { hi = i; break; }
  }
  if (hi < 0) throw new Error('No se encontraron las columnas CÓDIGO y DESCRIPCIÓN. Usa la plantilla descargada desde el sistema.');
  const hs = (filas[hi] || []).map(cab), indice = (...nombres: string[]) => { for (const nm of nombres) { const i = hs.indexOf(nm); if (i >= 0) return i; } return -1; };
  const c: Record<string, number> = { codigo: indice('CODIGO', 'CODIGO_INTERNO'), ean: indice('EAN', 'CODIGO_EAN'), descripcion: indice('DESCRIPCION', 'PRODUCTO'), tipo: indice('TIPO'), unidad: indice('UNIDAD', 'UM'), grupo: indice('GRUPO'), subgrupo: indice('SUBGRUPO'), minimo: indice('STOCK_MINIMO', 'MINIMO'), cinv: indice('CUENTA_INVENTARIO'), ccosto: indice('CUENTA_COSTO_CONSUMO', 'CUENTA_COSTO', 'CUENTA_CONSUMO'), iva: indice('AFECTO_IVA', 'IVA'), lotes: indice('MANEJA_LOTES', 'LOTES'), inventariable: indice('INVENTARIABLE'), activo: indice('ACTIVO') };
  const valor = (r: unknown[], k: string) => (c[k] >= 0 ? texto(r[c[k]]) : '');
  const porCodigo = new Map(productos.map((p) => [mayus(p.codigo), p])), porEan = new Map(productos.filter((p) => texto(p.ean)).map((p) => [texto(p.ean), p]));
  const vistosCodigo = new Set<string>(), vistosEan = new Map<string, string>(), bloqueados = new Set(productosConMovimientos.map(String));
  const resultado: { fila: number; estado: 'NUEVO' | 'ACTUALIZA' | 'OMITE' | 'ERROR'; errores: string[]; codigo: string; producto: ProductoImport }[] = [];
  for (let i = hi + 1; i < filas.length; i++) {
    const r = filas[i] || [], codigo = mayus(valor(r, 'codigo')), descripcion = mayus(valor(r, 'descripcion'));
    if (!codigo && !descripcion && r.every((x) => !texto(x))) continue;
    const errores: string[] = [];
    if (!codigo) errores.push('Falta código');
    if (!descripcion) errores.push('Falta descripción');
    if (codigo && vistosCodigo.has(codigo)) errores.push('Código repetido dentro del archivo');
    if (codigo) vistosCodigo.add(codigo);
    const existente = porCodigo.get(codigo), ean = valor(r, 'ean');
    const tipo = tipoCanon(valor(r, 'tipo') || existente?.tipo || 'MERCADERÍA');
    const unidad = unidadCanon(valor(r, 'unidad') || existente?.unidad || 'UN');
    if (!TIPOS_SET.has(tipo)) errores.push(`Tipo inválido: ${tipo}`);
    if (!UNIDADES_SET.has(unidad)) errores.push(`Unidad inválida: ${unidad}`);
    const stockMinimo = numero(valor(r, 'minimo'));
    if (!Number.isFinite(stockMinimo) || stockMinimo < 0) errores.push('Stock mínimo inválido');
    const aplicaIVA = booleano(valor(r, 'iva'), existente?.aplicaIVA !== false);
    const manejaLotes = booleano(valor(r, 'lotes'), existente?.manejaLotes || false);
    const inventariable = booleano(valor(r, 'inventariable'), existente?.inventariable !== false);
    const activo = booleano(valor(r, 'activo'), existente?.activo !== false);
    if ([aplicaIVA, manejaLotes, inventariable, activo].includes(null)) errores.push('Usa SÍ o NO en las columnas lógicas');
    const grupo = mayus(valor(r, 'grupo')), subgrupo = mayus(valor(r, 'subgrupo'));
    if (subgrupo && !grupo) errores.push('Un subgrupo requiere grupo');
    const cuentaCosto = valor(r, 'ccosto') || texto(existente?.cuentaCosto) || '';
    if (!cuentaCosto) errores.push('Falta la cuenta de gasto/consumo');
    else if (!cuentaGastoExiste(cuentaCosto)) errores.push(`La cuenta de gasto/consumo debe ser una cuenta de Gasto del plan de cuentas: ${cuentaCosto}`);
    if (ean) {
      const otro = porEan.get(ean); if (otro && otro.id !== existente?.id) errores.push('EAN asignado a otro producto');
      if (vistosEan.has(ean) && vistosEan.get(ean) !== codigo) errores.push('EAN repetido dentro del archivo');
      vistosEan.set(ean, codigo);
    }
    if (existente && bloqueados.has(String(existente.id)) && manejaLotes !== !!existente.manejaLotes) errores.push('No se puede cambiar manejo de lotes porque el producto tiene movimientos');
    const estado = errores.length ? 'ERROR' : existente ? (actualizar ? 'ACTUALIZA' : 'OMITE') : 'NUEVO';
    resultado.push({ fila: i + 1, estado, errores, codigo, producto: { id: existente?.id || '', codigo, ean, descripcion, tipo, unidad, grupoNombre: grupo, subgrupo, stockMinimo: Number.isFinite(stockMinimo) ? stockMinimo : 0, cuentaInventario: cuentaInventarioFija, cuentaCosto, aplicaIVA: !!aplicaIVA, manejaLotes: !!manejaLotes, inventariable: !!inventariable, activo: !!activo } });
  }
  if (!resultado.length) throw new Error('La plantilla no contiene filas de productos');
  return { filas: resultado, resumen: { nuevos: resultado.filter((x) => x.estado === 'NUEVO').length, actualiza: resultado.filter((x) => x.estado === 'ACTUALIZA').length, omite: resultado.filter((x) => x.estado === 'OMITE').length, errores: resultado.filter((x) => x.estado === 'ERROR').length } };
}

export const PLANTILLA_ENCABEZADOS = ['CÓDIGO', 'EAN', 'DESCRIPCIÓN', 'TIPO', 'UNIDAD', 'GRUPO', 'SUBGRUPO', 'STOCK MÍNIMO', 'CUENTA INVENTARIO', 'CUENTA COSTO/CONSUMO', 'AFECTO IVA', 'MANEJA LOTES', 'INVENTARIABLE', 'ACTIVO'];
export const PLANTILLA_EJEMPLO = ['P000001', '7801234567890', 'PRODUCTO DE EJEMPLO', 'MERCADERÍA', 'UN', 'MERCADERÍAS', 'GENERAL', 0, '1109007', '3101002', 'SÍ', 'NO', 'SÍ', 'SÍ'];
export const PLANTILLA_INSTRUCCIONES = [
  ['PLANTILLA DE PRODUCTOS · INSTRUCCIONES'],
  ['1. No cambies los encabezados de la hoja Productos. Código y descripción son obligatorios.'],
  ['2. La carga crea productos nuevos. Para modificar códigos existentes debes marcar «Actualizar productos existentes» al importar.'],
  ['3. Los grupos y subgrupos inexistentes se crearán automáticamente en la empresa.'],
  ['4. Valores lógicos admitidos: SÍ o NO. Stock mínimo puede ser cero.'],
  ['5. Esta plantilla no carga cantidades ni costos iniciales. Esos saldos se ingresan mediante un movimiento de inventario (motivo SALDO INICIAL).'],
  ['6. La cuenta de inventario es siempre 1109007 para todos los productos: lo que traiga esa columna se ignora.'],
  ['7. La cuenta de gasto/consumo es obligatoria y debe ser una cuenta de gasto (grupo 3) del plan de cuentas de la empresa.'],
  ['8. Tipos permitidos: ' + TIPOS.join(', ') + '.'],
  ['9. Unidades permitidas: ' + UNIDADES.join(', ') + '.'],
];
/** Siguiente código interno P000001, P000002… */
export function siguienteCodigo(codigos: string[]) {
  let max = 0; for (const c of codigos) { const m = String(c || '').match(/^P(\d+)$/i); if (m) max = Math.max(max, +m[1]); }
  return 'P' + String(max + 1).padStart(6, '0');
}
