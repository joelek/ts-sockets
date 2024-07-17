/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import * as libhttp from "http";
import * as libnet from "net";
import * as stdlib from "@joelek/ts-stdlib";
import * as shared from "./shared";
type UpgradeListener = (request: libhttp.IncomingMessage, socket: libnet.Socket) => void;
type WebSocketServerConnectMessage = {
    connection_id: string;
    connection_url: string;
};
type WebSocketServerDisconnectMessage = {
    connection_id: string;
    connection_url: string;
};
type WebSocketServerMessageMessage = {
    connection_id: string;
    connection_url: string;
    buffer: Buffer;
};
type WebSocketServerMessageMap = {
    "connect": WebSocketServerConnectMessage;
    "disconnect": WebSocketServerDisconnectMessage;
    "message": WebSocketServerMessageMessage;
};
export declare class WebSocketServer {
    private pending_chunks;
    private states;
    private connections;
    private router;
    private writeResponseStatusAndHeaders;
    private setupHandlers;
    private onFrame;
    constructor();
    addEventListener<K extends keyof WebSocketServerMessageMap>(type: K, listener: stdlib.routing.MessageObserver<WebSocketServerMessageMap[K]>): void;
    broadcast(payload: string | Buffer): void;
    close(connection_id: string, status?: shared.StatusCode): void;
    getRequestHandler(): libhttp.RequestListener;
    getUpgradeHandler(): UpgradeListener;
    removeEventListener<K extends keyof WebSocketServerMessageMap>(type: K, listener: stdlib.routing.MessageObserver<WebSocketServerMessageMap[K]>): void;
    send(connection_id: string, payload: string | Buffer): void;
}
export {};
