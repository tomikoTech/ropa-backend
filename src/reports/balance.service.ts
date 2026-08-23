import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  armarBalance,
  type Balance,
  type MovimientoDelBalance,
  type SaldosDelBalance,
} from './balance.js';

export interface RangoDelBalance {
  /** `YYYY-MM-DD`, inclusive. */
  desde: string;
  /** `YYYY-MM-DD`, inclusive. */
  hasta: string;
  /** Un solo local, o todos. */
  warehouseId?: string;
}

/** Los nombres de los locales, para que la pantalla no tenga que pedirlos. */
export interface BalanceConNombres extends Balance {
  desde: string;
  hasta: string;
  nombresDeLocal: Record<string, string>;
}

/**
 * El balance del negocio, todo del mismo periodo y en una sola respuesta.
 *
 * Los datos ya existían repartidos: ventas y utilidad en el motor de reportes,
 * gastos en su módulo, compras en el suyo, y las dos carteras en los suyos.
 * Lo que no existía era **verlos juntos**, que es lo único que permite decidir.
 * Por eso esto es composición y no cálculo nuevo: la aritmética entera está en
 * `balance.ts`, probada aparte.
 *
 * Todo se convierte a **centavos enteros** al salir de la base y se devuelve
 * así: quien pinta decide cómo mostrarlo, pero nadie suma pesos con decimales
 * por el camino.
 */
@Injectable()
export class BalanceService {
  constructor(private readonly dataSource: DataSource) {}

  /** `decimal` de Postgres (texto) a centavos enteros. */
  private centavos(valor: string | number | null | undefined): number {
    return Math.round(Number(valor ?? 0) * 100);
  }

  async calcular(
    tenantId: string,
    rango: RangoDelBalance,
  ): Promise<BalanceConNombres> {
    const local = rango.warehouseId ?? null;
    const [ventas, gastos, compras, abonos, pagos, saldos, nombres] =
      await Promise.all([
        this.ventas(tenantId, rango, local),
        this.gastos(tenantId, rango, local),
        this.compras(tenantId, rango, local),
        this.abonos(tenantId, rango, local),
        this.pagosAProveedores(tenantId, rango, local),
        this.saldos(tenantId, local),
        this.nombresDeLocal(tenantId),
      ]);

    const balance = armarBalance(
      [...ventas, ...gastos, ...compras, ...abonos, ...pagos],
      saldos,
    );
    return {
      ...balance,
      desde: rango.desde,
      hasta: rango.hasta,
      nombresDeLocal: nombres,
    };
  }

  /**
   * Una fila por venta, con lo que costó su mercancía.
   *
   * El costo sale de `sale_items.unit_cost`, que es una **foto del momento de
   * vender**: calcularlo contra el costo actual del producto reescribiría la
   * utilidad de meses cerrados cada vez que llega una compra.
   *
   * `unit_cost = 0` significa «sin costo registrado», no «costo cero» —así lo
   * documenta la propia entidad—, y por eso viaja como `null`: contarlo como
   * cero daría margen del 100% en las ventas importadas de sistemas viejos.
   */
  private async ventas(
    tenantId: string,
    rango: RangoDelBalance,
    local: string | null,
  ): Promise<MovimientoDelBalance[]> {
    const filas = await this.dataSource.query<
      {
        total: string;
        costo: string;
        lineas: string;
        lineas_con_costo: string;
        warehouse_id: string | null;
        status: string;
      }[]
    >(
      `SELECT s.total,
              COALESCE(SUM(i.unit_cost * i.quantity), 0) AS costo,
              COUNT(i.id)                                AS lineas,
              COUNT(i.id) FILTER (WHERE i.unit_cost > 0) AS lineas_con_costo,
              s.warehouse_id,
              s.status::text AS status
         FROM sales s
         LEFT JOIN sale_items i ON i.sale_id = s.id
        WHERE s.tenant_id = $1
          AND s.created_at >= $2::date
          AND s.created_at < ($3::date + INTERVAL '1 day')
          AND ($4::uuid IS NULL OR s.warehouse_id = $4::uuid)
        GROUP BY s.id, s.total, s.warehouse_id, s.status`,
      [tenantId, rango.desde, rango.hasta, local],
    );

    return filas.map((f) => {
      const lineas = Number(f.lineas);
      const conCosto = Number(f.lineas_con_costo);
      // Se exige que **todas** las líneas tengan costo. Con una sola sin él,
      // la utilidad de esa factura sale inflada, y es mejor decir que no se
      // sabe que dar un número que nadie puede cuadrar.
      const sinCosto = lineas === 0 || conCosto < lineas;
      return {
        tipo: 'VENTA' as const,
        centavos: this.centavos(f.total),
        costoCentavos: sinCosto ? null : this.centavos(f.costo),
        localId: f.warehouse_id,
        anulado: f.status === 'CANCELLED',
      };
    });
  }

