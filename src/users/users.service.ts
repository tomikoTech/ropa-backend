import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity.js';
import { normalizarUsuario, porQueNoSirveElUsuario } from './credenciales.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto, tenantId?: string): Promise<User> {
    if (!createUserDto.email) {
      if (!createUserDto.username) {
        throw new BadRequestException(
          'Pon un nombre de usuario o un correo: con uno basta.',
        );
      }
      // Correo técnico, único por tienda: nadie lo ve ni lo usa para entrar.
      createUserDto.email = `${normalizarUsuario(createUserDto.username)}@sin-correo.${(tenantId ?? 'mipinta').slice(0, 8)}`;
    }
    const where = tenantId
      ? { email: createUserDto.email, tenantId }
      : { email: createUserDto.email };
    const existing = await this.userRepository.findOne({ where });
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    let username: string | undefined;
    if (createUserDto.username) {
      const motivo = porQueNoSirveElUsuario(createUserDto.username);
      if (motivo) throw new BadRequestException(motivo);
      username = normalizarUsuario(createUserDto.username);
      const ocupado = await this.userRepository.findOne({
        where: tenantId ? { username, tenantId } : { username },
      });
      if (ocupado) {
        throw new ConflictException(
          `El usuario «${username}» ya está tomado en esta tienda.`,
        );
      }
    }

    const passwordHash = await bcrypt.hash(createUserDto.password, 10);
    const user = this.userRepository.create({
      email: createUserDto.email,
      username,
      passwordHash,
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
      role: createUserDto.role,
      tenantId,
    });
    return this.userRepository.save(user);
  }

  async findAll(tenantId: string): Promise<User[]> {
    return this.userRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, tenantId?: string): Promise<User> {
    const where = tenantId ? { id, tenantId } : { id };
    const user = await this.userRepository.findOne({ where });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  // Login por email O nombre de usuario (mismo criterio global que findByEmail).
  /**
   * Todas las cuentas que responden a ese correo **o** nombre de usuario.
   *
   * Devuelve una lista y no una sola porque el nombre de usuario es único
   * **por tienda**, no en todo el sistema: dos negocios distintos pueden
   * tener cada uno su «bodega», y así lo permite el índice de la tabla.
   *
   * Buscando una sola cuenta, el login tomaba la primera que apareciera: a
   * la «bodega» de la segunda tienda le decía «credenciales inválidas» con
   * la contraseña correcta, porque estaba comparando contra la cuenta de la
   * otra tienda. Pasó de verdad el 2026-10-02 con Distri Amber y AMAWAD.
   *
   * Ordenadas por antigüedad para que, con todo lo demás igual, la respuesta
   * sea siempre la misma y no dependa del plan del motor.
   */
  async findCandidatosParaLogin(identifier: string): Promise<User[]> {
    const id = (identifier || '').trim();
    if (!id) return [];
    return this.userRepository.find({
      where: [{ email: id }, { username: id }],
      order: { createdAt: 'ASC' },
    });
  }

  async findByEmailOrUsername(identifier: string): Promise<User | null> {
    const [primero] = await this.findCandidatosParaLogin(identifier);
    return primero ?? null;
  }

  /**
   * Quién tiene ese usuario **en esta tienda**.
   *
   * Por tenant y no global: dos tiendas distintas pueden tener cada una su
   * «caja1» sin estorbarse, que es lo que dice el índice único de la tabla.
   */
  async findByUsernameEnTenant(
    username: string,
    tenantId: string,
  ): Promise<User | null> {
    if (!username) return null;
    return this.userRepository.findOne({ where: { username, tenantId } });
  }

  /** Guardar un usuario ya resuelto. Lo usa el cambio de credenciales. */
  async guardar(user: User): Promise<User> {
    return this.userRepository.save(user);
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    tenantId: string,
  ): Promise<User> {
    const user = await this.findOne(id, tenantId);

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existing = await this.userRepository.findOne({
        where: { email: updateUserDto.email, tenantId },
      });
      if (existing) {
        throw new ConflictException('El email ya está registrado');
      }
    }

    // El nombre de usuario lo puede poner el administrador (y cada quien el
    // suyo, desde su configuración). Antes el campo existía, el login ya lo
    // aceptaba… y nada lo escribía: solo el que trajera el alta.
    if (updateUserDto.username !== undefined) {
      const motivo = porQueNoSirveElUsuario(updateUserDto.username);
      if (motivo) throw new BadRequestException(motivo);
      const username = normalizarUsuario(updateUserDto.username);
      const ocupado = await this.userRepository.findOne({
        where: { username, tenantId },
      });
      if (ocupado && ocupado.id !== id) {
        throw new ConflictException(
          `El usuario «${username}» ya está tomado en esta tienda.`,
        );
      }
      user.username = username;
    }

    if (updateUserDto.password) {
      user.passwordHash = await bcrypt.hash(updateUserDto.password, 10);
    }

    if (updateUserDto.email) user.email = updateUserDto.email;
    if (updateUserDto.firstName) user.firstName = updateUserDto.firstName;
    if (updateUserDto.lastName) user.lastName = updateUserDto.lastName;
    if (updateUserDto.role) user.role = updateUserDto.role;
    if (updateUserDto.isActive !== undefined)
      user.isActive = updateUserDto.isActive;

    return this.userRepository.save(user);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const user = await this.findOne(id, tenantId);
    await this.userRepository.remove(user);
  }
}
