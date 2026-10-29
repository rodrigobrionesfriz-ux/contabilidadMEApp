import Image from 'next/image';

/** Nombre de la app. Texto plano donde no se puede dar color (títulos, manifest, documentos). */
export const NOMBRE_APP = 'asent_IA';

/** Logotipo: "asent" en el color del texto, "_" en verde y "IA" en turquesa. */
export function Logotipo({ className = '' }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight ${className}`}>
      asent<span className="text-[#22c55e]">_</span><span className="text-[#2ec4b6]">IA</span>
    </span>
  );
}

/** Ícono más logotipo, para la barra superior y las pantallas de acceso. */
export function Marca({ tamano = 24, ocultarTextoEnCelular = false, className = '' }: { tamano?: number; ocultarTextoEnCelular?: boolean; className?: string }) {
  return (
    <span className={`flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      <Image src="/icons/icon-192.png" alt="" width={tamano} height={tamano} priority />
      <Logotipo className={ocultarTextoEnCelular ? 'hidden sm:inline' : ''} />
    </span>
  );
}
