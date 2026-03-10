declare const _default: () => {
    port: number;
    database: {
        host: string;
        port: number;
        username: string;
        password: string;
        database: string;
    };
    jwt: {
        secret: string;
        expiration: string;
        refreshSecret: string;
        refreshExpiration: string;
    };
};
export default _default;
