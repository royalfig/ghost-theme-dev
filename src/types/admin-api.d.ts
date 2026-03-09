declare module '@tryghost/admin-api' {
    export default class GhostAdminApi {
        constructor(options: {
            url: string;
            key: string;
            version: string;
        });
        themes: {
            upload(options: { file: string }): Promise<any>;
        };
        makeRequest(options: {
            url: string;
            method: string;
            data?: any;
            params?: any;
        }): Promise<any>;
    }
}
