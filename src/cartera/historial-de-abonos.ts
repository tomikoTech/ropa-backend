/**
 * El historial de abonos: cuándo entró (o salió) la plata, cuánto y de quién.
 *
 * Los saldos ya se veían —«el cliente debe 300.000»— pero no **cómo se llegó
 * a ese saldo**. Cuando alguien reclama «yo le abono todos los sábados», la
 * respuesta estaba escondida: había que abrir factura por factura en la
 * cartera para ver sus abonos. Esto lo pone en una sola línea de tiempo,
 * agrupada por día.
 *
 * Sirve para las dos carteras: **cobrar y pagar es el mismo relato**, lo
 * único que cambia es de qué lado está la plata. Por eso vive en `common` y
 * recibe los renglones ya armados; quien llama decide si el tercero es un
 * cliente o un proveedor.
 *
 * Vive aparte del servicio a propósito: es aritmética de plata y se prueba
 * hasta el último caso raro sin levantar una base de datos.
 *
 * **Todo en centavos enteros.** Los montos llegan de Postgres como `decimal`
 * (texto) y sumarlos como float deja totales de 79.999,999999998, que en
 * pantalla se ven bien y contra el recibo no dan.
 */

import { diaLocal } from '../caja/cuadre.js';

export interface AbonoCrudo {
  id: string;
  /** Cuándo se registró. */
  fecha: Date;
  /** Centavos enteros. Negativo = contra-abono (un abono que se deshizo). */
  centavos: number;
  metodo: string;
  /** Cliente o proveedor. `null` cuando la factura no tiene ninguno. */
  terceroId: string | null;
  terceroNombre: string;
  /** Número de factura u orden de compra a la que se aplicó. */
  documento: string | null;
  referencia: string | null;
  bancoNombre: string | null;
  /** Quién recibió el abono (o quién pagó). */
  quien: string | null;
  nota: string | null;
  /** El abono que este renglón compensa: si viene, este es el contra-abono. */
  reversaDe: string | null;
  /** Une los renglones que salieron de un mismo abono repartido. */
  loteId: string | null;
  comprobanteUrl: string | null;
}

export interface RenglonDeAbono extends AbonoCrudo {
  /** El día de la tienda al que pertenece (`YYYY-MM-DD`). */
  dia: string;
  /** Este renglón deshace otro. */
  esReverso: boolean;
  /** A este abono le pusieron después su contra-abono: ya no cuenta. */
  anulado: boolean;
}

export interface DiaDeAbonos {
  dia: string;
  /** Neto del día: los contra-abonos restan. */
  centavos: number;
  renglones: RenglonDeAbono[];
}

export interface TotalPorMetodo {
  metodo: string;
  centavos: number;
  cuantos: number;
}

export interface ResumenDeAbonos {
  /** Neto del periodo: lo que de verdad entró (o salió). */
  centavos: number;
  /**
   * Abonos que siguen en pie: sin los anulados ni sus contra-abonos, y
   * contando **una vez** el que se repartió entre varias facturas.
   */
  cuantos: number;
  /** Cuántos se deshicieron. Cero es lo normal; verlo alto es una señal. */
  anulados: number;
  porMetodo: TotalPorMetodo[];
  /** Cuántos terceros distintos aparecen. */
  terceros: number;
  /** El más viejo y el más nuevo del listado, para rotular el periodo. */
  desde: string | null;
  hasta: string | null;
}

export interface Historial {
  dias: DiaDeAbonos[];
  resumen: ResumenDeAbonos;
}

/**
 * Arma la línea de tiempo.
 *
 * Del día más reciente al más viejo, y dentro del día lo último primero: es
 * el orden en que se busca («¿qué me abonaron hoy?»), no el orden contable.
 */
export function historialDeAbonos(abonos: AbonoCrudo[]): Historial {
  const renglones = marcarReversos(abonos);

  const porDia = new Map<string, RenglonDeAbono[]>();
  for (const r of renglones) {
    const lista = porDia.get(r.dia);
    if (lista) lista.push(r);
    else porDia.set(r.dia, [r]);
  }

  const dias: DiaDeAbonos[] = [...porDia.entries()]
    .map(([dia, lista]) => ({
      dia,
      centavos: lista.reduce((t, r) => t + r.centavos, 0),
      renglones: lista.sort(
        (a, b) => b.fecha.getTime() - a.fecha.getTime() || a.id.localeCompare(b.id),
      ),
    }))
    .sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0));

  return { dias, resumen: resumirAbonos(renglones) };
}

/**
 * Quién deshizo a quién.
 *
 * Un abono no se borra: se le pone un renglón en negativo que lo compensa.
 * Los dos se muestran —para eso se guardan— pero el que quedó sin efecto se
 * marca, porque un abono tachado y uno vivo no se leen igual.
 */
export function marcarReversos(abonos: AbonoCrudo[]): RenglonDeAbono[] {
  const reversados = new Set(
    abonos.map((a) => a.reversaDe).filter((id): id is string => !!id),
  );
  return abonos.map((a) => ({
    ...a,
    dia: diaLocal(a.fecha),
    esReverso: !!a.reversaDe,
    anulado: reversados.has(a.id),
  }));
}

/**
 * Los totales del periodo.
 *
 * El neto suma todo, contra-abonos incluidos —por eso van en negativo—: así
 * «recaudado» dice lo que de verdad quedó, no lo que se digitó. El conteo, en
 * cambio, deja fuera al anulado y a su reverso: contarlos sería decir que
 * hubo tres abonos cuando hubo uno.
 */
export function resumirAbonos(renglones: RenglonDeAbono[]): ResumenDeAbonos {
  const porMetodo = new Map<string, TotalPorMetodo>();
  const terceros = new Set<string>();
  // Quien abona al saldo paga **una vez** y el servidor lo aplica a varias
  // facturas: son varios renglones del mismo lote. Contarlos por separado
  // mostraba una cobranza de tres abonos donde hubo uno.
  const abonos = new Set<string>();
  let centavos = 0;
  let anulados = 0;
  let desde: string | null = null;
  let hasta: string | null = null;

  for (const r of renglones) {
    centavos += r.centavos;
    if (r.anulado) anulados++;
    if (!r.anulado && !r.esReverso) {
      const cual = r.loteId ?? r.id;
      const nuevo = !abonos.has(cual);
      abonos.add(cual);
      const m = porMetodo.get(r.metodo) ?? {
        metodo: r.metodo,
        centavos: 0,
        cuantos: 0,
      };
      m.centavos += r.centavos;
      if (nuevo) m.cuantos++;
      porMetodo.set(r.metodo, m);
    }
    if (r.terceroId) terceros.add(r.terceroId);
    if (!desde || r.dia < desde) desde = r.dia;
    if (!hasta || r.dia > hasta) hasta = r.dia;
  }

  return {
    centavos,
    cuantos: abonos.size,
    anulados,
    // De lo que más entra a lo que menos: la primera línea contesta «¿cómo me
    // están pagando?».
    porMetodo: [...porMetodo.values()].sort((a, b) => b.centavos - a.centavos),
    terceros: terceros.size,
    desde,
    hasta,
  };
}

/** De `decimal` (texto) a centavos enteros, sin arrastrar el float. */
export function aCentavos(monto: string | number | null | undefined): number {
  return Math.round(Number(monto ?? 0) * 100);
}
