/**
 * Ponerle usuario y contraseña al equipo de una tienda.
 *
 * Nace de un pedido concreto: «crea bodega, produccion, admin, jefsanchez —
 * cuatro usuarios con contraseña fácil para Distri Amber». Tres de esas
 * cuentas **ya existían** sin nombre de usuario, y crear otras tres iguales
 * habría partido el historial: las ventas, los abonos y el cuadre quedan
 * atados al usuario que los hizo.
 *
 * Por eso esto no es un alta a ciegas: a quien ya está se le pone el usuario
 * (y la clave nueva, si se pide) y solo se crea al que falta.
 *
 * Por defecto **no escribe nada**. Para aplicarlo:
 *
 *     MODE=apply TENANT=distriamber \
 *       CUENTAS="bodega=bodega@distriamber.co,produccion=,admin=admin@distriamber.co" \
 *       node dist/seeds/credenciales-del-equipo.js
 *
 * Cada entrada es `usuario=correo`. Con el correo vacío se crea la cuenta y
 * el correo se arma con el usuario. Las claves salen al azar y se imprimen
 * **una sola vez**; son provisionales y cada quien la cambia en «Mi cuenta».
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../config/data-source.js';
import {
  normalizarUsuario,
  porQueNoSirveElUsuario,
} from '../users/credenciales.js';
import { claveFacilYAleatoria } from './clave-facil.js';

interface Cuenta {
  usuario: string;
  correo: string;
}

function leerCuentas(texto: string): Cuenta[] {
  return texto
    .split(',')
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((parte) => {
      const [u, c = ''] = parte.split('=');
      const usuario = normalizarUsuario(u);
      const motivo = porQueNoSirveElUsuario(usuario);
      if (motivo) throw new Error(`«${u}»: ${motivo}`);
      return { usuario, correo: c.trim() };
    });
}

async function main() {
  const aplicar = process.env.MODE === 'apply';
  const slug = process.env.TENANT?.trim();
  if (!slug) throw new Error('Falta TENANT (el slug de la tienda).');
  const cuentas = leerCuentas(process.env.CUENTAS ?? '');
  if (!cuentas.length) throw new Error('Falta CUENTAS (usuario=correo,...).');

  await AppDataSource.initialize();
  try {
    const q = async <T>(sql: string, p?: unknown[]): Promise<T[]> =>
      AppDataSource.query(sql, p);

    const [tienda] = await q<{ id: string; name: string }>(
      `SELECT id, name FROM tenants WHERE slug = $1`,
      [slug],
    );
    if (!tienda) throw new Error(`No existe la tienda «${slug}».`);
    console.log(`Tienda: ${tienda.name} (${slug})\n`);

    const plan: {
      cuenta: Cuenta;
      existente?: { id: string; email: string; username: string | null };
      clave: string;
    }[] = [];

    for (const cuenta of cuentas) {
      const correo = cuenta.correo || `${cuenta.usuario}@${slug}.co`;
      const [existente] = await q<{
        id: string;
        email: string;
        username: string | null;
      }>(
        `SELECT id, email, username FROM users
          WHERE tenant_id = $1 AND (email = $2 OR username = $3)`,
        [tienda.id, correo, cuenta.usuario],
      );
      // El usuario tiene que ser único en la tienda: si ya lo tiene otra
      // persona, no se pisa —el login no sabría a cuál de las dos—.
      const [choque] = await q<{ email: string }>(
        `SELECT email FROM users WHERE tenant_id = $1 AND username = $2 AND ($3::uuid IS NULL OR id <> $3)`,
        [tienda.id, cuenta.usuario, existente?.id ?? null],
      );
      if (choque) {
        throw new Error(
          `El usuario «${cuenta.usuario}» ya lo tiene ${choque.email}.`,
        );
      }
      plan.push({
        cuenta: { ...cuenta, correo },
        existente,
        clave: claveFacilYAleatoria(),
      });
      console.log(
        existente
          ? `  ${cuenta.usuario.padEnd(12)} → ya existe (${existente.email}): se le pone el usuario y una clave nueva`
          : `  ${cuenta.usuario.padEnd(12)} → se crea (${correo})`,
      );
    }

    if (!aplicar) {
      console.log('\nENSAYO: no se escribió nada. Repite con MODE=apply.');
      return;
    }

    await AppDataSource.transaction(async (m) => {
      for (const { cuenta, existente, clave } of plan) {
        const hash = await bcrypt.hash(clave, 10);
        if (existente) {
          await m.query(
            `UPDATE users SET username = $1, password_hash = $2 WHERE id = $3`,
            [cuenta.usuario, hash, existente.id],
          );
        } else {
          await m.query(
            `INSERT INTO users
               (tenant_id, email, username, password_hash, first_name, last_name,
                role, is_active)
             VALUES ($1, $2, $3, $4, $5, '', 'COLABORADOR', true)`,
            [tienda.id, cuenta.correo, cuenta.usuario, hash, cuenta.usuario],
          );
        }
      }
    });

    console.log('\nListo. Claves provisionales (se imprimen una sola vez):\n');
    for (const { cuenta, clave } of plan) {
      console.log(`  ${cuenta.usuario.padEnd(12)} ${clave}`);
    }
    console.log('\nCada quien la cambia en «Mi cuenta».');
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
