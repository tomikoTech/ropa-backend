import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CierreDeCaja } from './entities/cierre-de-caja.entity.js';
import { StoreSettings } from '../storefront/entities/store-settings.entity.js';
import {
  cuadrarDia,
  cuadrarEfectivo,
  descuadresDelDesglose,
  diaLocal,
  rangoUtcDelDia,
  ZONA_DE_LA_TIENDA,
  type Cuadre,
  type MetodoDePago,
  type MovimientoDeCaja,
} from './cuadre.js';
import {
  cierreQueBloquea,
  motivoDelBloqueo,
  puedeCerrarse,
  type CierreDeTurno,
} from './turno.js';

/** Fila cruda de la consulta, antes de pasarla a centavos. */
interface FilaDeCaja {
  id: string;
  origen: 'VENTA' | 'ABONO';
  metodo: MetodoDePago;
  monto: string;
  local_id: string;
  local_nombre: string;
  usuario_id: string;
  usuario_nombre: string;
  banco_id: string | null;
  banco_nombre: string | null;
  comprobante: string | null;
  referencia: string | null;
  documento: string;
  registrado_en: Date;
  anulado: boolean;
}

export interface FiltrosDelCuadre {
  dia?: string;
  warehouseId?: string;
  userId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class CajaService {
  constructor(
    @InjectRepository(CierreDeCaja)
    private readonly cierreRepo: Repository<CierreDeCaja>,
    @InjectRepository(StoreSettings)
    private readonly settingsRepo: Repository<StoreSettings>,
    private readonly dataSource: DataSource,
  ) {}

  /** El día de hoy según la tienda, no según el reloj UTC del servidor. */
  hoy(): string {
    return diaLocal(new Date());
  }

  private async ajustes(tenantId: string): Promise<{
    cierreHabilitado: boolean;
    comprobanteObligatorio: boolean;
  }> {
    const s = await this.settingsRepo.findOne({ where: { tenantId } });
    return {
      cierreHabilitado: s?.cierreDeCajaEnabled ?? false,
      comprobanteObligatorio: s?.comprobanteTransferenciaObligatorio ?? false,
    };
  }

  // ── El cuadre ─────────────────────────────────────────────────────────────

  /**
   * Todo lo que entró en un día, listo para cuadrarlo contra el cajón.
   *
   * Se filtra por **la fecha del pago**, no la de la venta: una factura de
   * ayer que se cobra hoy es plata que entra hoy, y es hoy cuando hay que
   * encontrarla en el cajón o en el banco.
   */
  async cuadre(
    tenantId: string,
    filtros: FiltrosDelCuadre,
  ): Promise<{
    dia: string;
    zona: string;
    cuadre: Cuadre;
    descuadres: ReturnType<typeof descuadresDelDesglose>;
    cierres: CierreDeCaja[];
    cierreHabilitado: boolean;
    comprobanteObligatorio: boolean;
  }> {
    const dia = filtros.dia?.trim() || this.hoy();
    const { desde, hasta } = rangoUtcDelDia(dia);
    const warehouseId =
      filtros.warehouseId && UUID.test(filtros.warehouseId)
        ? filtros.warehouseId
        : undefined;
    const userId =
      filtros.userId && UUID.test(filtros.userId) ? filtros.userId : undefined;

    const filas = await this.filas(tenantId, desde, hasta, warehouseId, userId);
    const cuadre = cuadrarDia(filas.map(aMovimiento));
    const { cierreHabilitado, comprobanteObligatorio } =
      await this.ajustes(tenantId);

    const cierres = await this.cierreRepo.find({
      where: { tenantId, dia },
      order: { cerradoEn: 'DESC' },
    });

    return {
      dia,
      zona: ZONA_DE_LA_TIENDA,
      cuadre,
      descuadres: descuadresDelDesglose(cuadre),
      cierres,
      cierreHabilitado,
      comprobanteObligatorio,
    };
  }

  private async filas(
    tenantId: string,
    desde: Date,
    hasta: Date,
    warehouseId?: string,
    userId?: string,
  ): Promise<FilaDeCaja[]> {
    const params: unknown[] = [tenantId, desde, hasta];
    const filtroLocal = warehouseId
      ? ` AND s.warehouse_id = $${params.push(warehouseId)}`
      : '';
    // El filtro por vendedor se aplica sobre quien **cobró**, que en un abono
    // no tiene por qué ser quien vendió: la deuda la cobra el que está en el
    // mostrador ese día.
    const cobrador = 'COALESCE(ap.user_id, s.user_id)';
    const filtroUsuarioVenta = userId
      ? ` AND s.user_id = $${params.push(userId)}`
      : '';
    const filtroUsuarioAbono = userId
      ? ` AND ${cobrador} = $${params.length}`
      : '';

    const sql = `
      SELECT p.id::text AS id,
             'VENTA'::text AS origen,
             p.method::text AS metodo,
             p.amount::text AS monto,
             s.warehouse_id::text AS local_id,
             w.name AS local_nombre,
             s.user_id::text AS usuario_id,
             TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS usuario_nombre,
             p.bank_id::text AS banco_id,
             b.name AS banco_nombre,
             p.receipt_image_url AS comprobante,
             p.reference AS referencia,
             COALESCE(NULLIF(s.invoice_number, ''), s.sale_number) AS documento,
             p.created_at AS registrado_en,
             (s.status = 'CANCELLED') AS anulado
        FROM payments p
        JOIN sales s ON s.id = p.sale_id
        JOIN warehouses w ON w.id = s.warehouse_id
        JOIN users u ON u.id = s.user_id
        LEFT JOIN banks b ON b.id = p.bank_id
       WHERE p.tenant_id = $1
         AND p.created_at >= $2 AND p.created_at < $3
         ${filtroLocal}${filtroUsuarioVenta}

      UNION ALL

      SELECT ap.id::text,
             'ABONO'::text,
             ap.method::text,
             ap.amount::text,
             s.warehouse_id::text,
             w.name,
             ${cobrador}::text,
             TRIM(CONCAT(u.first_name, ' ', u.last_name)),
             ap.bank_id::text,
             b.name,
             ap.receipt_image_url,
             ap.reference,
             CONCAT('Abono ', COALESCE(NULLIF(s.invoice_number, ''), s.sale_number)),
             ap.created_at,
             (s.status = 'CANCELLED')
        FROM accounts_receivable_payments ap
        JOIN accounts_receivable ar ON ar.id = ap.account_receivable_id
        JOIN sales s ON s.id = ar.sale_id
        JOIN warehouses w ON w.id = s.warehouse_id
        JOIN users u ON u.id = ${cobrador}
        LEFT JOIN banks b ON b.id = ap.bank_id
       WHERE ap.tenant_id = $1
         AND ap.created_at >= $2 AND ap.created_at < $3
         ${filtroLocal}${filtroUsuarioAbono}
    `;

    return this.dataSource.query<FilaDeCaja[]>(sql, params);
  }

  // ── El comprobante obligatorio ────────────────────────────────────────────

  /**
   * Frena un cobro por transferencia sin foto, si la tienda lo pidió.
   *
   * Se valida en el servidor y no solo en la pantalla porque es una regla de
   * plata: la misma lección de los permisos, donde una regla que vivía solo en
   * el JavaScript dejó pasar un abono de $5.000 sobre una venta de $1.000.
   */
  async exigirComprobante(
    tenantId: string,
    pagos: { method: string; receiptImageUrl?: string | null }[],
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(StoreSettings)
      : this.settingsRepo;
    const settings = await repo.findOne({ where: { tenantId } });
    if (!settings?.comprobanteTransferenciaObligatorio) return;

    const sinFoto = pagos.some(
      (p) =>
        p.method === 'TRANSFERENCIA' &&
        !(p.receiptImageUrl && p.receiptImageUrl.trim()),
    );
    if (sinFoto) {
      throw new BadRequestException(
        'Esta tienda exige la foto del comprobante para cobrar por ' +
          'transferencia. Adjúntala antes de guardar.',
      );
    }
  }

  // ── El cierre del turno ───────────────────────────────────────────────────

  /** Los cierres vigentes de un día, en la forma que espera la regla pura. */
  private async cierresDelDia(
    tenantId: string,
    dia: string,
    manager?: EntityManager,
  ): Promise<CierreDeTurno[]> {
    const repo = manager
      ? manager.getRepository(CierreDeCaja)
      : this.cierreRepo;
    const filas = await repo.find({ where: { tenantId, dia } });
    return filas.map((c) => ({
      id: c.id,
      localId: c.warehouseId,
      usuarioId: c.userId,
      dia: c.dia,
      reabiertoEn: c.reabiertoEn,
    }));
  }

  /**
   * Lanza si este vendedor tiene el turno cerrado en este local.
   *
   * Lo llaman vender y prestar. No lo llama nada más a propósito: cerrar el
   * turno es para que no se siga facturando de noche, no para dejar a alguien
   * sin poder consultar su propio historial.
   */
  async exigirTurnoAbierto(
    tenantId: string,
    userId: string,
    warehouseId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(StoreSettings)
      : this.settingsRepo;
    const settings = await repo.findOne({ where: { tenantId } });
    if (!settings?.cierreDeCajaEnabled) return;

    const dia = this.hoy();
    const cierres = await this.cierresDelDia(tenantId, dia, manager);
    const bloquea = cierreQueBloquea(cierres, {
      habilitado: true,
      localId: warehouseId,
      usuarioId: userId,
      dia,
    });
    if (bloquea) throw new ForbiddenException(motivoDelBloqueo(bloquea));
  }

  /** Estado del turno de quien pregunta, para que el POS lo avise antes de vender. */
  async estadoDelTurno(
    tenantId: string,
    userId: string,
    warehouseId?: string,
  ): Promise<{
    habilitado: boolean;
    dia: string;
    cerrado: boolean;
    cierreId: string | null;
  }> {
    const { cierreHabilitado } = await this.ajustes(tenantId);
    const dia = this.hoy();
    if (!cierreHabilitado || !warehouseId) {
      return {
        habilitado: cierreHabilitado,
        dia,
        cerrado: false,
        cierreId: null,
      };
    }
    const bloquea = cierreQueBloquea(await this.cierresDelDia(tenantId, dia), {
      habilitado: true,
      localId: warehouseId,
      usuarioId: userId,
      dia,
    });
    return {
      habilitado: true,
      dia,
      cerrado: !!bloquea,
      cierreId: bloquea?.id ?? null,
    };
  }

  /**
   * Cierra el turno de un vendedor en un local, guardando la foto del cuadre.
   *
   * Los totales se congelan acá: si mañana se anula una venta de hoy, el
   * recálculo cambiaría y ya nadie sabría contra qué se contó el cajón.
   */
  async cerrarTurno(
    tenantId: string,
    quienCierra: string,
    dto: {
      warehouseId: string;
      userId: string;
      dia?: string;
      efectivoContado: number;
      notas?: string;
    },
  ): Promise<CierreDeCaja> {
    const { cierreHabilitado } = await this.ajustes(tenantId);
    const dia = dto.dia?.trim() || this.hoy();
    // Valida la forma de la fecha antes de tocar nada.
    rangoUtcDelDia(dia);

    const permiso = puedeCerrarse(
      await this.cierresDelDia(tenantId, dia),
      {
        habilitado: cierreHabilitado,
        localId: dto.warehouseId,
        usuarioId: dto.userId,
        dia,
      },
      this.hoy(),
    );
    if (!permiso.ok) throw new BadRequestException(permiso.motivo);

    const { cuadre } = await this.cuadre(tenantId, {
      dia,
      warehouseId: dto.warehouseId,
      userId: dto.userId,
    });
    const t = cuadre.totales;
    const efectivo = cuadrarEfectivo(
      t.efectivoCents,
      Math.round(Number(dto.efectivoContado || 0) * 100),
    );

    const cierre = this.cierreRepo.create({
      tenantId,
      warehouseId: dto.warehouseId,
      userId: dto.userId,
      dia,
      efectivoEsperado: efectivo.esperadoCents / 100,
      efectivoContado: efectivo.contadoCents / 100,
      diferencia: efectivo.diferenciaCents / 100,
      totalTransferencia: t.transferenciaCents / 100,
      totalTarjeta: t.tarjetaCents / 100,
      totalOtros: t.otrosCents / 100,
      totalAbonos: t.abonosCents / 100,
      totalGeneral: t.totalCents / 100,
      transferenciasSinComprobante: cuadre.sinComprobante.length,
      notas: dto.notas?.trim() || null,
      cerradoPorId: quienCierra,
      reabiertoEn: null,
      reabiertoPorId: null,
      motivoReapertura: null,
    });
    return this.cierreRepo.save(cierre);
  }

  /**
   * Reabre un turno cerrado.
   *
   * Existe porque un cierre mal hecho deja a alguien sin poder vender, y eso
   * es peor que el problema que el cierre resuelve. No borra nada: marca el
   * cierre, y queda quién lo reabrió y por qué.
   */
  async reabrirTurno(
    tenantId: string,
    id: string,
    quienReabre: string,
    motivo?: string,
  ): Promise<CierreDeCaja> {
    const cierre = await this.cierreRepo.findOne({ where: { id, tenantId } });
    if (!cierre) throw new NotFoundException('Cierre no encontrado');
    if (cierre.reabiertoEn) {
      throw new BadRequestException('Ese turno ya estaba reabierto');
    }
    cierre.reabiertoEn = new Date();
    cierre.reabiertoPorId = quienReabre;
    cierre.motivoReapertura = motivo?.trim() || null;
    return this.cierreRepo.save(cierre);
  }
}

/** Fila cruda → movimiento en centavos enteros. */
function aMovimiento(f: FilaDeCaja): MovimientoDeCaja {
  return {
    id: f.id,
    origen: f.origen,
    metodo: f.metodo,
    // De `decimal` (texto) a centavos con redondeo: sumar los floats de
    // Postgres deja totales de 79.999,999999998.
    centavos: Math.round(Number(f.monto) * 100),
    localId: f.local_id,
    localNombre: f.local_nombre,
    usuarioId: f.usuario_id,
    usuarioNombre: f.usuario_nombre || 'Sin nombre',
    bancoId: f.banco_id,
    bancoNombre: f.banco_nombre,
    comprobanteUrl: f.comprobante,
    referencia: f.referencia,
    documento: f.documento,
    registradoEn: new Date(f.registrado_en),
    anulado: f.anulado,
  };
}
