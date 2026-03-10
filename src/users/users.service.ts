import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto, tenantId?: string): Promise<User> {
    const where = tenantId
      ? { email: createUserDto.email, tenantId }
      : { email: createUserDto.email };
    const existing = await this.userRepository.findOne({ where });
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const passwordHash = await bcrypt.hash(createUserDto.password, 10);
    const user = this.userRepository.create({
      email: createUserDto.email,
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

  async update(id: string, updateUserDto: UpdateUserDto, tenantId: string): Promise<User> {
    const user = await this.findOne(id, tenantId);

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existing = await this.userRepository.findOne({
        where: { email: updateUserDto.email, tenantId },
      });
      if (existing) {
        throw new ConflictException('El email ya está registrado');
      }
    }

    if (updateUserDto.password) {
      user.passwordHash = await bcrypt.hash(updateUserDto.password, 10);
    }

    if (updateUserDto.email) user.email = updateUserDto.email;
    if (updateUserDto.firstName) user.firstName = updateUserDto.firstName;
    if (updateUserDto.lastName) user.lastName = updateUserDto.lastName;
    if (updateUserDto.role) user.role = updateUserDto.role;
    if (updateUserDto.isActive !== undefined) user.isActive = updateUserDto.isActive;

    return this.userRepository.save(user);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const user = await this.findOne(id, tenantId);
    await this.userRepository.remove(user);
  }
}
