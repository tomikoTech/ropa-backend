"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const bcrypt = __importStar(require("bcrypt"));
const user_entity_js_1 = require("./entities/user.entity.js");
let UsersService = class UsersService {
    userRepository;
    constructor(userRepository) {
        this.userRepository = userRepository;
    }
    async create(createUserDto, tenantId) {
        const where = tenantId
            ? { email: createUserDto.email, tenantId }
            : { email: createUserDto.email };
        const existing = await this.userRepository.findOne({ where });
        if (existing) {
            throw new common_1.ConflictException('El email ya está registrado');
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
    async findAll(tenantId) {
        return this.userRepository.find({
            where: { tenantId },
            order: { createdAt: 'DESC' },
        });
    }
    async findOne(id, tenantId) {
        const where = tenantId ? { id, tenantId } : { id };
        const user = await this.userRepository.findOne({ where });
        if (!user) {
            throw new common_1.NotFoundException('Usuario no encontrado');
        }
        return user;
    }
    async findByEmail(email) {
        return this.userRepository.findOne({ where: { email } });
    }
    async update(id, updateUserDto, tenantId) {
        const user = await this.findOne(id, tenantId);
        if (updateUserDto.email && updateUserDto.email !== user.email) {
            const existing = await this.userRepository.findOne({
                where: { email: updateUserDto.email, tenantId },
            });
            if (existing) {
                throw new common_1.ConflictException('El email ya está registrado');
            }
        }
        if (updateUserDto.password) {
            user.passwordHash = await bcrypt.hash(updateUserDto.password, 10);
        }
        if (updateUserDto.email)
            user.email = updateUserDto.email;
        if (updateUserDto.firstName)
            user.firstName = updateUserDto.firstName;
        if (updateUserDto.lastName)
            user.lastName = updateUserDto.lastName;
        if (updateUserDto.role)
            user.role = updateUserDto.role;
        if (updateUserDto.isActive !== undefined)
            user.isActive = updateUserDto.isActive;
        return this.userRepository.save(user);
    }
    async remove(id, tenantId) {
        const user = await this.findOne(id, tenantId);
        await this.userRepository.remove(user);
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_js_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], UsersService);
//# sourceMappingURL=users.service.js.map