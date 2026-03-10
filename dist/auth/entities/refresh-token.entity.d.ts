import { User } from '../../users/entities/user.entity.js';
export declare class RefreshToken {
    id: string;
    token: string;
    user: User;
    userId: string;
    expiresAt: Date;
    isRevoked: boolean;
    createdAt: Date;
}
