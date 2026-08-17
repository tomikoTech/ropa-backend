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
    const cliente = (
      servicio as unknown as { client: { send: jest.Mock } }
    ).client;
    const enviar = jest
      .spyOn(cliente, 'send')
      .mockResolvedValue(undefined as never);

    await servicio.deleteByUrl(
      'https://proyecto.supabase.co/storage/v1/object/public/mipinta-bucket/products/x.webp',
    );

    expect(enviar).not.toHaveBeenCalled();
  });
});