  private async gastos(
    tenantId: string,
    rango: RangoDelBalance,
    local: string | null,
  ): Promise<MovimientoDelBalance[]> {
    // El gasto sin bodega es real y frecuente —la nómina de administración, el
    // arriendo de la bodega—: entra al total y no se le inventa un local.
    const filas = await this.dataSource.query<
      { amount: string; warehouse_id: string | null }[]
    >(
      `SELECT e.amount, e.warehouse_id
         FROM expenses e
        WHERE e.tenant_id = $1
          AND e.expense_date >= $2::date
          AND e.expense_date <= $3::date
          AND ($4::uuid IS NULL OR e.warehouse_id = $4::uuid)`,
      [tenantId, rango.desde, rango.hasta, local],
    );
    return filas.map((f) => ({
      tipo: 'GASTO' as const,
      centavos: this.centavos(f.amount),
      costoCentavos: null,
      localId: f.warehouse_id,
      anulado: false,
    }));
  }

  /**
   * Lo invertido en mercancía.
   *
   * Solo lo que **llegó** (recibida o parcial): una orden en borrador o
   * enviada todavía no es plata puesta, y contarla haría ver una inversión que
   * aún se puede cancelar.
   */
  private async compras(
    tenantId: string,
    rango: RangoDelBalance,
    local: string | null,
  ): Promise<MovimientoDelBalance[]> {
    const filas = await this.dataSource.query<
      { total: string; warehouse_id: string | null }[]
    >(
      `SELECT po.total, po.warehouse_id
         FROM purchase_orders po
        WHERE po.tenant_id = $1
          AND po.status IN ('RECEIVED', 'PARTIAL')
          AND po.created_at >= $2::date
          AND po.created_at < ($3::date + INTERVAL '1 day')
          AND ($4::uuid IS NULL OR po.warehouse_id = $4::uuid)`,
      [tenantId, rango.desde, rango.hasta, local],
    );
    return filas.map((f) => ({
      tipo: 'COMPRA' as const,
      centavos: this.centavos(f.total),
      costoCentavos: null,
      localId: f.warehouse_id,
      anulado: false,
    }));
  }

  /** Lo cobrado de lo fiado. Entra plata; la venta ya se contó el día que fue. */
  private async abonos(
    tenantId: string,
    rango: RangoDelBalance,
    local: string | null,
  ): Promise<MovimientoDelBalance[]> {
    const filas = await this.dataSource.query<
      { amount: string; warehouse_id: string | null }[]
    >(
      `SELECT p.amount, s.warehouse_id
         FROM accounts_receivable_payments p
         JOIN accounts_receivable ar ON ar.id = p.account_receivable_id
         JOIN sales s ON s.id = ar.sale_id
        WHERE p.tenant_id = $1
          AND p.created_at >= $2::date
          AND p.created_at < ($3::date + INTERVAL '1 day')
          AND ($4::uuid IS NULL OR s.warehouse_id = $4::uuid)`,
      [tenantId, rango.desde, rango.hasta, local],
    );
    return filas.map((f) => ({
      tipo: 'ABONO' as const,
      centavos: this.centavos(f.amount),
      costoCentavos: null,
      localId: f.warehouse_id,
      anulado: false,
    }));
  }

