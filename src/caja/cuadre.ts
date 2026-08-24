/**
 * La aritmética de cuadrar el día.
 *
 * Nace de cómo cierra una tienda de verdad: «yo al final del día entro a
 * transferencias, entro a la foto, corroboro que haya entrado esa plata, a esa
 * hora y a qué cuenta». Y como en un mismo local factura más de una persona,
 * el cuadre tiene que poder mirarse por vendedor sin dejar de cuadrar el local
 * completo.
 *
 * Vive aparte del servicio a propósito, igual que `ar-allocation.ts`: es la
 * parte donde un peso mal puesto manda a alguien a contar billetes dos veces,
 * y así se prueba hasta el último caso raro sin levantar una base de datos.
 *
 * **Todo en centavos enteros.** Los montos llegan de Postgres como `decimal`
 * (texto), y sumarlos como float deja totales de 79.999,999999998 que en
 * pantalla se ven bien y contra el cajón no dan.
 */

/** Los métodos tal como los guarda `payments.method`. */
export type MetodoDePago =
  | 'EFECTIVO'
  | 'TARJETA'
  | 'TRANSFERENCIA'
  | 'MIXTO'
  | 'CREDITO';

/**
 * De dónde viene la plata.
 *
 * A un local le entra por dos vías y las dos son del mismo día: lo que se
 * cobró al vender (`payments`) y lo que se cobró de lo fiado
 * (`accounts_receivable_payments`). Un cuadre que solo mire la primera le
 * queda debiendo a la tienda.
 */
/**
 * De dónde sale un movimiento del día.
 *
 * `GASTO` llega con los centavos **en negativo**: la plata sale del cajón. Se
 * suma por el mismo camino que lo demás, sin un caso especial que mantener.
 *
 * Hasta agosto el cuadre solo sumaba lo que entraba, y la tarjeta de efectivo
 * decía «En el cajón»: quien le pagara al domiciliario de la registradora y
 * cerrara el día veía un faltante que no era faltante.
 */
export type OrigenDeCaja = 'VENTA' | 'ABONO' | 'GASTO';

export interface MovimientoDeCaja {
  id: string;
  origen: OrigenDeCaja;
  metodo: MetodoDePago;
  /** Centavos enteros. */
  centavos: number;
  localId: string;
  localNombre: string;
  usuarioId: string;
  usuarioNombre: string;
  bancoId: string | null;
  bancoNombre: string | null;
  /** Foto del comprobante. Es lo que se va a mirar cuenta por cuenta. */
  comprobanteUrl: string | null;
  referencia: string | null;
  /** Número de factura o de la venta a la que se le abonó. */
  documento: string;
  registradoEn: Date;
  /**
   * La venta quedó anulada.
   *
   * Llega marcado en vez de filtrado en la consulta para poder mostrarlo: si
   * desapareciera, quien la hizo la busca, no la encuentra y termina creyendo
   * que el sistema perdió una venta.
   */
  anulado: boolean;
}

export interface Totales {
  efectivoCents: number;
  transferenciaCents: number;
  tarjetaCents: number;
  /** Lo que no cae en los tres anteriores. Suma al total igual. */
  otrosCents: number;
  totalCents: number;
  ventasCents: number;
  abonosCents: number;
  /**
   * Lo que salió, en positivo.
   *
   * Ya está restado de los demás totales; esto es para poder **mostrarlo**.
   * Sin la línea, el vendedor ve un número más chico y no sabe por qué.
   */
  gastosCents: number;
}

export interface Grupo {
  id: string;
  nombre: string;
  totales: Totales;
  /** Cuántos movimientos lo componen (para no contar filas en pantalla). */
  movimientos: number;
}

export interface GrupoLocal extends Grupo {
  porUsuario: Grupo[];
}

export interface Cuadre {
  totales: Totales;
  porLocal: GrupoLocal[];
  porUsuario: Grupo[];
  /** Transferencias cobradas sin foto: la lista de lo que hay que ir a buscar. */
  sinComprobante: MovimientoDeCaja[];
  /** Anuladas del día. No suman; se muestran para que nadie las busque. */
  anulados: MovimientoDeCaja[];
  /** Los movimientos que sí suman, en orden de reloj. */
  movimientos: MovimientoDeCaja[];
}

function totalesEnCero(): Totales {
  return {
    efectivoCents: 0,
    transferenciaCents: 0,
    tarjetaCents: 0,
    otrosCents: 0,
    totalCents: 0,
    ventasCents: 0,
    abonosCents: 0,
    gastosCents: 0,
  };
}

function acumular(t: Totales, m: MovimientoDeCaja): void {
  const c = Math.trunc(m.centavos);
  if (m.metodo === 'EFECTIVO') t.efectivoCents += c;
  else if (m.metodo === 'TRANSFERENCIA') t.transferenciaCents += c;
  else if (m.metodo === 'TARJETA') t.tarjetaCents += c;
  else t.otrosCents += c;

  if (m.origen === 'GASTO') t.gastosCents += Math.abs(c);
  else if (m.origen === 'ABONO') t.abonosCents += c;
  else t.ventasCents += c;

  t.totalCents += c;
}

