/// <reference types="node" />
export declare enum ReadyState {
    CONNECTING = 0,
    OPEN = 1,
    CLOSING = 2,
    CLOSED = 3
}
export declare class WebSocketClient {
    private state;
    private listeners;
    private pending;
    private socket;
    private onFrame;
    constructor(url: string);
    addEventListener<A extends keyof WebSocketEventMap>(type: A, listener: (event: WebSocketEventMap[A]) => void): void;
    removeEventListener<A extends keyof WebSocketEventMap>(type: A, listener: (event: WebSocketEventMap[A]) => void): void;
    send(payload: string | Buffer): void;
    get readyState(): ReadyState;
}
