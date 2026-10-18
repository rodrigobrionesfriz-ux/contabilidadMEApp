// XML de Información Electrónica de Compras y Ventas (IECV, esquema LibroCV_v10 del SII):
// traslado fiel de xmlsii.js. El archivo cumple el formato de datos; para presentarlo debe firmarse.

import { dteC, dteV } from '@/motor/dte';

export interface DocIECV { tipoDTE: number; folio: string | number; fecha: string | null; rut: string | null; razonSocial: string | null; neto: number; exento: number; iva: number; total: number }
export type TipoOperacion = 'VENTA' | 'COMPRA';

export const escXml = (s: unknown) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** RUT en formato SII sin puntos: 12345678-9 (0-0 si no hay). */
export function rutSii(rut: string | null | undefined) {
  const s = String(rut || '').replace(/[^0-9kK-]/g, '').toUpperCase();
  if (!s) return '0-0';
  if (s.includes('-')) { const [c, d] = s.split('-'); return `${c.replace(/^0+/, '') || '0'}-${d || '0'}`; }
  return `${s.slice(0, -1)}-${s.slice(-1)}`;
}
const signoDe = (tipo: TipoOperacion, cod: number) => (tipo === 'VENTA' ? dteV(cod)?.signo : dteC(cod)?.signo) || 1;
const R = (n: number) => Math.round(n || 0);

export function resumenIECV(tipo: TipoOperacion, docs: DocIECV[]) {
  const resumen: Record<string, { docs: number; exe: number; neto: number; iva: number; total: number }> = {};
  const total = { docs: 0, exe: 0, neto: 0, iva: 0, total: 0 };
  for (const d of docs) {
    const cod = d.tipoDTE;
    if (!resumen[cod]) resumen[cod] = { docs: 0, exe: 0, neto: 0, iva: 0, total: 0 };
    const s = signoDe(tipo, cod);
    const neto = (d.neto || 0) * s, exe = (d.exento || 0) * s, iva = (d.iva || 0) * s, tot = (d.total || 0) * s;
    const r = resumen[cod]; r.docs++; r.neto += neto; r.exe += exe; r.iva += iva; r.total += tot;
    total.docs++; total.neto += neto; total.exe += exe; total.iva += iva; total.total += tot;
  }
  return { resumen, total };
}

export function xmlIECV(tipo: TipoOperacion, periodo: string, rutEmpresa: string, docs: DocIECV[]) {
  const rutEmisor = rutSii(rutEmpresa);
  const anio = periodo.slice(0, 4);
  const { resumen } = resumenIECV(tipo, docs);
  let xml = '<?xml version="1.0" encoding="ISO-8859-1"?>\n';
  xml += '<LibroCompraVenta xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte LibroCV_v10.xsd" version="1.0">\n';
  xml += '  <EnvioLibro ID="LIBRO' + periodo.replace('-', '') + '">\n';
  xml += '    <Caratula>\n';
  xml += '      <RutEmisorLibro>' + escXml(rutEmisor) + '</RutEmisorLibro>\n';
  xml += '      <RutEnvia>' + escXml(rutEmisor) + '</RutEnvia>\n';
  xml += '      <PeriodoTributario>' + periodo + '</PeriodoTributario>\n';
  xml += '      <FchResol>' + anio + '-01-01</FchResol>\n';
  xml += '      <NroResol>0</NroResol>\n';
  xml += '      <TipoOperacion>' + tipo + '</TipoOperacion>\n';
  xml += '      <TipoLibro>MENSUAL</TipoLibro>\n';
  xml += '      <TipoEnvio>TOTAL</TipoEnvio>\n';
  xml += '    </Caratula>\n';
  xml += '    <ResumenPeriodo>\n';
  for (const cod of Object.keys(resumen)) {
    const r = resumen[cod];
    xml += '      <TotalesPeriodo>\n';
    xml += '        <TpoDoc>' + cod + '</TpoDoc>\n';
    xml += '        <TotDoc>' + r.docs + '</TotDoc>\n';
    xml += '        <TotMntExe>' + (R(r.exe) ? R(r.exe) : 0) + '</TotMntExe>\n';
    xml += '        <TotMntNeto>' + R(r.neto) + '</TotMntNeto>\n';
    xml += '        <TotMntIVA>' + R(r.iva) + '</TotMntIVA>\n';
    xml += '        <TotMntTotal>' + R(r.total) + '</TotMntTotal>\n';
    xml += '      </TotalesPeriodo>\n';
  }
  xml += '    </ResumenPeriodo>\n';
  for (const d of docs) {
    const s = signoDe(tipo, d.tipoDTE);
    xml += '    <Detalle>\n';
    xml += '      <TpoDoc>' + d.tipoDTE + '</TpoDoc>\n';
    xml += '      <NroDoc>' + (d.folio || 0) + '</NroDoc>\n';
    if (R(d.iva)) xml += '      <TasaImp>19</TasaImp>\n';
    xml += '      <FchDoc>' + (d.fecha || periodo + '-01') + '</FchDoc>\n';
    xml += '      <RUTDoc>' + escXml(d.rut ? rutSii(d.rut) : '0-0') + '</RUTDoc>\n';
    xml += '      <RznSoc>' + escXml((d.razonSocial || '').slice(0, 50)) + '</RznSoc>\n';
    const exe = R((d.exento || 0) * s);
    if (exe) xml += '      <MntExe>' + exe + '</MntExe>\n';
    xml += '      <MntNeto>' + R((d.neto || 0) * s) + '</MntNeto>\n';
    if (R(d.iva)) xml += '      <MntIVA>' + R((d.iva || 0) * s) + '</MntIVA>\n';
    xml += '      <MntTotal>' + R((d.total || 0) * s) + '</MntTotal>\n';
    xml += '    </Detalle>\n';
  }
  xml += '  </EnvioLibro>\n';
  xml += '</LibroCompraVenta>\n';
  return xml;
}

/** Bytes en ISO-8859-1, como declara el encabezado (el sistema actual lo descargaba en UTF-8). */
export function aLatin1(texto: string) {
  const out: number[] = [];
  for (const ch of texto) { const cp = ch.codePointAt(0)!; out.push(cp <= 255 ? cp : 0x3F); }
  return new Uint8Array(out);
}
