/**
 * La cartera entera, de todos los clientes a la vez.
 *
 * «Si tengo 100 clientes no voy cliente por cliente: le doy imprimir y me
 * salen todos, separados por cliente». El estado de cuenta por cliente sigue
 * siendo para mandárselo a él; esto es el papel interno que Andrea sacaba de
 * una tabla dinámica en Excel.
 *
 * Acá vive la parte sin base de datos: agrupar, sumar en centavos y decidir
 * cuántos días lleva vencida cada factura. Lo usan el PDF y el Excel, para
 * que digan lo mismo.
 */

export interface FacturaDeCartera {
  clienteId: string;
  cliente: string;
  telefono?: string | null;
  facturaId: string;
  numero: string;
  /** ISO. */
  fecha: string;
  /** `YYYY-MM-DD` o null. */
  vence?: string | null;
  total: number;
  pagado: number;
}

export interface FacturaResumida {
  facturaId: string;
  numero: string;
  fecha: string;
  vence: string | null;
  total: number;
  pagado: number;
  saldo: number;
  /** Días desde el vencimiento; 0 si no venció o no tiene fecha. */
  diasVencida: number;
}

export interface ClienteEnCartera {
  clienteId: string;
  cliente: string;
  telefono: string | null;
  facturas: FacturaResumida[];
  facturado: number;
  pagado: number;
  saldo: number;
  /** La factura más vencida del cliente. */
  diasVencidaMax: number;
}

export interface CarteraCompleta {
  clientes: ClienteEnCartera[];
  facturas: number;
  facturado: number;
  pagado: number;
  saldo: number;
  /** Lo que ya venció, sumado. */
  vencido: number;
}

const centavos = (n: number) => Math.round((Number(n) || 0) * 100);
const pesos = (c: number) => c / 100;

/** Días enteros entre el vencimiento y hoy, en días de calendario. */
export function diasVencida(
  vence: string | null | undefined,
  hoy: string,
): number {
  if (!vence) return 0;
  const v = Date.UTC(
    +vence.slice(0, 4),
    +vence.slice(5, 7) - 1,
    +vence.slice(8, 10),
  );
  const h = Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10));
  return Math.max(0, Math.round((h - v) / 86_400_000));
}

/**
 * Agrupa por cliente las facturas con saldo. Un cliente con todo pagado no
 * sale: la cartera es lo que se debe. Los clientes van del que más debe al
 * que menos; sus facturas, de la más vieja a la más nueva.
 */
export function armarCarteraCompleta(
  filas: FacturaDeCartera[],
  hoy: string,
): CarteraCompleta {
  const porCliente = new Map<
    string,
    ClienteEnCartera & { _facturado: number; _pagado: number; _saldo: number }
  >();
  let facturas = 0;
  let facturado = 0;
  let pagado = 0;
  let vencido = 0;
  for (const f of filas) {
    const total = centavos(f.total);
    const pag = centavos(f.pagado);
    const saldo = total - pag;
    if (saldo <= 0) continue;
    const c = porCliente.get(f.clienteId) ?? {
      clienteId: f.clienteId,
      cliente: f.cliente,
      telefono: f.telefono ?? null,
      facturas: [],
      facturado: 0,
      pagado: 0,
      saldo: 0,
      diasVencidaMax: 0,
      _facturado: 0,
      _pagado: 0,
      _saldo: 0,
    };
    const dias = diasVencida(f.vence, hoy);
    c.facturas.push({
      facturaId: f.facturaId,
      numero: f.numero,
      fecha: f.fecha,
      vence: f.vence ?? null,
      total: pesos(total),
      pagado: pesos(pag),
      saldo: pesos(saldo),
      diasVencida: dias,
    });
    c._facturado += total;
    c._pagado += pag;
    c._saldo += saldo;
    c.diasVencidaMax = Math.max(c.diasVencidaMax, dias);
    porCliente.set(f.clienteId, c);
    facturas++;
    facturado += total;
    pagado += pag;
    if (dias > 0) vencido += saldo;
  }
  const clientes = [...porCliente.values()]
    .map((c) => {
      c.facturas.sort((a, b) => a.fecha.localeCompare(b.fecha));
      const { _facturado, _pagado, _saldo, ...resto } = c;
      return {
        ...resto,
        facturado: pesos(_facturado),
        pagado: pesos(_pagado),
        saldo: pesos(_saldo),
      };
    })
    .sort((a, b) => b.saldo - a.saldo || a.cliente.localeCompare(b.cliente));
  return {
    clientes,
    facturas,
    facturado: pesos(facturado),
    pagado: pesos(pagado),
    saldo: pesos(facturado - pagado),
    vencido: pesos(vencido),
  };
}
