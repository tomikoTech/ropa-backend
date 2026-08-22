import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { TenantAwareEntity } from '../../common/entities/tenant-aware.entity.js';

@Entity('store_settings')
@Unique(['storeSlug'])
export class StoreSettings extends TenantAwareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'store_name', default: '' })
  storeName: string;

  @Column({ name: 'store_slug', unique: true })
  storeSlug: string;

  @Column({ name: 'whatsapp_number', default: '' })
  whatsappNumber: string;

  @Column({ name: 'logo_url', nullable: true })
  logoUrl: string;

  @Column({ name: 'hero_logo_url', nullable: true })
  heroLogoUrl: string;

  @Column({ name: 'mini_logo_url', nullable: true })
  miniLogoUrl: string;

  @Column({ name: 'navbar_logo_url', nullable: true })
  navbarLogoUrl: string;

  @Column({ name: 'banner_url', nullable: true })
  bannerUrl: string;

  @Column({ name: 'about_text', type: 'text', nullable: true })
  aboutText: string;

  @Column({ name: 'instagram_url', nullable: true })
  instagramUrl: string;

  @Column({ name: 'facebook_url', nullable: true })
  facebookUrl: string;

  @Column({ name: 'tiktok_url', nullable: true })
  tiktokUrl: string;

  @Column({ nullable: true })
  address: string;

  @Column({ name: 'hero_title', default: '' })
  heroTitle: string;

  @Column({ name: 'hero_subtitle', default: '' })
  heroSubtitle: string;

  @Column({ name: 'accent_color', default: '#2563eb' })
  accentColor: string;

  @Column({ name: 'pos_accent_color', default: '#2563eb' })
  posAccentColor: string;

  @Column({ name: 'is_storefront_active', default: false })
  isStorefrontActive: boolean;

  @Column({ name: 'default_warehouse_id', type: 'uuid', nullable: true })
  defaultWarehouseId: string;

  @Column({ name: 'ecommerce_warehouse_id', type: 'uuid', nullable: true })
  ecommerceWarehouseId: string;

  @Column({ name: 'brevo_api_key', nullable: true })
  brevoApiKey: string;

  @Column({ name: 'brevo_sender_email', nullable: true })
  brevoSenderEmail: string;

  @Column({ name: 'wava_merchant_key', nullable: true })
  wavaMerchantKey: string;

  /**
   * Habilita el inventario por unidades etiquetadas (cajas, curvas, stands).
   * Es un interruptor por tienda: una perfumería vende por unidad suelta y no
   * lo necesita; una importadora de calzado sí. Cada producto decide luego si
   * se acoge (ver `Product.unitTracking`).
   */
  @Column({ name: 'unit_tracking_enabled', default: false })
  unitTrackingEnabled: boolean;

  @Column({ name: 'cod_enabled', default: false })
  codEnabled: boolean;

  @Column({ name: 'cod_require_shipping_upfront', default: false })
  codRequireShippingUpfront: boolean;

  @Column({
    name: 'cod_upfront_percentage',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  codUpfrontPercentage: number;

  @Column({ name: 'cod_surcharge_type', nullable: true })
  codSurchargeType: string;

  @Column({
    name: 'cod_surcharge_value',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  codSurchargeValue: number;

  @Column({
    name: 'shipping_cost_local',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  shippingCostLocal: number;

  @Column({
    name: 'shipping_cost_national',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  shippingCostNational: number;

  @Column({
    name: 'free_shipping_threshold',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  freeShippingThreshold: number;

  @Column({ name: 'store_city_name', nullable: true })
  storeCityName: string;

  @Column({
    name: 'shipping_cost_regional',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  shippingCostRegional: number;

  @Column({ name: 'store_department', nullable: true })
  storeDepartment: string;

  @Column({
    name: 'shipping_extra_item_local',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  shippingExtraItemLocal: number;

  @Column({
    name: 'shipping_extra_item_regional',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  shippingExtraItemRegional: number;

  @Column({
    name: 'shipping_extra_item_national',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  shippingExtraItemNational: number;

  @Column({
    name: 'shipping_cost_remote',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  shippingCostRemote: number;

  @Column({
    name: 'shipping_extra_item_remote',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  shippingExtraItemRemote: number;

  @Column({ name: 'remote_departments', type: 'jsonb', nullable: true })
  remoteDepartments: string[] | null;

  @Column({
    name: 'max_shipping_cost',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  maxShippingCost: number;

  @Column({ name: 'custom_hero_html', type: 'text', nullable: true })
  customHeroHtml: string;

  @Column({ name: 'store_font_family', nullable: true })
  storeFontFamily: string;

  @Column({ name: 'font_apply_hero', type: 'boolean', default: true })
  fontApplyHero: boolean;

  @Column({ name: 'font_apply_products', type: 'boolean', default: false })
  fontApplyProducts: boolean;

  @Column({ name: 'font_apply_navbar', type: 'boolean', default: false })
  fontApplyNavbar: boolean;

  @Column({ name: 'font_sections', type: 'jsonb', nullable: true })
  fontSections: string[] | null;

  @Column({ name: 'nav_items', type: 'jsonb', nullable: true })
  navItems: { label: string; href: string }[] | null;

  @Column({ name: 'store_theme', default: 'dark' })
  storeTheme: string;

  @Column({ name: 'store_bg_color', nullable: true })
  storeBgColor: string;

  @Column({
    name: 'flat_shipping_cost',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 30000,
  })
  flatShippingCost: number;

  @Column({ name: 'custom_domain', nullable: true, unique: true })
  customDomain: string;

  @Column({ name: 'wompi_public_key', nullable: true })
  wompiPublicKey: string;

  @Column({ name: 'wompi_private_key', nullable: true })
  wompiPrivateKey: string;

  @Column({ name: 'wompi_integrity_secret', nullable: true })
  wompiIntegritySecret: string;

  @Column({ name: 'wompi_events_secret', nullable: true })
  wompiEventsSecret: string;

  // ─── Facturación / impuestos (por tenant) ───
  // Cuando está en false, las ventas se registran sin IVA (tasa 0),
  // ignorando el tax_rate por producto. Default true = comportamiento previo.
  @Column({ name: 'iva_enabled', default: true })
  ivaEnabled: boolean;

  // Tasa de IVA de la tienda (%). Tasa única aplicada a ventas y compras con
  // IVA (ignora el tax_rate por producto). Default 19 (Colombia).
  @Column({
    name: 'iva_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 19,
  })
  ivaRate: number;

  // Modo del IVA (ventas y compras):
  //  - 'included': el IVA ya está incluido en el precio/costo (se extrae, el
  //    total no cambia).
  //  - 'added': el IVA se suma sobre el precio/costo (total = base + IVA).
  @Column({
    name: 'iva_mode',
    type: 'varchar',
    length: 20,
    default: 'included',
  })
  ivaMode: 'included' | 'added';

  // Textos configurables de la factura impresa (por tenant)
  @Column({ name: 'invoice_tagline', type: 'text', nullable: true })
  invoiceTagline: string | null;

  @Column({ name: 'invoice_footer_note', type: 'text', nullable: true })
  invoiceFooterNote: string | null;

  // Nota que SIEMPRE se muestra en la factura (p. ej. "vencimiento a 30 días").
  @Column({ name: 'invoice_due_note', type: 'text', nullable: true })
  invoiceDueNote: string | null;

  @Column({ name: 'invoice_thank_you_note', type: 'text', nullable: true })
  invoiceThankYouNote: string | null;

  // Módulos (keys de nav) que puede ver el rol COLABORADOR. null = default.
  @Column({ name: 'collaborator_modules', type: 'jsonb', nullable: true })
  collaboratorModules: string[] | null;

  // Perfumería: gestión automática de frascos vinculados a lociones
  // (crear "Frasco {nombre}" y sincronizar su nombre). Solo este tenant.
  @Column({ name: 'frasco_auto_managed', default: false })
  frascoAutoManaged: boolean;

  // Perfumería: al crear una loción, crear también su esencia vinculada
  // ("Esencia {nombre}") en la categoría Esencias, sin gramos definidos,
  // para que quede disponible al registrar compras.
  @Column({ name: 'essence_auto_managed', default: false })
  essenceAutoManaged: boolean;

  // Módulo de Producción / perfumería (esencias y frascos). Es genérico pero
  // solo algunos tenants lo usan (p.ej. Distri Amber). Controla la pestaña
  // "Producción" y el bloque de perfumería en Productos. Off por defecto.
  @Column({ name: 'production_enabled', default: false })
  productionEnabled: boolean;

  // Cotizaciones: borrador de venta que no afecta inventario hasta convertirse.
  // Genérico; off por defecto.
  @Column({ name: 'quotations_enabled', default: false })
  quotationsEnabled: boolean;

  // Separados / apartados: reservar stock para un cliente (no se vende a otro).
  // Genérico; off por defecto.
  @Column({ name: 'reservations_enabled', default: false })
  reservationsEnabled: boolean;

  // Remisiones: el traslado bodega→bodega requiere confirmación de recepción
  // (queda en tránsito hasta que el destino lo recibe). Off por defecto → el
  // traslado sigue siendo inmediato (comportamiento actual).
  @Column({ name: 'transfer_confirmation_enabled', default: false })
  transferConfirmationEnabled: boolean;

  // Préstamos rápidos entre locales (remisión rápida) con retorno. Off por defecto.
  @Column({ name: 'quick_loan_enabled', default: false })
  quickLoanEnabled: boolean;

  /**
   * ¿El POS da por cobrada la venta al cerrarla?
   *
   * On por defecto: en un mostrador se paga en el momento y dejar a deber es la
   * excepción. Distri Amber trabaja al revés —factura primero y cobra después—,
   * así que ahí el toggle arranca apagado y la venta nace pendiente.
   *
   * Es solo el valor inicial de la casilla: el vendedor la cambia por venta.
   */
  @Column({ name: 'pos_mark_paid_default', default: true })
  posMarkPaidDefault: boolean;

  // Cartera: MANUAL conserva el abono por factura. FIFO permite registrar un
  // abono al saldo total del cliente y lo reparte desde la factura más antigua.
  @Column({
    name: 'ar_payment_allocation_mode',
    type: 'varchar',
    length: 10,
    default: 'MANUAL',
  })
  arPaymentAllocationMode: 'MANUAL' | 'FIFO';

  // Hace visible en las etiquetas el número operativo de caja y, al abrirla,
  // la secuencia del par. El código de barras permanece opaco e inmutable.
  @Column({ name: 'show_box_pair_sequence_on_labels', default: false })
  showBoxPairSequenceOnLabels: boolean;

  // Puntas (leftovers) + comisiones. Criterio automático: una referencia es
  // "punta" si su antigüedad ≥ leftover_age_months Y le quedan ≤ leftover_max_sizes
  // tallas. Se puede sobreescribir manualmente por producto (products.is_leftover).
  @Column({ name: 'leftover_age_months', type: 'int', default: 8 })
  leftoverAgeMonths: number;

  @Column({ name: 'leftover_max_sizes', type: 'int', default: 2 })
  leftoverMaxSizes: number;

  // Comisión al vendedor por vender una punta. Off por defecto.
  @Column({ name: 'leftover_commission_enabled', default: false })
  leftoverCommissionEnabled: boolean;

  // 'fixed' = monto fijo por par; 'percent' = % del valor de la línea.
  @Column({
    name: 'leftover_commission_mode',
    type: 'varchar',
    default: 'fixed',
  })
  leftoverCommissionMode: string;

  @Column({
    name: 'leftover_commission_value',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  leftoverCommissionValue: number;

  // ─── Cuadre y cierre de caja ───

  /**
   * Exigir la foto del comprobante al cobrar por transferencia.
   *
   * «Yo al final del día entro a transferencias, entro a la foto, corroboro
   * que haya entrado esa plata». Apagado por defecto: exigirlo frena el cobro
   * con el cliente enfrente, y eso lo decide cada tienda, no nosotros.
   */
  @Column({ name: 'comprobante_transferencia_obligatorio', default: false })
  comprobanteTransferenciaObligatorio: boolean;

  /**
   * Cerrar el turno del vendedor al terminar el día.
   *
   * «Los vendedores estaban vendiendo y liquidando a las 10 de la noche».
   * Apagado por defecto: deja a alguien sin poder vender, y ninguna tienda
   * debe amanecer con eso encendido sin haberlo pedido.
   */
  @Column({ name: 'cierre_de_caja_enabled', default: false })
  cierreDeCajaEnabled: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
  // ─── Reposición automática ───
  //
  // «Siempre hay que notificar, reponer ese, reponer ese; solo debería ser
  // automático». Apagada por defecto: no todas las tiendas tienen bodega
  // aparte, y encenderla para todas llenaría de solicitudes a quien vende de
  // un solo local.

  @Column({
    name: 'auto_replenish_enabled',
    type: 'boolean',
    default: false,
  })
  autoReplenishEnabled: boolean;

  /** Cuando el local baja a esto o menos, se pide. Uno = «cuando quede el último». */
  @Column({ name: 'auto_replenish_threshold', type: 'int', default: 1 })
  autoReplenishThreshold: number;

  /** Hasta cuánto se repone. */
  @Column({ name: 'auto_replenish_target', type: 'int', default: 3 })
  autoReplenishTarget: number;

  /** De qué bodega sale. Nulo = la que más tenga en ese momento. */
  @Column({
    name: 'auto_replenish_source_warehouse_id',
    type: 'uuid',
    nullable: true,
  })
  autoReplenishSourceWarehouseId: string | null;

  /**
   * Qué productos se reponen solos.
   *
   * Nulo = todos. Una lista vacía **no** es lo mismo: es la tienda diciendo
   * que todavía no eligió ninguno.
   */
  @Column({
    name: 'auto_replenish_product_ids',
    type: 'uuid',
    array: true,
    nullable: true,
  })
  autoReplenishProductIds: string[] | null;

  // ─── Exhibición ───

  /**
   * Avisar cuando falta un par en la vitrina.
   *
   * Apagada por defecto, como el cierre de caja: una tienda sin vitrinas
   * configuradas no debe amanecer con una pantalla de pendientes que no pidió.
   */
  @Column({ name: 'exhibicion_enabled', type: 'boolean', default: false })
  exhibicionEnabled: boolean;

  /**
   * Cuántos pares de cada referencia van en vitrina.
   *
   * Uno: la muestra. Una referencia concreta puede pedir otro número con
   * `products.exhibicion_objetivo`.
   */
  @Column({ name: 'exhibicion_objetivo', type: 'int', default: 1 })
  exhibicionObjetivo: number;
}
