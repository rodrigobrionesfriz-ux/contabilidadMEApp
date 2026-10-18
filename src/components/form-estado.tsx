'use client';

import { useFormStatus } from 'react-dom';

export function Mensaje({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <p role="alert" className="rounded-md border border-peligro/40 bg-peligro/10 px-3 py-2 text-sm text-peligro">{error}</p>;
  if (ok) return <p role="status" className="rounded-md border border-acento/40 bg-acento/10 px-3 py-2 text-sm text-acento">{ok}</p>;
  return null;
}

export function BotonEnviar({ children, pendiente = 'Procesando…' }: { children: React.ReactNode; pendiente?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton w-full" disabled={pending}>
      {pending ? pendiente : children}
    </button>
  );
}
