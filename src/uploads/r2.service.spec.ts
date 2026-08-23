import sharp from 'sharp';
import { R2Service } from './r2.service.js';

/**
 * La subida por base64 la usa el agente de WhatsApp, que manda las fotos
 * dentro del JSON. Antes iba a Supabase Storage con su propia lista de tipos
 * permitidos; al pasarla a R2 lo que importa es que siga aceptando lo mismo,
 * que decodifique igual, y que devuelva una URL del dominio de R2.
 */
describe('R2Service.uploadBase64Image', () => {
  const ENV = process.env;
  let servicio: R2Service;
  let subido: { folder: string; buffer: Buffer; mime: string; ext: string };

  beforeEach(() => {
    process.env = {
      ...ENV,
      R2_ENDPOINT: 'https://cuenta.r2.cloudflarestorage.com',
      R2_ACCESS_KEY_ID: 'llave',
      R2_SECRET_ACCESS_KEY: 'secreto',
      R2_BUCKET: 'mipinta',
      R2_PUBLIC_URL: 'https://pub-abc.r2.dev',
    };
    servicio = new R2Service();
    // Se intercepta la subida: acá interesa la decodificación y el ruteo, no
    // hablar con Cloudflare.
    jest
      .spyOn(servicio, 'upload')
      .mockImplementation(async (folder, buffer, mime, ext) => {
        subido = { folder, buffer, mime, ext };
        return `https://pub-abc.r2.dev/${folder}/archivo.${ext}`;
      });
  });

  afterEach(() => {
    process.env = ENV;
    jest.restoreAllMocks();
  });

  it('decodifica base64 puro y lo manda a la carpeta products', async () => {
    const contenido = 'una foto de verdad';
    const url = await servicio.uploadBase64Image(
      Buffer.from(contenido).toString('base64'),
      'image/png',
    );

    expect(subido.folder).toBe('products');
    expect(subido.ext).toBe('png');
    expect(subido.buffer.toString()).toBe(contenido);
    expect(url).toContain('r2.dev');
    expect(url).not.toContain('supabase');
  });

  it('acepta también data URLs, que es como las manda el bot', async () => {
    const contenido = 'foto con encabezado';
    await servicio.uploadBase64Image(
      `data:image/webp;base64,${Buffer.from(contenido).toString('base64')}`,
      'image/webp',
    );

    expect(subido.buffer.toString()).toBe(contenido);
    expect(subido.ext).toBe('webp');
  });

  it('respeta la carpeta que le pidan', async () => {
    await servicio.uploadBase64Image(
      Buffer.from('logo').toString('base64'),
      'image/jpeg',
      'logos',
    );

    expect(subido.folder).toBe('logos');
    expect(subido.ext).toBe('jpg');
  });

  it('rechaza un tipo que no esté en la lista permitida', async () => {
    await expect(
      servicio.uploadBase64Image(
        Buffer.from('<svg/>').toString('base64'),
        'image/svg+xml',
      ),
    ).rejects.toThrow(/no permitido/i);
  });

  it('rechaza una imagen vacía en vez de subir un archivo de 0 bytes', async () => {
    await expect(servicio.uploadBase64Image('', 'image/png')).rejects.toThrow(
      /vacía/i,
    );
  });

  it('deleteByUrl ignora las URLs que no son del bucket propio', async () => {
    // Quedan URLs viejas de Supabase en pantallas ya cargadas; borrar una no
    // puede terminar en una llamada a Cloudflare con una llave inventada.
    const cliente = (servicio as unknown as { client: { send: jest.Mock } })
      .client;
    const enviar = jest
      .spyOn(cliente, 'send')
      .mockResolvedValue(undefined as never);

    await servicio.deleteByUrl(
      'https://proyecto.supabase.co/storage/v1/object/public/mipinta-bucket/products/x.webp',
    );

    expect(enviar).not.toHaveBeenCalled();
  });
});

/**
 * Y lo que se guarda ya viene optimizado.
 *
 * La optimización vive en `upload`, que es por donde pasan los dos caminos —el
 * formulario del admin y el base64 del bot de WhatsApp—. Acá se comprueba que
 * la cadena esté conectada: sin esto, las dos podrían estar bien por separado
 * y las fotos seguir subiéndose enteras.
 */
describe('R2Service.upload · lo que llega al bucket', () => {
  const ENV = process.env;
  let servicio: R2Service;
  let guardado: { Body: Buffer; ContentType: string; Key: string };

  beforeEach(() => {
    process.env = {
      ...ENV,
      R2_ENDPOINT: 'https://cuenta.r2.cloudflarestorage.com',
      R2_ACCESS_KEY_ID: 'llave',
      R2_SECRET_ACCESS_KEY: 'secreto',
      R2_BUCKET: 'mipinta',
      R2_PUBLIC_URL: 'https://pub-abc.r2.dev',
    };
    servicio = new R2Service();
    // Se intercepta el envío a Cloudflare: interesa qué se manda, no mandarlo.
    const cliente = (servicio as unknown as { client: { send: unknown } })
      .client;
    jest
      .spyOn(cliente as { send: (c: unknown) => Promise<unknown> }, 'send')
      .mockImplementation((comando: unknown) => {
        guardado = (comando as { input: typeof guardado }).input;
        return Promise.resolve({});
      });
  });

  afterEach(() => {
    process.env = ENV;
    jest.restoreAllMocks();
  });

  it('una foto grande llega al bucket reducida y como webp', async () => {
    const px = Buffer.alloc(2400 * 1600 * 3);
    for (let i = 0; i < px.length; i++) px[i] = (i * 7919) % 256;
    const grande = await sharp(px, {
      raw: { width: 2400, height: 1600, channels: 3 },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    const url = await servicio.upload('products', grande, 'image/jpeg', 'jpg');

    expect(guardado.ContentType).toBe('image/webp');
    expect(guardado.Key).toMatch(/\.webp$/);
    expect(url).toMatch(/\.webp$/);
    expect(guardado.Body.length).toBeLessThan(grande.length);
    const meta = await sharp(guardado.Body).metadata();
    expect(meta.width).toBe(1400);
  }, 30000);

  it('un video llega tal cual, con su tipo y su extensión', async () => {
    const video = Buffer.from('no soy una imagen');
    const url = await servicio.upload('products', video, 'video/mp4', 'mp4');
    expect(guardado.ContentType).toBe('video/mp4');
    expect(guardado.Body).toBe(video);
    expect(url).toMatch(/\.mp4$/);
  });
});
