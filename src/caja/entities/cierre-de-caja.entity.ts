import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

/**
 * El turno de un vendedor en un local, ya cerrado.
 *
 * Guarda **una foto del cuadre en el momento de cerrar**, no solo la marca de
 * cerrado. Los totales se pueden recalcular después, pero si mañana se anula
 * una venta de ayer el recálculo cambia y ya nadie sabe contra qué se contó el
 * cajón. La foto es lo que firmó quien cerró.
 */
@Entity('cierres_de_caja')
@Index(['tenantId', 'dia'])
export class CierreDeCaja extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId: string;

  /** De quién es el turno que se cerró. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /**
   * El día de la tienda (`YYYY-MM-DD`), como texto.
   *
   * No es un instante: es la jornada. Guardarlo como fecha o timestamp lo
   * expone a que una conversión de zona lo corra un día —justo el error que
   * este módulo existe para evitar—; como texto, el día que se cerró es el día
   * que dice, lo lea quien lo lea.
   */
  @Column({ name: 'dia', type: 'varchar', length: 10 })
  dia: string;

  // ── La foto del cuadre al cerrar ──
  @Column({
    name: 'efectivo_esperado',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  efectivoEsperado: number;

  /** Lo que se contó en el cajón. */
  @Column({
    name: 'efectivo_contado',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  efectivoContado: number;

  /** Contado menos esperado. Negativo es faltante. */
  @Column({
    name: 'diferencia',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  diferencia: number;

  @Column({
    name: 'total_transferencia',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  totalTransferencia: number;

  @Column({
    name: 'total_tarjeta',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  totalTarjeta: number;

  @Column({
    name: 'total_otros',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  totalOtros: number;

  @Column({
    name: 'total_abonos',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  totalAbonos: number;

  @Column({
    name: 'total_general',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  totalGeneral: number;

  /** Transferencias que quedaron sin foto al cerrar. Cero es lo que se busca. */
  @Column({ name: 'transferencias_sin_comprobante', type: 'int', default: 0 })
  transferenciasSinComprobante: number;

  @Column({ type: 'varchar', nullable: true })
  notas: string | null;

  // ── Quién y cuándo ──
  /** Quien apretó el botón: puede ser el administrador, no el vendedor. */
  @Column({ name: 'cerrado_por_id', type: 'uuid' })
  cerradoPorId: string;

  @CreateDateColumn({ name: 'cerrado_en', type: 'timestamptz' })
  cerradoEn: Date;

  /**
   * La válvula de escape.
   *
   * Un cierre mal hecho deja a alguien sin poder vender, que es peor que el
   * problema que el cierre resuelve. Reabrir no borra el cierre: lo marca, y
   * queda quién lo reabrió y por qué.
   */
  @Column({ name: 'reabierto_en', type: 'timestamptz', nullable: true })
  reabiertoEn: Date | null;

  @Column({ name: 'reabierto_por_id', type: 'uuid', nullable: true })
  reabiertoPorId: string | null;

  @Column({ name: 'motivo_reapertura', type: 'varchar', nullable: true })
  motivoReapertura: string | null;
}
