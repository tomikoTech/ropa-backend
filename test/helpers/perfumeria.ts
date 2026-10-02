import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

/**
 * Una **segunda tienda de prueba, perfumería**, con su administrador.
 *
 * Tu Chapato es de calzado y así tiene que seguir: lo que se prueba del
 * perfil de perfumería —solo producto terminado al vender, unidades y no
 * pares, sin tallas— necesita una tienda que diga que lo es, y comprobar al
 * lado que la zapatería no cambió.
 *
 * Se crea por SQL (tenant + usuario) y se termina por la API (el ajuste del
 * perfil), que es el mismo camino que recorre el dueño en Configuración.
 */
export async function crearTiendaDePerfumeria(
  app: INestApplication,
  ts = Date.now(),
): Promise<{ tenantId: string; token: string; correo: string }> {
  const ds = app.get(DataSource);
  const [tenant]: { id: string }[] = await ds.query(
    `INSERT INTO tenants (name, slug, is_active) VALUES ($1, $2, true) RETURNING id`,
    [`E2E Perfumería ${ts}`, `e2e-perfumeria-${ts}`],
  );
  const correo = `admin-perfumeria-${ts}@e2e.co`;
  const clave = 'perfumeria-e2e';
  await ds.query(
    `INSERT INTO users (tenant_id, email, username, password_hash, first_name, last_name, role, is_active)
     VALUES ($1, $2, $3, $4, 'Andrea', 'E2E', 'ADMIN', true)`,
    [
      tenant.id,
      correo,
      `perfumeria${ts.toString().slice(-6)}`,
      await bcrypt.hash(clave, 10),
    ],
  );
  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: correo, password: clave })
    .expect(201);
  const token = login.body.accessToken as string;
  await request(app.getHttpServer())
    .patch('/api/store-settings')
    .set({ Authorization: `Bearer ${token}` })
    .send({
      tipoDeNegocio: 'perfumeria',
      frascoAutoManaged: false,
      essenceAutoManaged: false,
    })
    .expect(200);
  return { tenantId: tenant.id, token, correo };
}
