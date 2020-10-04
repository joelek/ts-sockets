"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketServer = void 0;
const libcrypto = require("crypto");
const stdlib = require("@joelek/ts-stdlib");
const is = {
    absent(subject) {
        return subject == null;
    },
    present(subject) {
        return subject != null;
    }
};
class BiMap {
    constructor() {
        this.value_to_key = new Map();
        this.key_to_value = new Map();
    }
    add(key, value) {
        this.value_to_key.set(value, key);
        this.key_to_value.set(key, value);
    }
    key(value) {
        return this.value_to_key.get(value) || null;
    }
    remove(key) {
        let value = this.key_to_value.get(key);
        if (is.present(value)) {
            this.value_to_key.delete(value);
        }
        this.key_to_value.delete(key);
    }
    value(key) {
        return this.key_to_value.get(key) || null;
    }
}
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
})(WebSocketFrameType || (WebSocketFrameType = {}));
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
function getHeader(request, key) {
    let values = request.headers[key.toLowerCase()];
    if (is.present(values)) {
        if (values.constructor === String) {
            return values;
        }
        if (values.constructor === Array && values.length === 1) {
            return values[0];
        }
    }
    return null;
}
class WebSocketServer {
    constructor() {
        this.pending_chunks = new Map();
        this.connections = new BiMap();
        this.router = new stdlib.routing.MessageRouter();
    }
    closeConnection(socket, preemptive_measure) {
        if (preemptive_measure) {
            socket.destroy();
        }
        else {
            socket.end();
        }
    }
    onFrame(connection_id, socket, frame) {
        if (frame.reserved1 !== 0 || frame.reserved2 !== 0 || frame.reserved3 !== 0) {
            return this.closeConnection(socket, true);
        }
        if (frame.masked !== 1) {
            return this.closeConnection(socket, true);
        }
        if (frame.opcode < 8) {
            if (frame.opcode === WebSocketFrameType.CONTINUATION || frame.opcode === WebSocketFrameType.TEXT || frame.opcode == WebSocketFrameType.BINARY) {
                let pending_chunks = this.pending_chunks.get(connection_id);
                if (is.absent(pending_chunks)) {
                    pending_chunks = new Array();
                    this.pending_chunks.set(connection_id, pending_chunks);
                }
                else {
                    if (frame.opcode !== WebSocketFrameType.CONTINUATION) {
                        return this.closeConnection(socket, true);
                    }
                }
                pending_chunks.push(frame.payload);
                if (frame.final === 1) {
                    let buffer = Buffer.concat(pending_chunks);
                    this.pending_chunks.delete(connection_id);
                    this.router.route("message", {
                        connection_id,
                        buffer
                    });
                }
            }
            else {
                return this.closeConnection(socket, true);
            }
        }
        else {
            if (frame.final !== 1) {
                return this.closeConnection(socket, true);
            }
            if (frame.payload.length > 125) {
                return this.closeConnection(socket, true);
            }
            if (frame.opcode === WebSocketFrameType.CLOSE) {
                socket.write(encodeFrame(Object.assign(Object.assign({}, frame), { masked: 0 })), () => {
                    return this.closeConnection(socket, false);
                });
            }
            else if (frame.opcode === WebSocketFrameType.PING) {
                socket.write(encodeFrame(Object.assign(Object.assign({}, frame), { opcode: 0x0A, masked: 0 })));
            }
            else if (frame.opcode === WebSocketFrameType.PONG) {
            }
            else {
                return this.closeConnection(socket, true);
            }
        }
    }
    addEventListener(type, listener) {
        return this.router.addObserver(type, listener);
    }
    getRequestHandler() {
        return (request, response) => {
            let socket = request.socket;
            let connection_id = this.connections.key(socket);
            if (is.present(connection_id)) {
                return this.closeConnection(socket, true);
            }
            let major = request.httpVersionMajor;
            let minor = request.httpVersionMinor;
            if (major < 1 || (major === 1 && minor < 1)) {
                response.writeHead(400);
                return response.end();
            }
            let method = request.method;
            if (method !== "GET") {
                response.writeHead(400);
                return response.end();
            }
            let host = getHeader(request, "Host");
            if (is.absent(host)) {
                response.writeHead(400);
                return response.end();
            }
            let upgrade = getHeader(request, "Upgrade");
            if (is.absent(upgrade) || upgrade.toLowerCase() !== "websocket") {
                response.writeHead(400);
                return response.end();
            }
            let connection = getHeader(request, "Connection");
            if (is.absent(connection) || connection.toLowerCase() !== "upgrade") {
                response.writeHead(400);
                return response.end();
            }
            let key = getHeader(request, "Sec-WebSocket-Key");
            if (is.absent(key) || Buffer.from(key, "base64").length !== 16) {
                response.writeHead(400);
                return response.end();
            }
            let version = getHeader(request, "Sec-WebSocket-Version");
            if (version !== "13") {
                response.writeHead(426, {
                    "Sec-WebSocket-Version": "13"
                });
                return response.end();
            }
            let accept = libcrypto.createHash("sha1")
                .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
                .digest("base64");
            response.writeHead(101, {
                "Upgrade": "websocket",
                "Connection": "Upgrade",
                "Sec-WebSocket-Accept": accept
            });
            return response.end(() => {
                let connection_id = libcrypto.randomBytes(16).toString("hex");
                this.connections.add(connection_id, socket);
                this.router.route("connect", {
                    connection_id
                });
                socket.on("data", (buffer) => {
                    let state = {
                        buffer,
                        offset: 0
                    };
                    try {
                        while (state.offset < buffer.length) {
                            let frame = decodeFrame(state);
                            this.onFrame(connection_id, socket, frame);
                        }
                    }
                    catch (error) {
                        return this.closeConnection(socket, true);
                    }
                });
                socket.on("close", () => {
                    this.connections.remove(connection_id);
                    this.router.route("disconnect", {
                        connection_id
                    });
                });
                socket.setTimeout(0);
            });
        };
    }
    removeEventListener(type, listener) {
        return this.router.removeObserver(type, listener);
    }
    send(connection_id, payload) {
        let socket = this.connections.value(connection_id);
        if (is.absent(socket)) {
            throw "Connection with id \"" + connection_id + "\" has no socket!";
        }
        let final = 1;
        let reserved1 = 0;
        let reserved2 = 0;
        let reserved3 = 0;
        let opcode = WebSocketFrameType.BINARY;
        let masked = 0;
        if (!(payload instanceof Buffer)) {
            payload = Buffer.from(payload, "utf8");
            opcode = WebSocketFrameType.TEXT;
        }
        let frame = encodeFrame({
            final,
            reserved1,
            reserved2,
            reserved3,
            opcode,
            masked,
            payload
        });
        socket.write(frame);
    }
}
exports.WebSocketServer = WebSocketServer;
