'use client';

// Editor visual: el texto se edita directo sobre la hoja; los datos de la ficha se ven con su valor
// real, destacados y protegidos (no se pueden borrar ni escribir dentro). Se guarda con {{marcadores}}.

import { useEffect, useMemo, useRef } from 'react';
import { segmentos, nombreDato } from '@/remuneraciones/contrato-editor';
import { OPCIONALES, MARCADORES_CONTRATO } from '@/remuneraciones/contrato-trabajo';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CLS = 'dato-ct rounded px-1 font-medium select-all cursor-default';
function html(texto: string, vals: Record<string, string>) {
  return segmentos(texto).map((s) => {
    if (s.tipo === 'texto') return esc(s.v);
    const v = vals[s.k];
    const vacio = !v;
    const opc = OPCIONALES.has(s.k);
    const cls = vacio ? (opc ? `${CLS} border border-dashed border-borde text-tenue` : `${CLS} border border-dashed border-aviso bg-aviso/15 text-aviso`) : `${CLS} bg-info/15 text-info`;
    const ver = vacio ? (opc ? `(${nombreDato(s.k)})` : `[${nombreDato(s.k)}]`) : v;
    return `<span contenteditable="false" data-k="${s.k}" class="${cls}" title="${esc(nombreDato(s.k))} · dato de la ficha">${esc(ver)}</span>`;
  }).join('');
}

/** DOM del editor → texto con marcadores. */
export function serializar(raiz: Node): string {
  let out = '';
  const ir = (n: Node, primero: boolean) => {
    if (n.nodeType === 3) { out += n.nodeValue ?? ''; return; }
    if (n.nodeType !== 1) return;
    const el = n as HTMLElement;
    if (el.dataset?.k) { out += `{{${el.dataset.k}}}`; return; }
    if (el.tagName === 'BR') { out += '\n'; return; }
    const bloque = el !== raiz && /^(DIV|P)$/.test(el.tagName);
    if (bloque && !primero && !out.endsWith('\n')) out += '\n';
    el.childNodes.forEach((c, i) => ir(c, i === 0 && primero));
  };
  ir(raiz, true);
  return out.replace(/ /g, ' ');
}

const tocaDatoEn = (raiz: HTMLElement | null, r: Range) => [...(raiz?.querySelectorAll('[data-k]') ?? [])].some((d) => r.intersectsNode(d));
const contar = (t: string) => (t.match(/\{\{[a-z_]+\}\}/g) || []).sort().join();

export function EditorContrato({ texto, vals, onCambio }: { texto: string; vals: Record<string, string>; onCambio: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const ultimo = useRef(texto);

  const firma = JSON.stringify(vals);
  const datos = useMemo(() => JSON.parse(firma) as Record<string, string>, [firma]);

  // Pinta al abrir, si cambian los datos, o si el texto llega de afuera (otra plantilla, volver a la plantilla).
  useEffect(() => { if (ref.current) ref.current.innerHTML = html(ultimo.current, datos); }, [datos]);
  useEffect(() => {
    if (ref.current && texto !== ultimo.current) { ref.current.innerHTML = html(texto, datos); ultimo.current = texto; }
  }, [texto, datos]);

  const tocaDato = (r: Range) => tocaDatoEn(ref.current, r);

  // beforeinput nativo (el onBeforeInput de React no avisa los borrados): bloquea lo que toque un dato.
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const antes = (ev: InputEvent) => {
      const e = ev;
      const rangos = ev.getTargetRanges?.() ?? [];
      const lista: Range[] = rangos.map((s) => { const r = document.createRange(); r.setStart(s.startContainer, s.startOffset); r.setEnd(s.endContainer, s.endOffset); return r; });
      const sel = window.getSelection();
      if (!lista.length && sel?.rangeCount) lista.push(sel.getRangeAt(0));
      if (lista.some((r) => !r.collapsed && tocaDatoEn(el, r))) { e.preventDefault(); return; }
      if (ev.inputType === 'insertParagraph' || ev.inputType === 'insertLineBreak') { e.preventDefault(); document.execCommand('insertText', false, '\n'); }
    };
    el.addEventListener('beforeinput', antes);
    return () => el.removeEventListener('beforeinput', antes);
  }, []);

  const cambio = () => {
    if (!ref.current) return;
    const t = serializar(ref.current);
    if (contar(t) !== contar(ultimo.current)) { ref.current.innerHTML = html(ultimo.current, datos); return; } // se perdió un dato: deshace
    ultimo.current = t;
    onCambio(t);
  };

  const pegar = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const sel = window.getSelection();
    if (sel?.rangeCount && !sel.getRangeAt(0).collapsed && tocaDato(sel.getRangeAt(0))) return;
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\{\{|\}\}/g, ''));
  };

  const rangoGuardado = useRef<Range | null>(null);
  const recordar = () => { const s = window.getSelection(); if (s?.rangeCount && ref.current?.contains(s.anchorNode)) rangoGuardado.current = s.getRangeAt(0).cloneRange(); };
  const insertar = (k: string) => {
    const raiz = ref.current; if (!raiz || !k) return;
    const plantilla = document.createElement('template'); plantilla.innerHTML = html(`{{${k}}}`, datos);
    const nodo = plantilla.content.firstChild!;
    const r = rangoGuardado.current && raiz.contains(rangoGuardado.current.startContainer) ? rangoGuardado.current : (() => { const x = document.createRange(); x.selectNodeContents(raiz); x.collapse(false); return x; })();
    if (!r.collapsed && tocaDato(r)) return;
    r.deleteContents(); r.insertNode(nodo); r.setStartAfter(nodo); r.collapse(true);
    const t = serializar(raiz); ultimo.current = t; onCambio(t);
    const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); raiz.focus();
  };

  return (
    <div className="space-y-2">
      <div className="no-print flex flex-wrap items-center gap-2 text-xs text-tenue">
        <select aria-label="Insertar dato" className="campo w-auto py-1 text-xs" value="" onMouseDown={recordar} onFocus={recordar} onChange={(e) => insertar(e.target.value)}>
          <option value="">＋ Insertar dato de la ficha…</option>
          {MARCADORES_CONTRATO.map(([k, d]) => <option key={k} value={k}>{d}</option>)}
        </select>
        <span><span className="rounded bg-info/15 px-1 text-info">dato</span> viene de la ficha y no se edita aquí · <span className="rounded border border-dashed border-aviso px-1 text-aviso">[dato]</span> falta en la ficha</span>
      </div>
    <div ref={ref} onKeyUp={recordar} onMouseUp={recordar} onBlur={recordar} role="textbox" aria-multiline="true" aria-label="Texto del contrato" contentEditable suppressContentEditableWarning spellCheck
      onInput={cambio} onPaste={pegar} onDrop={(e) => e.preventDefault()}
      className="min-h-96 whitespace-pre-wrap text-justify outline-none focus:ring-2 focus:ring-acento/40 rounded" />
    </div>
  );
}
