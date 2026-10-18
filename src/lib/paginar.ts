/**
 * Supabase (PostgREST) devuelve como máximo 1.000 filas por consulta.
 * Trae todas las filas pidiendo páginas sucesivas con .range(desde, hasta).
 */
export async function traerTodo<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  tam = 1000,
): Promise<T[]> {
  const todo: T[] = [];
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await pagina(desde, desde + tam - 1);
    if (error) throw new Error(error.message);
    todo.push(...(data ?? []));
    if (!data || data.length < tam) return todo;
  }
}
