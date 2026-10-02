/**
 * Un recibo que paga varias facturas.
 *
 * «Me dan un recibo con 100.000: 50 a una factura y 50 a otra. Yo ingreso el
 * recibo y el recibo busca las facturas, no al revés». Hasta ahora había que
 * abrir cada factura y abonarle por separado, y el número de recibo se perdía.
 *
 * Esto propone un reparto (la factura más vieja primero, que es como se cobra)
 * y comprueba el que la cajera corrija a mano: que sume lo del recibo y que
 * ninguna factura reciba más de lo que debe. Todo en centavos.
 */

export interface FacturaPorPagar {
  id: string;
  numero: string;
  /** ISO, para ordenar de la más vieja a la más nueva. */
  fecha: string;
  saldo: number;
}

export interface Reparto {
  id: string;
  monto: number;
}

/** La más vieja primero; a igual fecha (o sin ella), por número de factura. */
export const ordenDeCobro = (a: FacturaPorPagar, b: FacturaPorPagar) =>
  a.fecha.localeCompare(b.fecha) ||
  a.numero.localeCompare(b.numero, 'es', { numeric: true });

const centavos = (n: number) => Math.round((Number(n) || 0) * 100);
const pesos = (c: number) => c / 100;

/** La propuesta: de la más vieja a la más nueva, hasta agotar el recibo. */
export function repartoPropuesto(
  facturas: FacturaPorPagar[],
  monto: number,
): Reparto[] {
  let resta = centavos(monto);
  const orden = [...facturas].filter((f) => f.saldo > 0).sort(ordenDeCobro);
  const reparto: Reparto[] = [];
  for (const f of orden) {
    if (resta <= 0) break;
    const aplica = Math.min(centavos(f.saldo), resta);
    reparto.push({ id: f.id, monto: pesos(aplica) });
    resta -= aplica;
  }
  return reparto;
}

export interface RepartoComprobado {
  ok: boolean;
  motivo?: string;
  /** Lo repartido, en pesos. */
  repartido: number;
  /** Lo que sobra del recibo sin factura a la que ir. */
  sobra: number;
}

/** El reparto corregido a mano: tiene que cuadrar con el recibo y con cada factura. */
export function comprobarReparto(
  facturas: FacturaPorPagar[],
  monto: number,
  reparto: Reparto[],
): RepartoComprobado {
  const total = centavos(monto);
  const porId = new Map(facturas.map((f) => [f.id, f]));
  let repartido = 0;
  const vistas = new Set<string>();
  for (const r of reparto) {
    const m = centavos(r.monto);
    if (m <= 0) continue;
    const f = porId.get(r.id);
    if (!f)
      return {
        ok: false,
        motivo: 'Una de las facturas del reparto no es de este cliente.',
        repartido: pesos(repartido),
        sobra: pesos(total - repartido),
      };
    if (vistas.has(r.id))
      return {
        ok: false,
        motivo: `La factura ${f.numero} aparece dos veces.`,
        repartido: pesos(repartido),
        sobra: pesos(total - repartido),
      };
    vistas.add(r.id);
    if (m > centavos(f.saldo)) {
      return {
        ok: false,
        motivo: `A la factura ${f.numero} se le están abonando ${pesos(m).toLocaleString('es-CO')} y solo debe ${f.saldo.toLocaleString('es-CO')}.`,
        repartido: pesos(repartido),
        sobra: pesos(total - repartido),
      };
    }
    repartido += m;
  }
  if (repartido !== total) {
    return {
      ok: false,
      motivo: `El reparto suma ${pesos(repartido).toLocaleString('es-CO')} y el recibo es de ${pesos(total).toLocaleString('es-CO')}.`,
      repartido: pesos(repartido),
      sobra: pesos(total - repartido),
    };
  }
  if (total <= 0)
    return {
      ok: false,
      motivo: 'El recibo tiene que ser mayor a cero.',
      repartido: 0,
      sobra: 0,
    };
  return { ok: true, repartido: pesos(repartido), sobra: 0 };
}
