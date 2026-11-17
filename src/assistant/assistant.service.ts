import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AccessService } from '../access/access.service.js';
import { diaLocal } from '../caja/cuadre.js';
import { Role } from '../common/enums/role.enum.js';
import {
  ReportEngineService,
  type ReportOptions,
} from '../reports/report-engine.service.js';
import {
  armarTabla,
  buscarHerramienta,
  esquemaDeHerramienta,
  HERRAMIENTAS,
  refinar,
  resumenParaElModelo,
  tieneParametro,
  traducirArgumentos,
  type Argumentos,
  type TablaDelAsistente,
} from './herramientas.js';
import { construirPayloadMensajes, MensajeChat } from './mensajes.js';
import {
  ModeloDeLenguaje,
  type LlamadaAHerramienta,
  type MensajeDelModelo,
} from './modelo-de-lenguaje.js';
import { promptDelAsistente } from './pintoso.prompt.js';

/** Quien pregunta: lo que deja el guard de JWT en la petición. */
export interface UsuarioDelAsistente {
  id: string;
  role: Role;
  accessRoleId: string | null;
}

export interface RespuestaDelAsistente {
  reply: string;
  tablas: TablaDelAsistente[];
  /**
   * Qué se consultó, en una línea. El navegador la manda de vuelta con el
   * historial para que «¿y de esos, cuáles en Medellín?» tenga de qué hablar:
   * las tablas no viajan de vuelta al modelo.
   */
  nota: string | null;
}

/** Vueltas de herramienta por pregunta: corregir un filtro cabe en dos. */
const MAX_RONDAS = 4;
/** Tablas por respuesta: más de tres ya no se leen. */
const MAX_TABLAS = 3;

/** Las listas de los filtros que ve este usuario. */
interface OpcionesDelUsuario {
  opciones: ReportOptions;
  /** Tiene bodegas asignadas: no ve todas. */
  restringido: boolean;
}

type Salida =
  | { ok: true; tabla: TablaDelAsistente }
  | { ok: false; error: string };