/** ¿Hay foto de verdad? Texto vacío o en blanco es "no hay". */
export function tieneComprobante(url: string | null | undefined): boolean {
  return !!url && url.trim().length > 0;
}

/**
 * Solo la transferencia se corrobora con foto.
 *
 * El efectivo se cuenta en el cajón y la tarjeta la respalda el datáfono;
 * pedirles comprobante sería ruido que hace que nadie mire el que sí importa.
 */
export function exigeComprobante(metodo: MetodoDePago): boolean {
  return metodo === 'TRANSFERENCIA';
}

function nuevoGrupo(id: string, nombre: string): GrupoLocal {
  return {
    id,
    nombre,
    totales: totalesEnCero(),
    movimientos: 0,
    porUsuario: [],
  };
}

/** Alfabético por nombre, con el id como desempate para que sea determinístico. */
function porNombre(a: Grupo, b: Grupo): number {
  const n = a.nombre.localeCompare(b.nombre, 'es');
  return n !== 0 ? n : a.id.localeCompare(b.id);
}

/**
 * Arma el cuadre del día a partir de los movimientos ya traídos de la base.
 *
 * Quien llama decide el día y los filtros (local, vendedor); acá solo se suma.
 */
export function cuadrarDia(entrada: MovimientoDeCaja[]): Cuadre {
  const totales = totalesEnCero();
  const locales = new Map<string, GrupoLocal>();
  const usuariosDelLocal = new Map<string, Map<string, Grupo>>();
  const usuarios = new Map<string, Grupo>();
  const sinComprobante: MovimientoDeCaja[] = [];
  const anulados: MovimientoDeCaja[] = [];
  const movimientos: MovimientoDeCaja[] = [];

  for (const m of entrada) {
    if (m.anulado) {
      anulados.push(m);
      continue;
    }
    movimientos.push(m);
    acumular(totales, m);

    if (exigeComprobante(m.metodo) && !tieneComprobante(m.comprobanteUrl)) {
      sinComprobante.push(m);
    }

    let local = locales.get(m.localId);
    if (!local) {
      local = nuevoGrupo(m.localId, m.localNombre);
      locales.set(m.localId, local);
      usuariosDelLocal.set(m.localId, new Map());
    }
    acumular(local.totales, m);
    local.movimientos += 1;

    const enElLocal = usuariosDelLocal.get(m.localId)!;
    let vendedor = enElLocal.get(m.usuarioId);
    if (!vendedor) {
      vendedor = {
        id: m.usuarioId,
        nombre: m.usuarioNombre,
        totales: totalesEnCero(),
        movimientos: 0,
      };
      enElLocal.set(m.usuarioId, vendedor);
    }
    acumular(vendedor.totales, m);
    vendedor.movimientos += 1;

    let global = usuarios.get(m.usuarioId);
    if (!global) {
      global = {
        id: m.usuarioId,
        nombre: m.usuarioNombre,
        totales: totalesEnCero(),
        movimientos: 0,
      };
      usuarios.set(m.usuarioId, global);
    }
    acumular(global.totales, m);
    global.movimientos += 1;
  }

  for (const [localId, vendedores] of usuariosDelLocal) {
    locales.get(localId)!.porUsuario = [...vendedores.values()].sort(porNombre);
  }

  return {
    totales,
    porLocal: [...locales.values()].sort(porNombre),
    porUsuario: [...usuarios.values()].sort(porNombre),
    sinComprobante,
    anulados,
    // Orden de reloj: es como se lee un cuadre y como se compara contra el
    // extracto del banco, que también viene por hora.
    movimientos: movimientos.sort(
      (a, b) => a.registradoEn.getTime() - b.registradoEn.getTime(),
    ),
  };
}

export interface Descuadre {
  concepto: string;
  esperadoCents: number;
  sumadoCents: number;
}

/**
 * ¿El desglose suma lo mismo que el total?
 *
 * Es la misma idea del reporte de integridad del inventario: el número se
 * calcula por varios caminos y si dos no coinciden hay que decirlo, no
 * escoger uno. Un cuadre que se contradice y no avisa es peor que no tener
 * cuadre, porque la tienda ajusta la caja contra un número inventado.
 */
