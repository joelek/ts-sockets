/// <reference types="node" />
import * as shared from "./shared";
export declare enum WebSocketFrameType {
    CONTINUATION = 0,
    TEXT = 1,
    BINARY = 2,
    UNUSED_3 = 3,
    UNUSED_4 = 4,
    UNUSED_5 = 5,
    UNUSED_6 = 6,
    UNUSED_7 = 7,
    CLOSE = 8,
    PING = 9,
    PONG = 10,
    UNUSED_B = 11,
    UNUSED_C = 12,
    UNUSED_D = 13,
    UNUSED_E = 14,
    UNUSED_F = 15
}
export declare type WebSocketFrame = {
    final: number;
    reserved1: number;
    reserved2: number;
    reserved3: number;
    opcode: WebSocketFrameType;
    masked: number;
    payload: Buffer;
};
export declare function decodeFrame(state: shared.State): WebSocketFrame;
export declare function encodeFrame(frame: WebSocketFrame): Buffer;
