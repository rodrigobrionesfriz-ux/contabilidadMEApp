// Genera un .docx mínimo desde texto con el formato de plantillas (traslado de docx-simple.js).
//  - 1ª línea en mayúsculas → título centrado y en negrita
//  - párrafos separados por línea en blanco; salto de línea simple → <w:br/>
//  - "PRIMERO:" al inicio → negrita; {{marcador}} y [dato faltante] → resaltados en amarillo
// El ZIP se arma con el lector/escritor CFB que ya trae xlsx (sin dependencias nuevas).

const x = (s: unknown) =>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function run(texto: string, { b = false, marca = false, sz = 22 }: { b?: boolean; marca?: boolean; sz?: number } = {}) {
  if(texto==='')return '';
  return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${b?'<w:b/>':''}${marca?'<w:highlight w:val="yellow"/>':''}<w:sz w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${x(texto)}</w:t></w:r>`;
}
// Una línea: separa marcadores {{x}} y faltantes [x] para resaltarlos
function runsLinea(linea: string, opts: { b?: boolean; sz?: number }) {
  const out: string[] = []; let ult = 0; const re = /\{\{\s*[a-z_]+\s*\}\}|\[[a-záéíóúñ ]+\]/gi; let m: RegExpExecArray | null;
  while((m=re.exec(linea))){out.push(run(linea.slice(ult,m.index),opts));out.push(run(m[0],{...opts,marca:true}));ult=m.index+m[0].length;}
  out.push(run(linea.slice(ult),opts));
  return out.join('');
}
function parrafo(texto: string, { titulo = false } = {}) {
  const lineas=String(texto).split('\n');
  const pPr=titulo?'<w:pPr><w:jc w:val="center"/><w:spacing w:after="280"/></w:pPr>'
    :'<w:pPr><w:jc w:val="both"/><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr>';
  const partes=lineas.map((l,i)=>{
    let r='';
    if(titulo)r=runsLinea(l,{b:true,sz:26});
    else if(i===0){const m=l.match(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{2,40}:)/);r=m?run(m[1],{b:true})+runsLinea(l.slice(m[1].length),{}):runsLinea(l,{});}
    else r=runsLinea(l,{});
    return (i?'<w:r><w:br/></w:r>':'')+r;
  });
  return `<w:p>${pPr}${partes.join('')}</w:p>`;
}
// Firmas: tabla de dos columnas sin bordes con línea superior
function firmas(cols: string[][]) {
  const celda = (lineas: string[]) =>`<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:space="4" w:color="000000"/></w:pBdr><w:jc w:val="center"/></w:pPr>${lineas.map((l,i)=>(i?'<w:r><w:br/></w:r>':'')+run(l,{sz:20})).join('')}</w:p></w:tc>`;
  const sep='<w:tc><w:tcPr><w:tcW w:w="600" w:type="dxa"/></w:tcPr><w:p/></w:tc>';
  return `<w:p><w:pPr><w:spacing w:before="1400"/></w:pPr></w:p><w:tbl><w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="600"/><w:gridCol w:w="4500"/></w:tblGrid><w:tr>${celda(cols[0]||[])}${sep}${celda(cols[1]||[])}</w:tr></w:tbl>`;
}
export function documentXml(texto: string, { firmas: f = null }: { firmas?: string[][] | null } = {}) {
  const bloques=String(texto||'').replace(/\r/g,'').split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  const cuerpo=bloques.map((b,i)=>parrafo(b,{titulo:i===0&&b.length<90&&b===b.toUpperCase()&&!b.includes('\n')})).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}${f?firmas(f):''}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1247" w:right="1247" w:bottom="1247" w:left="1247" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}
const CONTENT_TYPES=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
const RELS=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
const core = (titulo: string, asunto: string) =>`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${x(titulo)}</dc:title><dc:subject>${x(asunto||'')}</dc:subject><dc:creator>asent_IA</dc:creator></cp:coreProperties>`;


export async function crearDocx(texto: string, { titulo = 'Documento', asunto = '', firmas: f = null }: { titulo?: string; asunto?: string; firmas?: string[][] | null } = {}) {
  const XLSX = await import('xlsx');
  const C = XLSX.CFB;
  const z = C.utils.cfb_new({ root: 'R' } as never);
  const enc = new TextEncoder();
  C.utils.cfb_add(z, '/[Content_Types].xml', enc.encode(CONTENT_TYPES) as never);
  C.utils.cfb_add(z, '/_rels/.rels', enc.encode(RELS) as never);
  C.utils.cfb_add(z, '/docProps/core.xml', enc.encode(core(titulo, asunto)) as never);
  C.utils.cfb_add(z, '/word/document.xml', enc.encode(documentXml(texto, { firmas: f })) as never);
  return C.write(z, { fileType: 'zip', type: 'array', compression: true } as never) as unknown as Uint8Array;
}

export async function descargarDocx(texto: string, nombre: string, opts: { titulo?: string; asunto?: string; firmas?: string[][] | null } = {}) {
  const bytes = await crearDocx(texto, opts);
  const blob = new Blob([new Uint8Array(bytes as ArrayLike<number>)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1500);
}
