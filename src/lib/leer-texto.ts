// Lee el texto de un archivo subido (.txt, .md, .html, .docx) en el navegador.
import { limpiarTexto } from '@/remuneraciones/finiquito';

const entidades = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');

/** Texto de un .docx: un párrafo por <w:p>, saltos <w:br/> y tabulaciones (sin dependencias extra: usa el lector ZIP de xlsx). */
export async function textoDocx(buf: ArrayBuffer) {
  const XLSX = await import('xlsx');
  const zip = XLSX.CFB.read(new Uint8Array(buf), { type: 'array' });
  const doc = XLSX.CFB.find(zip, '/word/document.xml') || XLSX.CFB.find(zip, 'word/document.xml');
  if (!doc || !doc.content) throw new Error('El archivo no parece un documento Word (.docx).');
  const xml = new TextDecoder('utf-8').decode(doc.content as Uint8Array);
  const cuerpo = xml.replace(/^[\s\S]*?<w:body[^>]*>/, '').replace(/<\/w:body>[\s\S]*$/, '');
  const parrafos = cuerpo.split(/<\/w:p>/).map((p) => entidades(p.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, '\u0001$1\u0002').replace(/<[^>]+>/g, '').replace(/\u0001|\u0002/g, '')));
  return parrafos.join('\n\n');
}

export async function leerArchivoTexto(file: File) {
  const nm = (file.name || '').toLowerCase();
  if (nm.endsWith('.docx')) return limpiarTexto(await textoDocx(await file.arrayBuffer()));
  if (nm.endsWith('.doc')) throw new Error('El formato .doc antiguo no se puede leer. Guárdalo como .docx o .txt.');
  if (nm.endsWith('.pdf')) throw new Error('Los PDF no se pueden editar. Sube el texto en .docx o .txt.');
  let txt = await file.text();
  if (nm.endsWith('.html') || nm.endsWith('.htm')) {
    const d = document.createElement('div');
    d.innerHTML = txt.replace(/<\/(p|div|h\d|li|tr)>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n');
    txt = d.textContent || '';
  }
  return limpiarTexto(txt);
}
