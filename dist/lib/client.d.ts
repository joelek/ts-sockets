/// <reference types="node" />
import * as shared from "./shared";
export declare class WebSocketClient implements shared.WebSocketLike {
    private state;
    private listeners;
    private pending;
    private socket;
    private onFrame;
    constructor(url: string);
    addEventListener<A extends keyof shared.WebSocketEventMapLike>(type: A, listener: (event: shared.WebSocketEventMapLike[A]) => void): void;
    close(status?: shared.StatusCode): void;
    removeEventListener<A extends keyof shared.WebSocketEventMapLike>(type: A, listener: (event: shared.WebSocketEventMapLike[A]) => void): void;
    send(payload: string | Buffer): void;
    get readyState(): shared.ReadyState;
}
