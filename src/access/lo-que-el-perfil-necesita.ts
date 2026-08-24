/**
 * Qué interruptores de la tienda hace falta encender para que un perfil sirva.
 *
 * El dueño crea un «Vendedor externo», el vendedor arma su pedido, le da a
 * enviar y le sale *«El módulo de Cotizaciones no está habilitado para esta
 * tienda»*. No tiene por qué saber que el interruptor que le falta se llama
 * Cotizaciones: él creó un perfil de ventas, no un módulo de cotizaciones.
 *
 * Así que crear el perfil enciende lo que ese perfil necesita —y lo dice, que
 * es la diferencia entre ayudar y hacer magia a espaldas de quien administra—.
 */
import { MODULO_PANTALLA_SIMPLE } from './pantalla-de-ventas.js';

interface Permiso {
  module: string;
  list: boolean;
  create: boolean;
}

export function necesitaCotizaciones(permisos: Permiso[]): boolean {
  const de = (module: string) => permisos.find((p) => p.module === module);
  // Usa la pantalla simplificada y no puede cerrar la venta: todo lo que venda
  // pasa por una solicitud.
  return !!de(MODULO_PANTALLA_SIMPLE)?.list && !de('sales')?.create;
}
