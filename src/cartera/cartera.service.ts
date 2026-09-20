import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { rangoUtcDelDia, diaLocal } from '../caja/cuadre.js';
import {
  aCentavos,
  historialDeAbonos,
  type AbonoCrudo,
  type Historial,
} from './historial-de-abonos.js';

/** Fila cruda de la consulta, antes de pasarla a centavos. */
interface FilaDeAbono {
  id: string;
  fecha: Date;
  monto: string;
  metodo: string;
  tercero_id: string | null;
  tercero: string;
  documento: string | null;
  cuenta_id: string | null;
  referencia: string | null;
  banco: string | null;
  quien: string | null;
  nota: string | null;
  reversa_de: string | null;
  lote_id: string | null;
  comprobante: string | null;
}

export interface FiltroDelHistorial {
  /** Cliente o proveedor. */
  terceroId?: string;
  /** Una factura en concreto: sus abonos, todos, sin importar el periodo. */
  cuentaId?: string;
  /** Días de la tienda, `YYYY-MM-DD`. */
  desde?: string;
  hasta?: string;
  limite?: number;
}

export interface RespuestaDelHistorial extends Historial {
  desde: string;
  hasta: string;
  /**
   * Se llegó al tope de renglones: hay más abonos en el periodo de los que
   * cupieron. Se dice, no se esconde: un total a medias es peor que ninguno.
   */
  truncado: boolean;
}

/** Cuántos renglones se traen como máximo antes de pedir achicar el periodo. */
const TOPE = 1000;
/** Cuántos días atrás se mira si no piden otra cosa. */
const DIAS_POR_DEFECTO = 30;
/** Para los abonos de una factura: desde antes de que existiera la tienda. */
const DESDE_SIEMPRE = '2000-01-01';

/**
 * El historial de abonos de las dos carteras.
 *
 * El saldo ya se veía; **cómo se llegó a ese saldo, no**. Para saber cuándo y
 * cuánto abonó alguien había que abrir factura por factura. Acá se lee de
 * corrido: por día, con el método, quién lo recibió y a qué factura entró.
 *
 * El periodo entero se trae de una y se resume en memoria (con
 * `historial-de-abonos.ts`) en vez de paginar: son pocos renglones —una
 * cartera no tiene miles de abonos al mes— y así el total que se muestra es
 * exactamente el del filtro, sin una segunda consulta que pueda contar
 * distinto que la primera.
 */
@Injectable()
export class CarteraService {
  constructor(private readonly dataSource: DataSource) {}

  /** Lo que nos abonaron los clientes. */
  abonosDeClientes(tenantId: string, filtro: FiltroDelHistorial = {}) {
    return this.historial(
      tenantId,
      filtro,
      `SELECT p.id::text                    AS id,
              p.created_at                  AS fecha,
              p.amount::text                AS monto,
              p.method::text                AS metodo,
              ar.client_id::text            AS tercero_id,
              COALESCE(NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), ''),
                       'Sin cliente')       AS tercero,
              COALESCE(NULLIF(s.invoice_number, ''), s.sale_number) AS documento,
              p.account_receivable_id::text AS cuenta_id,
              p.reference                   AS referencia,
              b.name                        AS banco,
              NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS quien,
              p.notes                       AS nota,
              p.reverses_payment_id::text   AS reversa_de,
              p.allocation_batch_id::text   AS lote_id,
              p.receipt_image_url           AS comprobante
         FROM accounts_receivable_payments p
         JOIN accounts_receivable ar ON ar.id = p.account_receivable_id
         JOIN sales s ON s.id = ar.sale_id
         LEFT JOIN clients c ON c.id = ar.client_id
         -- Quién cobró: el que recibió el abono, y en las filas viejas —de
         -- antes de que existiera la columna— el vendedor de la factura.
         LEFT JOIN users u ON u.id = COALESCE(p.user_id, s.user_id)
         LEFT JOIN banks b ON b.id = p.bank_id`,
      'ar.client_id',
      'p.account_receivable_id',
    );
  }

