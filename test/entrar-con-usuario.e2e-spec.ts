import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { setupTestApp, loginAsAdmin, teardownTestApp } from './helpers/setup';

/**
 * **Entrar con usuario, y poder cambiarlo uno mismo.**
 *
 * «Permitamos el login con usernames, no con email… pues con ambos, pero
 * principalmente usernames, y que se puedan cambiar en la configuración sin
 * problema (el username y la contraseña)».
 *
 * En el mostrador nadie teclea `vendedor-amawad@gmail.com` veinte veces al
 * día, y varias de las personas que venden no tienen correo propio. Lo que se
 * fija acá: que se entre con cualquiera de los dos, que cada quien cambie lo
 * suyo sin ser administrador, y que los candados sigan puestos —la contraseña
 * de ahora, el usuario ocupado, la sesión ajena—.
 */
describe('Entrar con usuario (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  const ts = Date.now();
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });
  const correo = `e2eusuario${ts}@mipinta.co`;
  const usuario = `cajera${ts.toString().slice(-6)}`;
  const clave = 'clave-inicial-1';
  let userId: string;
  /** El token de la cajera, no el del admin. */
  let suToken: string;

  const entrar = (identificador: string, password: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: identificador, password });

  beforeAll(async () => {
    app = await setupTestApp();
    adminToken = await loginAsAdmin(app);
    const r = await request(app.getHttpServer())
      .post('/api/users')
      .set(auth())
      .send({
        email: correo,
        username: usuario,
        password: clave,
        firstName: 'E2E',
        lastName: 'Cajera',
        role: 'COLABORADOR',
      })
      .expect(201);
    userId = r.body.id;
  }, 180000);

  afterAll(async () => {
    await teardownTestApp();
  });

  it('se entra con el usuario, sin escribir el correo', async () => {
    const r = await entrar(usuario, clave).expect(201);
    expect(r.body.accessToken).toBeTruthy();
    suToken = r.body.accessToken;
  }, 60000);

  it('y con el correo también: son las dos puertas', async () => {
    await entrar(correo, clave).expect(201);
  }, 60000);

  it('cada quien cambia su propio usuario, sin ser administrador', async () => {
    const nuevo = `CAJA Mayor ${ts.toString().slice(-4)}`;
    const r = await request(app.getHttpServer())
      .patch('/api/auth/profile')
      .set({ Authorization: `Bearer ${suToken}` })
      .send({ username: nuevo })
      .expect(200);
    // Se guarda en minúsculas y sin espacios: quien lo teclea en el celular
    // con mayúscula automática tiene que poder entrar igual.
    expect(r.body.username).toBe(`cajamayor${ts.toString().slice(-4)}`);
    await entrar(r.body.username, clave).expect(201);
  }, 60000);

  it('un usuario ya tomado en la tienda se rechaza con su nombre', async () => {
    // Dos personas con el mismo usuario no podrían entrar: el login no
    // sabría a cuál de las dos.
    const ocupado = `ocupado${ts.toString().slice(-6)}`;
    await request(app.getHttpServer())
      .post('/api/users')
      .set(auth())
      .send({
        email: `e2eocupado${ts}@mipinta.co`,
        username: ocupado,
        password: clave,
        firstName: 'E2E',
        lastName: 'Ocupado',
        role: 'COLABORADOR',
      })
      .expect(201);

    const r = await request(app.getHttpServer())
      .patch('/api/auth/profile')
      .set({ Authorization: `Bearer ${suToken}` })
      .send({ username: ocupado })
      .expect(409);
    expect(String(r.body.message)).toMatch(/ya está tomado/i);
  }, 60000);

  it('el usuario con arroba se rechaza: eso es un correo', async () => {
    const r = await request(app.getHttpServer())
      .patch('/api/auth/profile')
      .set({ Authorization: `Bearer ${suToken}` })
      .send({ username: 'cajera@tienda.com' })
      .expect(400);
    expect(String(r.body.message)).toMatch(/arroba/i);
  }, 60000);

  it('para cambiar la contraseña hay que saber la de ahora', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set({ Authorization: `Bearer ${suToken}` })
      .send({ actual: 'la-que-no-es', nueva: 'clave-nueva-1' })
      .expect(400);
    expect(String(r.body.message)).toMatch(/contraseña de ahora/i);
  }, 60000);

  it('se cambia la contraseña y se entra con la nueva', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set({ Authorization: `Bearer ${suToken}` })
      .send({ actual: clave, nueva: 'clave-nueva-1' })
      .expect(201);
    // Devuelve sesión nueva: cambiar la contraseña no puede dejar a la
    // persona por fuera de la pantalla en la que está.
    expect(r.body.accessToken).toBeTruthy();

    await entrar(`cajamayor${ts.toString().slice(-4)}`, 'clave-nueva-1').expect(
      201,
    );
    // Y la vieja deja de servir, que es para lo que se cambia.
    await entrar(`cajamayor${ts.toString().slice(-4)}`, clave).expect(401);
  }, 60000);

  it('dos tiendas pueden tener su propia «bodega», y cada quien entra en la suya', async () => {
    // Pasó de verdad el 2026-10-02: AMAWAD ya tenía un usuario «bodega» y,
    // al ponerle ese mismo nombre a la bodega de Distri Amber, esta dejó de
    // poder entrar **con su contraseña correcta**. El login buscaba el
    // nombre de usuario sin mirar de qué tienda era y comparaba contra la
    // cuenta de la otra.
    const ds = app.get(DataSource);
    const compartido = `bodega${ts.toString().slice(-6)}`;
    const [otra]: { id: string }[] = await ds.query(
      `INSERT INTO tenants (name, slug, is_active) VALUES ($1, $2, true) RETURNING id`,
      [`E2E Otra Tienda ${ts}`, `e2e-otra-${ts}`],
    );
    const hash = await bcrypt.hash('clave-de-la-otra', 10);
    await ds.query(
      `INSERT INTO users (tenant_id, email, username, password_hash, first_name, last_name, role, is_active)
       VALUES ($1, $2, $3, $4, 'Otra', 'Bodega', 'COLABORADOR', true)`,
      [otra.id, `bodega-otra-${ts}@e2e.co`, compartido, hash],
    );

    // La misma palabra, en la tienda de la prueba.
    await request(app.getHttpServer())
      .patch(`/api/users/${userId}`)
      .set(auth())
      .send({ username: compartido })
      .expect(200);

    // Cada contraseña abre **su** cuenta, y ninguna abre la ajena.
    const mia = await entrar(compartido, 'clave-nueva-1').expect(201);
    expect(mia.body.user.email).toBe(correo);
    const suya = await entrar(compartido, 'clave-de-la-otra').expect(201);
    expect(suya.body.user.email).toBe(`bodega-otra-${ts}@e2e.co`);
    await entrar(compartido, 'ninguna-de-las-dos').expect(401);
  }, 60000);

  it('el administrador también puede ponerle usuario a alguien', async () => {
    const puesto = `bodega${ts.toString().slice(-5)}`;
    await request(app.getHttpServer())
      .patch(`/api/users/${userId}`)
      .set(auth())
      .send({ username: puesto })
      .expect(200);
    await entrar(puesto, 'clave-nueva-1').expect(201);
  }, 60000);
  it('se puede crear a alguien solo con nombre de usuario, sin correo, y entra', async () => {
    // «Usuarios solo con nombre»: quien vende no siempre tiene correo. El
    // servidor le pone uno técnico que nadie ve, y entra con su usuario.
    const usuario = `soloconnombre${ts.toString().slice(-6)}`;
    const creado = await request(app.getHttpServer())
      .post('/api/users')
      .set(auth())
      .send({
        username: usuario,
        password: 'clave-sin-correo',
        firstName: 'Solo',
        lastName: 'Nombre',
        role: 'COLABORADOR',
      })
      .expect(201);
    expect(creado.body.email).toContain('@sin-correo.');
    await entrar(usuario, 'clave-sin-correo').expect(201);
    // Sin usuario ni correo no hay con qué entrar: se rechaza.
    await request(app.getHttpServer())
      .post('/api/users')
      .set(auth())
      .send({
        password: 'clave-sin-correo',
        firstName: 'Nadie',
        lastName: 'Nada',
        role: 'COLABORADOR',
      })
      .expect(400);
  }, 60000);
});
