/**
 * Marca de agua de asent_IA en el fondo de las páginas de la app.
 * El dibujo (public/marca-agua.svg) se usa como máscara y se pinta con el color del texto del tema,
 * así se ve igual de suave en el tema claro y en el oscuro. Queda detrás del contenido, no recibe clics
 * y no sale al imprimir.
 */
export function MarcaAgua() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center print:hidden">
      <div
        className="aspect-[512/620] h-[min(60vh,70vw)] bg-texto opacity-[0.045]"
        style={{
          WebkitMask: 'url(/marca-agua.svg) center / contain no-repeat',
          mask: 'url(/marca-agua.svg) center / contain no-repeat',
        }}
      />
    </div>
  );
}
