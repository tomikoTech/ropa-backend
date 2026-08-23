import { esHostLocal } from './host-local.js';

/**
 * Si la base a la que se está apuntando es la de esta máquina.
 *
 * De esto depende si un script abre SSL o no, y si `synchronize` puede tocar
 * el esquema. Estaba escrita seis veces, y **tres de esas copias no
 * reconocían el socket de Unix**: contra el Postgres de una Mac de desarrollo
 * —que no responde por TCP— la conexión moría con «the server does not support
 * SSL connections», y quien tuviera prisa lo «arreglaba» apuntando a la base
 * de producción, que sí acepta SSL.
 *
 * Ese es el accidente que esto evita, y por eso la regla vive en un solo sitio.
 */
describe('esHostLocal', () => {
  it('el socket de Unix es local', () => {
    // La que faltaba en tres copias. En esta máquina Postgres solo responde
    // por socket.
    expect(esHostLocal('/tmp')).toBe(true);
    expect(esHostLocal('/var/run/postgresql')).toBe(true);
  });

  it('localhost y la ip de loopback también', () => {
    expect(esHostLocal('localhost')).toBe(true);
    expect(esHostLocal('127.0.0.1')).toBe(true);
  });

  it('cualquier otra cosa no lo es', () => {
    // Railway y su proxy público: acá SSL es obligatorio y `synchronize`
    // jamás debe correr.
    expect(esHostLocal('switchback.proxy.rlwy.net')).toBe(false);
    expect(esHostLocal('postgres.railway.internal')).toBe(false);
  });

  it('sin host, se asume local', () => {
    // Es el valor por defecto de todos los scripts, y equivocarse hacia
    // «local» solo rompe la conexión; hacia «remoto» escribe en producción.
    expect(esHostLocal(undefined)).toBe(true);
    expect(esHostLocal('')).toBe(true);
  });

  it('una URL de conexión gana sobre el host', () => {
    // `DATABASE_URL` apunta a producción aunque `DB_HOST` diga localhost: si
    // hay URL, manda ella.
    expect(esHostLocal('localhost', 'postgres://user@host/db')).toBe(false);
    expect(esHostLocal('/tmp', 'postgres://user@host/db')).toBe(false);
  });

  it('una URL vacía no cuenta como URL', () => {
    // Así se apaga a mano: `DATABASE_URL=` delante del comando.
    expect(esHostLocal('/tmp', '')).toBe(true);
    expect(esHostLocal('/tmp', undefined)).toBe(true);
  });

  it('un host con espacios alrededor sigue siendo el mismo host', () => {
    expect(esHostLocal('  localhost  ')).toBe(true);
    expect(esHostLocal(' /tmp ')).toBe(true);
  });
});