  /** Lo que le hemos pagado a los proveedores. */
  pagosAProveedores(tenantId: string, filtro: FiltroDelHistorial = {}) {
    return this.historial(
      tenantId,
      filtro,
      `SELECT p.id::text                    AS id,
              p.created_at                  AS fecha,
              p.amount::text                AS monto,
              p.method::text                AS metodo,
              po.supplier_id::text          AS tercero_id,
              COALESCE(sup.name, 'Sin proveedor') AS tercero,
              COALESCE(NULLIF(po.supplier_invoice_number, ''), po.order_number) AS documento,
              p.accounts_payable_id::text   AS cuenta_id,
              p.reference                   AS referencia,
              b.name                        AS banco,
              NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS quien,
              p.notes                       AS nota,
              -- Un pago a proveedor no se deshace con contra-pago: la columna
              -- no existe de ese lado. Va en null para que el renglón tenga la
              -- misma forma en las dos carteras.
              NULL::text                    AS reversa_de,
              p.allocation_batch_id::text   AS lote_id,
              p.receipt_image_url           AS comprobante
         FROM accounts_payable_payments p
         JOIN accounts_payable ap ON ap.id = p.accounts_payable_id
         JOIN purchase_orders po ON po.id = ap.purchase_order_id
         LEFT JOIN suppliers sup ON sup.id = po.supplier_id
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN banks b ON b.id = p.bank_id`,
      'po.supplier_id',
      'p.accounts_payable_id',
    );
  }

  private async historial(
    tenantId: string,
    filtro: FiltroDelHistorial,
    select: string,
    columnaDelTercero: string,
    columnaDeLaCuenta: string,
  ): Promise<RespuestaDelHistorial> {
    // Los abonos de **una factura** son todos los que tenga, y el periodo no
    // los recorta: la pregunta ahí es «¿cómo se ha ido pagando esta cuenta?»,
    // y un abono viejo es justo lo que se busca. El periodo es de la pantalla
    // de «lo que entró», no de la de una cuenta.
    const hoy = diaLocal(new Date());
    const hasta = filtro.cuentaId ? hoy : filtro.hasta?.trim() || hoy;
    const desde = filtro.cuentaId
      ? DESDE_SIEMPRE
      : filtro.desde?.trim() || haceDias(hasta, DIAS_POR_DEFECTO);
    // El servidor corre en UTC: sin esto, «hasta el 12» dejaría por fuera los
    // abonos del 12 después de las 7 de la tarde.
    const { desde: inicio } = rangoUtcDelDia(desde);
    const { hasta: fin } = rangoUtcDelDia(hasta);

    const params: unknown[] = [tenantId, inicio, fin];
    let where = `WHERE p.tenant_id = $1 AND p.created_at >= $2 AND p.created_at < $3`;
    if (filtro.terceroId) {
      params.push(filtro.terceroId);
      where += ` AND ${columnaDelTercero} = $${params.length}`;
    }
    if (filtro.cuentaId) {
      params.push(filtro.cuentaId);
      where += ` AND ${columnaDeLaCuenta} = $${params.length}`;
    }
    const limite = Math.min(Math.max(Number(filtro.limite) || TOPE, 1), TOPE);

    const filas = await this.dataSource.query<FilaDeAbono[]>(
      `${select} ${where} ORDER BY p.created_at DESC LIMIT ${limite + 1}`,
      params,
    );
    const truncado = filas.length > limite;

    return {
      ...historialDeAbonos(filas.slice(0, limite).map(aAbono)),
      desde,
      hasta,
      truncado,
    };
  }
}

function aAbono(f: FilaDeAbono): AbonoCrudo {
  return {
    id: f.id,
    fecha: new Date(f.fecha),
    centavos: aCentavos(f.monto),
    metodo: f.metodo,
    terceroId: f.tercero_id,
    terceroNombre: f.tercero,
    documento: f.documento,
    cuentaId: f.cuenta_id,
    referencia: f.referencia,
    bancoNombre: f.banco,
    quien: f.quien,
    nota: f.nota,
    reversaDe: f.reversa_de,
    loteId: f.lote_id,
    comprobanteUrl: f.comprobante,
  };
}

/** El día que cae N días antes de otro, sin que la zona lo corra. */
function haceDias(dia: string, dias: number): string {
  const [y, m, d] = dia.split('-').map(Number);
  const antes = new Date(Date.UTC(y, m - 1, d - dias));
  return antes.toISOString().slice(0, 10);
}
