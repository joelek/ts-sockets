"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeFrame = exports.decodeFrame = exports.WebSocketFrameType = void 0;
const libcrypto = require("crypto");
var WebSocketFrameType;
(function (WebSocketFrameType) {
    WebSocketFrameType[WebSocketFrameType["CONTINUATION"] = 0] = "CONTINUATION";
    WebSocketFrameType[WebSocketFrameType["TEXT"] = 1] = "TEXT";
    WebSocketFrameType[WebSocketFrameType["BINARY"] = 2] = "BINARY";
    WebSocketFrameType[WebSocketFrameType["UNUSED_3"] = 3] = "UNUSED_3";
    WebSocketFrameType[WebSocketFrameType["UNUSED_4"] = 4] = "UNUSED_4";
    WebSocketFrameType[WebSocketFrameType["UNUSED_5"] = 5] = "UNUSED_5";
    WebSocketFrameType[WebSocketFrameType["UNUSED_6"] = 6] = "UNUSED_6";
    WebSocketFrameType[WebSocketFrameType["UNUSED_7"] = 7] = "UNUSED_7";
    WebSocketFrameType[WebSocketFrameType["CLOSE"] = 8] = "CLOSE";
    WebSocketFrameType[WebSocketFrameType["PING"] = 9] = "PING";
    WebSocketFrameType[WebSocketFrameType["PONG"] = 10] = "PONG";
    WebSocketFrameType[WebSocketFrameType["UNUSED_B"] = 11] = "UNUSED_B";
    WebSocketFrameType[WebSocketFrameType["UNUSED_C"] = 12] = "UNUSED_C";
    WebSocketFrameType[WebSocketFrameType["UNUSED_D"] = 13] = "UNUSED_D";
    WebSocketFrameType[WebSocketFrameType["UNUSED_E"] = 14] = "UNUSED_E";
    WebSocketFrameType[WebSocketFrameType["UNUSED_F"] = 15] = "UNUSED_F";
})(WebSocketFrameType = exports.WebSocketFrameType || (exports.WebSocketFrameType = {}));
;
function decodeFrame(state) {
    let final = ((state.buffer.readUInt8(state.offset) >> 7) & 0x01);
    let reserved1 = ((state.buffer.readUInt8(state.offset) >> 6) & 0x01);
    let reserved2 = ((state.buffer.readUInt8(state.offset) >> 5) & 0x01);
    let reserved3 = ((state.buffer.readUInt8(state.offset) >> 4) & 0x01);
    let opcode = ((state.buffer.readUInt8(state.offset) >> 0) & 0x0F);
    state.offset += 1;
    let masked = ((state.buffer.readUInt8(state.offset) >> 7) & 0x01);
    let payload_length = ((state.buffer.readUInt8(state.offset) >> 0) & 0x7F);
    state.offset += 1;
    if (payload_length === 126) {
        payload_length = state.buffer.readUInt16BE(state.offset);
        state.offset += 2;
        if (payload_length <= 125) {
            throw "Invalid frame encoding!";
        }
    }
    else if (payload_length === 127) {
        if (state.buffer.readUInt32BE(state.offset) !== 0) {
            throw "Invalid frame encoding!";
        }
        state.offset += 4;
        payload_length = state.buffer.readUInt32BE(state.offset);
        state.offset += 4;
        if (payload_length <= 65535) {
            throw "Invalid frame encoding!";
        }
    }
    let key = Buffer.alloc(4);
    if (masked === 1) {
        key = state.buffer.slice(state.offset, state.offset + 4);
        state.offset += 4;
    }
    if (state.offset + payload_length > state.buffer.length) {
        throw "Invalid frame encoding!";
    }
    let payload = state.buffer.slice(state.offset, state.offset + payload_length);
    state.offset += payload_length;
    if (masked === 1) {
        for (let i = 0; i < payload.length; i++) {
            payload[i] = payload[i] ^ key[i & 0x03];
        }
    }
    return {
        final,
        reserved1,
        reserved2,
        reserved3,
        opcode,
        masked,
        payload
    };
}
exports.decodeFrame = decodeFrame;
;
function encodeFrame(frame) {
    let chunks = new Array();
    let payload_length = frame.payload.length;
    let header = Buffer.alloc(2);
    chunks.push(header);
    let byte0 = 0;
    byte0 |= ((frame.final & 0x01) << 7);
    byte0 |= ((frame.reserved1 & 0x01) << 6);
    byte0 |= ((frame.reserved2 & 0x01) << 5);
    byte0 |= ((frame.reserved3 & 0x01) << 4);
    byte0 |= ((frame.opcode & 0x0F) << 0);
    header.writeUInt8(byte0, 0);
    if (payload_length <= 125) {
        let byte1 = 0;
        byte1 |= ((frame.masked & 0x01) << 7);
        byte1 |= ((payload_length & 0x7F) << 0);
        header.writeUInt8(byte1, 1);
    }
    else if (payload_length <= 65535) {
        let byte1 = 0;
        byte1 |= ((frame.masked & 0x01) << 7);
        byte1 |= ((126 & 0x7F) << 0);
        header.writeUInt8(byte1, 1);
        let length = Buffer.alloc(2);
        length.writeUInt16BE(payload_length, 0);
        chunks.push(length);
    }
    else if (payload_length <= 4294967295) {
        let byte1 = 0;
        byte1 |= ((frame.masked & 0x01) << 7);
        byte1 |= ((127 & 0x7F) << 0);
        header.writeUInt8(byte1, 1);
        let length = Buffer.alloc(8);
        length.writeUInt32BE(payload_length, 4);
        chunks.push(length);
    }
    else {
        throw "Invalid frame size!";
    }
    if (frame.masked === 1) {
        let key = libcrypto.randomBytes(4);
        let payload = Buffer.concat([frame.payload]);
        for (let i = 0; i < payload.length; i++) {
            payload[i] = payload[i] ^ key[i & 0x03];
        }
        chunks.push(key, payload);
    }
    else {
        chunks.push(frame.payload);
    }
    return Buffer.concat(chunks);
}
exports.encodeFrame = encodeFrame;
;
