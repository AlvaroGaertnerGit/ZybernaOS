/**
 * La API de Supabase devuelve como máximo 1.000 filas por petición (ajuste *Max rows*).
 * `fetchAll` pide páginas consecutivas con `range()` hasta agotar los resultados, de modo
 * que una exportación o una lista larga nunca se trunca en silencio.
 *
 * La consulta debe tener un orden total (p. ej. por código o id) para que las páginas no
 * se solapen. `max` evita bucles sin fin y avisa con un error si se supera.
 */
export const API_PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  what: string,
  { pageSize = API_PAGE_SIZE, max = 50_000 }: { pageSize?: number; max?: number } = {},
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(`No se pudo leer ${what}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
    if (out.length >= max) throw new Error(`Demasiados registros en ${what} (más de ${max}).`);
  }
}
