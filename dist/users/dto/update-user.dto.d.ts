import { Role } from '../../common/enums/role.enum.js';
export declare class UpdateUserDto {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    role?: Role;
    isActive?: boolean;
}
