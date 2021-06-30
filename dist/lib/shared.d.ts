/// <reference types="node" />
export declare enum ReadyState {
    CONNECTING = 0,
    OPEN = 1,
    CLOSING = 2,
    CLOSED = 3
}
export declare enum StatusCode {
    NORMAL = 1000,
    GOING_AWAY = 1001,
    PROTOCOL_ERROR = 1002,
    DATA_TYPE_NOT_ACCEPTED = 1003,
    RESERVED_1004 = 1004,
    RESERVED_1005 = 1005,
    RESERVED_1006 = 1006,
    BAD_DATA_TYPE = 1007,
    POLICY_VIOLATION = 1008,
    MESSAGE_TOO_BIG = 1009,
    CLIENT_EXPECTED_EXTENSION = 1010,
    SERVER_UNEXPECTED_CONDITION = 1011,
    RESERVED_1015 = 1015
}
export declare type WebSocketEventMapLike = {
    "close": {};
    "error": {};
    "message": {
        data: string | Buffer;
    };
    "open": {};
};
export interface WebSocketLike {
    addEventListener<A extends keyof WebSocketEventMapLike>(type: A, listener: (event: WebSocketEventMapLike[A]) => void): void;
    close(status?: StatusCode): void;
    removeEventListener<A extends keyof WebSocketEventMapLike>(type: A, listener: (event: WebSocketEventMapLike[A]) => void): void;
    send(payload: string | Buffer): void;
    readonly readyState: ReadyState;
}
