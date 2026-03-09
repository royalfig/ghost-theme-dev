declare module 'gscan' {
    const gscan: {
        check: (path: string) => Promise<any>;
        format: (report: any) => string;
    };
    export default gscan;
}