  /** Lo abonado al proveedor. Baja la deuda; el costo ya se contó al vender. */
  private async pagosAProveedores(
    tenantId: string,
    rango: RangoDelBalance,
    local: string | null,
  ): Promise<MovimientoDelBalance[]> {
    const filas = await this.dataSource.query<
      { amount: string; warehouse_id: string | null }[]
    >(
      `SELECT p.amount, po.warehouse_id
         FROM accounts_payable_payments p
         JOIN accounts_payable ap ON ap.id = p.accounts_payable_id
         JOIN purchase_orders po ON po.id = ap.purchase_order_id
        WHERE p.tenant_id = $1
          AND p.created_at >= $2::date
          AND p.created_at < ($3::date + INTERVAL '1 day')
          AND ($4::uuid IS NULL OR po.warehouse_id = $4::uuid)`,
      [tenantId, rango.desde, rango.hasta, local],
    );
    return filas.map((f) => ({
      tipo: 'PAGO_PROVEEDOR' as const,
      centavos: this.centavos(f.amount),
      costoCentavos: null,
      localId: f.warehouse_id,
      anulado: false,
    }));
  }

  /**
   * Lo que la tienda tiene y lo que debe **hoy**.
   *
   * No son del periodo: son saldos. Filtrarlos por fecha daría un capital de
   * hace tres meses al lado de las ventas de este mes, que no significa nada.
   *
   * El inventario se valora al costo del producto. Las referencias con costo
   * en cero valen cero acá, que es lo mismo que hace el reporte de
   * valorización: inventarse un costo sería peor.
   */
  private async saldos(
    tenantId: string,
    local: string | null,
  ): Promise<SaldosDelBalance> {
    const [inventario] = await this.dataSource.query<{ valor: string }[]>(
      `SELECT COALESCE(SUM(st.quantity * p.cost_price), 0) AS valor
         FROM stock st
         JOIN product_variants pv ON pv.id = st.variant_id
         JOIN products p ON p.id = pv.product_id
        WHERE st.tenant_id = $1
          AND st.quantity > 0
          AND ($2::uuid IS NULL OR st.warehouse_id = $2::uuid)`,
      [tenantId, local],
    );

    const [porCobrar] = await this.dataSource.query<{ saldo: string }[]>(
      `SELECT COALESCE(SUM(ar.total_amount - ar.paid_amount), 0) AS saldo
         FROM accounts_receivable ar
         JOIN sales s ON s.id = ar.sale_id
        WHERE ar.tenant_id = $1
          AND ar.is_fully_paid = false
          AND s.status::text <> 'CANCELLED'
          AND ($2::uuid IS NULL OR s.warehouse_id = $2::uuid)`,
      [tenantId, local],
    );

    const [porPagar] = await this.dataSource.query<{ saldo: string }[]>(
      `SELECT COALESCE(SUM(ap.amount - ap.paid_amount), 0) AS saldo
         FROM accounts_payable ap
         JOIN purchase_orders po ON po.id = ap.purchase_order_id
        WHERE ap.tenant_id = $1
          AND ap.is_paid = false
          AND po.status::text <> 'CANCELLED'
          AND ($2::uuid IS NULL OR po.warehouse_id = $2::uuid)`,
      [tenantId, local],
    );

    return {
      inventarioCentavos: this.centavos(inventario?.valor),
      porCobrarCentavos: this.centavos(porCobrar?.saldo),
      porPagarCentavos: this.centavos(porPagar?.saldo),
    };
  }

  private async nombresDeLocal(
    tenantId: string,
  ): Promise<Record<string, string>> {
    const filas = await this.dataSource.query<{ id: string; name: string }[]>(
      `SELECT id, name FROM warehouses WHERE tenant_id = $1`,
      [tenantId],
    );
    return Object.fromEntries(filas.map((f) => [f.id, f.name]));
  }
}
