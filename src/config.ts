export interface IConfig {
    appservice: {
        bindAddress: string;
        port: number;
    }
    homeserver: {
        url: string;
        domain: string;
    }
}