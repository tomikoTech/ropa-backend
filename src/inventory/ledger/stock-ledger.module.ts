import { Module } from '@nestjs/common';
import { StockLedgerService } from './stock-ledger.service.js';
import { StockIntegrityService } from './stock-integrity.service.js';

/**
 * El ledger, suelto de todo lo demás.
 *
 * Vive en su propio módulo y no en `InventoryModule` porque quien mueve
 * inventario es medio sistema —POS, compras, devoluciones, calle, tienda
 * online— y ninguno de esos debería tener que arrastrar el módulo de
 * inventario entero (con sus controladores, sus conteos y su dependencia de
 * productos) solo para descontar una venta. Además así no hay forma de armar
 * un ciclo de importaciones cuando le toque el turno a los módulos que
 * `InventoryModule` ya usa.
 *
 * No declara entidades: el ledger trabaja siempre sobre el `EntityManager` de
 * la transacción de quien lo llama.
 */
@Module({
  providers: [StockIntegrityService, StockLedgerService],
  exports: [StockIntegrityService, StockLedgerService],
})
export class StockLedgerModule {}