/**
 * Pintoso con herramientas: el modelo decide qué reporte consultar y con qué
 * filtros; el servidor lo ejecuta **como el usuario** (su tienda, su permiso de
 * Reportes, sus bodegas) y devuelve la tabla tal cual sale del reporte. El
 * modelo nunca copia los números a la tabla: solo los resume.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger('Asistente');

  constructor(
    private readonly modelo: ModeloDeLenguaje,
    private readonly reportes: ReportEngineService,
    private readonly access: AccessService,
  ) {}

  async chat(
    historial: MensajeChat[],
    usuario: UsuarioDelAsistente,
    tenantId: string,
  ): Promise<RespuestaDelAsistente> {
    const puedeConsultar = await this.puedeConsultar(usuario);
    const tools = puedeConsultar ? HERRAMIENTAS.map(esquemaDeHerramienta) : [];
    const messages: MensajeDelModelo[] = construirPayloadMensajes(
      promptDelAsistente({ hoy: diaLocal(new Date()), puedeConsultar }),
      historial,
    );

    const tablas: TablaDelAsistente[] = [];
    // Las opciones (bodegas, tallas, vendedores…) se piden una vez por
    // pregunta, aunque el modelo llame tres herramientas.
    let opciones: Promise<OpcionesDelUsuario> | null = null;
    const cargarOpciones = () =>
      (opciones ??= this.opcionesDelUsuario(usuario, tenantId));

    let reply: string | undefined;
    for (let ronda = 0; ronda < MAX_RONDAS && !reply; ronda++) {
      const r = await this.modelo.completar(messages, tools);
      if (!r.tool_calls?.length) {
        reply = r.content?.trim() || undefined;
        break;
      }
      messages.push({
        role: 'assistant',
        content: r.content ?? null,
        tool_calls: r.tool_calls,
      });
      for (const llamada of r.tool_calls) {
        const salida = puedeConsultar
          ? await this.ejecutarLlamada(llamada, tenantId, cargarOpciones)
          : ({ ok: false, error: 'Sin permiso de Reportes.' } as const);
        if (salida.ok) tablas.push(salida.tabla);
        messages.push({
          role: 'tool',
          tool_call_id: llamada.id,
          content: salida.ok
            ? resumenParaElModelo(salida.tabla)
            : JSON.stringify({ error: salida.error }),
        });
      }
    }

    // Se le acabaron las vueltas sin contestar: una última sin herramientas,
    // que obliga a responder con lo que ya tiene.
    if (!reply) {
      const r = await this.modelo.completar(messages);
      reply = r.content?.trim() || undefined;
    }
    if (!reply) {
      throw new ServiceUnavailableException(
        'El asistente no devolvió respuesta. Intenta de nuevo.',
      );
    }

    const mostradas = tablas.slice(-MAX_TABLAS);
    return { reply, tablas: mostradas, nota: notaDeLasTablas(mostradas) };
  }

  /**
   * Una consulta directa, sin modelo: el clic en una celda, quitar un filtro.
   * Es la misma ejecución que usa el agente, con las mismas reglas.
   */
  async consultar(
    nombre: string,
    argumentos: Argumentos,
    usuario: UsuarioDelAsistente,
    tenantId: string,
    clic?: { columna: string; valor: string },
  ): Promise<TablaDelAsistente> {
    if (!(await this.puedeConsultar(usuario))) {
      throw new ForbiddenException(
        'Tu usuario no tiene permiso para ver Reportes. Pídeselo al administrador de la tienda.',
      );
    }
    const h = buscarHerramienta(nombre);
    if (!h) throw new BadRequestException(`No existe la consulta «${nombre}».`);

    let args = argumentos;
    if (clic) {
      const r = refinar(h, argumentos, clic.columna, clic.valor);
      if (!r.ok) throw new BadRequestException(r.error);
      args = r.argumentos;
    }
    const salida = await this.ejecutar(
      nombre,
      args,
      tenantId,
      this.opcionesDelUsuario(usuario, tenantId),
    );
    if (!salida.ok) throw new BadRequestException(salida.error);
    return salida.tabla;
  }

  private async ejecutarLlamada(
    llamada: LlamadaAHerramienta,
    tenantId: string,
    opciones: () => Promise<OpcionesDelUsuario>,
  ): Promise<Salida> {
    let args: Argumentos;
    try {
      const crudo: unknown = JSON.parse(llamada.function.arguments || '{}');
      args =
        crudo && typeof crudo === 'object' && !Array.isArray(crudo)
          ? (crudo as Argumentos)
          : {};
    } catch {
      return { ok: false, error: 'Los argumentos no eran JSON válido.' };
    }
    return this.ejecutar(llamada.function.name, args, tenantId, opciones());
  }

  private async ejecutar(
    nombre: string,
    args: Argumentos,
    tenantId: string,
    opciones: Promise<OpcionesDelUsuario>,
  ): Promise<Salida> {
    const h = buscarHerramienta(nombre);
    if (!h) {
      return {
        ok: false,
        error: `No existe la herramienta ${nombre}. Las que hay: ${HERRAMIENTAS.map((x) => x.nombre).join(', ')}.`,
      };
    }
    const { opciones: listas, restringido } = await opciones;
    // Con bodegas asignadas, una consulta sin bodega mostraría las de todos.
    if (restringido && tieneParametro(h, 'bodega') && !args.bodega) {
      if (listas.warehouses.length !== 1) {
        return {
          ok: false,
          error:
            'Este usuario solo puede ver algunas bodegas; indica cuál: ' +
            (listas.warehouses.map((w) => w.label).join(', ') || 'ninguna') +
            '.',
        };
      }
      args = { ...args, bodega: listas.warehouses[0].label };
    }
    const t = traducirArgumentos(h, args, listas);
    if (!t.ok) return t;
    try {
      const resultado = await this.reportes.run(h.reporte, t.params, tenantId);
      return { ok: true, tabla: armarTabla(h, t, resultado) };
    } catch (e) {
      this.logger.error(`Falló la consulta ${nombre}: ${String(e)}`);
      return {
        ok: false,
        error: 'La consulta falló. Prueba con otros filtros.',
      };
    }
  }

  /** El mismo permiso que pide la pantalla de Reportes. */
  private puedeConsultar(usuario: UsuarioDelAsistente): Promise<boolean> {
    return this.access.userCan(usuario, 'reports', 'list');
  }

  /**
   * Las listas de los filtros, recortadas a lo que el usuario puede ver: quien
   * solo tiene una bodega no puede filtrar por otra, ni enterarse de su
   * nombre. Y si solo tiene una, el filtro de bodega queda puesto.
   */
  private async opcionesDelUsuario(
    usuario: UsuarioDelAsistente,
    tenantId: string,
  ): Promise<OpcionesDelUsuario> {
    const [opciones, permitidas] = await Promise.all([
      this.reportes.options(tenantId),
      usuario.role === Role.SUPER_ADMIN
        ? Promise.resolve(null)
        : this.access.allowedWarehouses(usuario.id),
    ]);
    if (!permitidas) return { opciones, restringido: false };
    const set = new Set(permitidas);
    return {
      opciones: {
        ...opciones,
        warehouses: opciones.warehouses.filter((w) => set.has(w.value)),
      },
      restringido: true,
    };
  }
}

export function notaDeLasTablas(tablas: TablaDelAsistente[]): string | null {
  if (!tablas.length) return null;
  return tablas
    .map(
      (t) =>
        `[Consulté ${t.herramienta}` +
        (t.filtros.length
          ? ` con ${t.filtros.map((f) => `${f.etiqueta}: ${f.valor}`).join(', ')}`
          : '') +
        `; ${t.totalFilas} filas]`,
    )
    .join(' ');
}