export function descuadresDelDesglose(cuadre: Cuadre): Descuadre[] {
  const { totales } = cuadre;
  const fallas: Descuadre[] = [];

  const porMetodo =
    totales.efectivoCents +
    totales.transferenciaCents +
    totales.tarjetaCents +
    totales.otrosCents;
  if (porMetodo !== totales.totalCents) {
    fallas.push({
      concepto: 'por método',
      esperadoCents: totales.totalCents,
      sumadoCents: porMetodo,
    });
  }

  // Menos los gastos: el total es lo que **queda**, no lo que entró. Sin esta
  // resta el cuadre se acusaba a sí mismo de estar descuadrado en todos los
  // días con un gasto.
  const porOrigen =
    totales.ventasCents + totales.abonosCents - totales.gastosCents;
  if (porOrigen !== totales.totalCents) {
    fallas.push({
      concepto: 'por origen',
      esperadoCents: totales.totalCents,
      sumadoCents: porOrigen,
    });
  }

  const porLocal = cuadre.porLocal.reduce(
    (n, l) => n + l.totales.totalCents,
    0,
  );
  if (porLocal !== totales.totalCents) {
    fallas.push({
      concepto: 'por local',
      esperadoCents: totales.totalCents,
      sumadoCents: porLocal,
    });
  }

  const porUsuario = cuadre.porUsuario.reduce(
    (n, u) => n + u.totales.totalCents,
    0,
  );
  if (porUsuario !== totales.totalCents) {
    fallas.push({
      concepto: 'por vendedor',
      esperadoCents: totales.totalCents,
      sumadoCents: porUsuario,
    });
  }

  return fallas;
}

export interface CuadreDeEfectivo {
  esperadoCents: number;
  contadoCents: number;
  /** Contado menos esperado: negativo es que falta. */
  diferenciaCents: number;
  estado: 'CUADRA' | 'SOBRA' | 'FALTA';
}

/**
 * Lo que el sistema dice que hay en el cajón contra lo que se contó.
 *
 * El sobrante se reporta igual que el faltante: sobra plata cuando una venta
 * no se registró, y esa es exactamente la que no aparece en ningún reporte.
 */
export function cuadrarEfectivo(
  esperadoCents: number,
  contadoCents: number,
): CuadreDeEfectivo {
  const esperado = Math.trunc(esperadoCents);
  const contado = Math.trunc(contadoCents);
  const diferencia = contado - esperado;
  return {
    esperadoCents: esperado,
    contadoCents: contado,
    diferenciaCents: diferencia,
    estado: diferencia === 0 ? 'CUADRA' : diferencia > 0 ? 'SOBRA' : 'FALTA',
  };
}

// ── El día de la tienda ─────────────────────────────────────────────────────

/**
 * Zona con la que se corta el día. La misma que usan los reportes: si el
 * cuadre y el reporte de ventas cortaran distinto, jamás darían igual.
 */
export const ZONA_DE_LA_TIENDA =
  process.env.REPORTS_TZ?.trim() || 'America/Bogota';

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Los campos de una fecha vista desde una zona, como números. */
function partesEnZona(
  instante: Date,
  zona: string,
): { y: number; m: number; d: number; h: number; min: number; s: number } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instante);
  const n = (tipo: string) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? '0');
  // `hour12: false` devuelve 24 para la medianoche en algunos entornos.
  const h = n('hour') % 24;
  return {
    y: n('year'),
    m: n('month'),
    d: n('day'),
    h,
    min: n('minute'),
    s: n('second'),
  };
}

/** Cuánto se adelanta la zona respecto a UTC, en minutos, en ese instante. */
function offsetMinutos(instante: Date, zona: string): number {
  const p = partesEnZona(instante, zona);
  const comoSiFueraUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return (comoSiFueraUtc - instante.getTime()) / 60_000;
}

/** El día (`YYYY-MM-DD`) al que pertenece un instante en la zona de la tienda. */
export function diaLocal(instante: Date, zona = ZONA_DE_LA_TIENDA): string {
  const p = partesEnZona(instante, zona);
  return `${String(p.y).padStart(4, '0')}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/**
 * Los dos instantes que encierran un día de la tienda: `[desde, hasta)`.
 *
 * El servidor corre en UTC. Si se le pasara `2026-08-22` a secas lo leería
 * como medianoche UTC —las 7 de la tarde del 21 en Colombia— y el cuadre del
 * viernes traería las ventas del jueves por la tarde y perdería las del
 * viernes por la noche, que son justo las que discutían: «los vendedores
 * estaban vendiendo y liquidando a las 10 de la noche».
 *
 * El offset se calcula **para ese día**, no fijo en −5: la función no debe
 * asumir que la zona no cambia la hora.
 */
export function rangoUtcDelDia(
  dia: string,
  zona = ZONA_DE_LA_TIENDA,
): { desde: Date; hasta: Date } {
  if (!DIA_ISO.test(dia)) {
    // Reventar es mejor que devolver un rango vacío: un cuadre en cero se lee
    // como "hoy no entró nada", que es la peor forma de equivocarse.
    throw new Error(`Fecha inválida: "${dia}". Se espera YYYY-MM-DD.`);
  }
  const [y, m, d] = dia.split('-').map(Number);

  const medianocheEn = (dias: number): Date => {
    const tentativa = Date.UTC(y, m - 1, d + dias, 0, 0, 0);
    // Dos pasadas: la primera estima el offset con una hora que puede caer del
    // lado equivocado de un cambio de horario; la segunda lo corrige.
    let instante = new Date(
      tentativa - offsetMinutos(new Date(tentativa), zona) * 60_000,
    );
    instante = new Date(tentativa - offsetMinutos(instante, zona) * 60_000);
    return instante;
  };

  return { desde: medianocheEn(0), hasta: medianocheEn(1) };
}
