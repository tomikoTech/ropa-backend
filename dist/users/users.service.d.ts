import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
export declare class UsersService {
    private readonly userRepository;
    constructor(userRepository: Repository<User>);
    create(createUserDto: CreateUserDto, tenantId?: string): Promise<User>;
    findAll(tenantId: string): Promise<User[]>;
    findOne(id: string, tenantId?: string): Promise<User>;
    findByEmail(email: string): Promise<User | null>;
    update(id: string, updateUserDto: UpdateUserDto, tenantId: string): Promise<User>;
    remove(id: string, tenantId: string): Promise<void>;
}
