import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { User } from '../users/entities/user.entity.js';
import { Role } from '../common/enums/role.enum.js';
export declare class AuthService {
    private readonly usersService;
    private readonly jwtService;
    private readonly configService;
    private readonly refreshTokenRepository;
    constructor(usersService: UsersService, jwtService: JwtService, configService: ConfigService, refreshTokenRepository: Repository<RefreshToken>);
    login(loginDto: LoginDto): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: Role;
            tenantId: string;
        };
    }>;
    register(registerDto: RegisterDto): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: Role;
            tenantId: string;
        };
    }>;
    refreshTokens(refreshToken: string): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: Role;
            tenantId: string;
        };
    }>;
    logout(userId: string): Promise<{
        message: string;
    }>;
    getProfile(userId: string, tenantId?: string): Promise<User>;
    private generateTokens;
}
