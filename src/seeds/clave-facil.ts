/**
 * Una contraseña que se pueda dictar por teléfono.
 *
 * «Contraseñas fáciles pero aleatorias»: la que entrega el sistema se le pasa
 * a alguien por WhatsApp o se le dicta, y la teclea en un celular. Una cadena
 * como `xK9#mQ2$vL` se escribe mal tres veces y termina en una llamada.
 *
 * Son dos palabras cortas y un número de tres cifras: **no se adivina**
 * —miles de combinaciones por cada palabra— y se dicta sin deletrear. No
 * lleva mayúsculas ni símbolos a propósito; el celular pone mayúscula sola al
 * empezar y eso ya ha dejado a gente por fuera.
 *
 * Y es provisional: nace para que la persona entre y se la cambie en «Mi
 * cuenta», que es lo que debe hacer.
 */
import { randomInt } from 'crypto';

/** Palabras cortas, sin tildes, sin eñes y que no se confunden al dictar. */
const PALABRAS = [
  'sol', 'mar', 'luna', 'rio', 'cielo', 'nube', 'flor', 'arena',
  'tigre', 'lobo', 'gato', 'pez', 'oso', 'aguila', 'delfin', 'zorro',
  'rojo', 'verde', 'azul', 'oro', 'plata', 'coral', 'menta', 'canela',
  'cafe', 'pan', 'miel', 'uva', 'mango', 'limon', 'coco', 'fresa',
];

export function claveFacilYAleatoria(): string {
  const una = PALABRAS[randomInt(PALABRAS.length)];
  let otra = PALABRAS[randomInt(PALABRAS.length)];
  // Dos veces la misma palabra se lee como un error de quien la generó.
  while (otra === una) otra = PALABRAS[randomInt(PALABRAS.length)];
  return `${una}${otra}${randomInt(100, 1000)}`;
}
