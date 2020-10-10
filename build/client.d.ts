/// <reference types="node" />
import * as shared from "./shared";
export declare class WebSocketClient {
    private state;
    private listeners;
    private pending;
    private socket;
    private onFrame;
    constructor(url: string);
    addEventListener<A extends keyof WebSocketEventMap>(type: A, listener: (event: WebSocketEventMap[A]) => void): void;
    close(status?: shared.StatusCode): void;
    removeEventListener<A extends keyof WebSocketEventMap>(type: A, listener: (event: WebSocketEventMap[A]) => void): void;
    send(payload: string | Buffer): void;
    get readyState(): shared.ReadyState;
}
