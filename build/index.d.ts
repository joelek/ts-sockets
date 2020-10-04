/// <reference types="node" />
import * as libhttp from "http";
import * as stdlib from "@joelek/ts-stdlib";
declare type WebSocketServerConnectMessage = {
    connection_id: string;
};
declare type WebSocketServerDisconnectMessage = {
    connection_id: string;
};
declare type WebSocketServerMessageMessage = {
    connection_id: string;
    buffer: Buffer;
};
declare type WebSocketServerMessageMap = {
    "connect": WebSocketServerConnectMessage;
    "disconnect": WebSocketServerDisconnectMessage;
    "message": WebSocketServerMessageMessage;
};
export declare class WebSocketServer {
    private pending_chunks;
    private connections;
    private router;
    private closeConnection;
    private onFrame;
    constructor();
    addEventListener<K extends keyof WebSocketServerMessageMap>(type: K, listener: stdlib.routing.MessageObserver<WebSocketServerMessageMap[K]>): void;
    getRequestHandler(): libhttp.RequestListener;
    removeEventListener<K extends keyof WebSocketServerMessageMap>(type: K, listener: stdlib.routing.MessageObserver<WebSocketServerMessageMap[K]>): void;
    send(connection_id: string, payload: string | Buffer): void;
}
export {};
