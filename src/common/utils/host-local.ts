/**
 * Si la base a la que se está apuntando es la de esta máquina.
 *
 * De esto depende si la conexión abre SSL y si `synchronize` puede tocar el
 * esquema. La regla estaba escrita seis veces —en la configuración, en el
 * data source y en cuatro scripts de migración— y **tres de esas copias no
 * reconocían el socket de Unix**.
 *
 * El daño no es que falle: es cómo se falla. Contra el Postgres de una Mac de
 * desarrollo, que no responde por TCP, la conexión moría con «the server does
 * not support SSL connections», y el atajo evidente para quien tiene prisa es
 * apuntar a la base que sí acepta SSL — la de producción.
 */
export function esHostLocal(
  host: string | undefined | null,
  databaseUrl?: string | null,
): boolean {
  // Si hay URL de conexión, manda ella: apunta a producción aunque `DB_HOST`
  // diga localhost.
  if (databaseUrl && databaseUrl.trim()) return false;
  const limpio = (host ?? '').trim();
  // Sin host, el valor por defecto de todos los scripts es local. Equivocarse
  // hacia «local» rompe la conexión; hacia «remoto» escribe en producción.
  if (!limpio) return true;
  return (
    limpio === 'localhost' || limpio === '127.0.0.1' || limpio.startsWith('/')
  );
}
