"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketServer = void 0;
const libcrypto = require("crypto");
const stdlib = require("@joelek/ts-stdlib");
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
        if (value !== undefined) {
            this.value_to_key.delete(value);
        }
        this.key_to_value.delete(key);
    }
    value(key) {
        return this.key_to_value.get(key) || null;
    }
}
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
    if (values !== undefined) {
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
    closeConnection(connection_id, socket, preemptive_measure) {
        socket.end(() => {
            this.connections.remove(connection_id);
            this.router.route("disconnect", {
                connection_id,
                preemptive_measure
            });
        });
    }
    onFrame(connection_id, socket, frame) {
        if (frame.reserved1 !== 0 || frame.reserved2 !== 0 || frame.reserved3 !== 0) {
            return this.closeConnection(connection_id, socket, true);
        }
        if (frame.masked !== 1) {
            return this.closeConnection(connection_id, socket, true);
        }
        if (frame.opcode < 8) {
            if (frame.opcode === 0x00 || frame.opcode === 0x01 || frame.opcode == 0x02) {
                let pending_chunks = this.pending_chunks.get(connection_id);
                if (pending_chunks === undefined) {
                    pending_chunks = new Array();
                    this.pending_chunks.set(connection_id, pending_chunks);
                }
                else {
                    if (frame.opcode !== 0x00) {
                        return this.closeConnection(connection_id, socket, true);
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
                return this.closeConnection(connection_id, socket, true);
            }
        }
        else {
            if (frame.final !== 1) {
                return this.closeConnection(connection_id, socket, true);
            }
            if (frame.payload.length > 125) {
                return this.closeConnection(connection_id, socket, true);
            }
            if (frame.opcode === 0x08) {
                socket.write(encodeFrame(Object.assign(Object.assign({}, frame), { masked: 0 })), () => {
                    return this.closeConnection(connection_id, socket, false);
                });
            }
            else if (frame.opcode === 0x09) {
                socket.write(encodeFrame(Object.assign(Object.assign({}, frame), { opcode: 0x0A, masked: 0 })));
            }
            else if (frame.opcode === 0x0A) {
            }
            else {
                return this.closeConnection(connection_id, socket, true);
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
            if (connection_id !== null) {
                return this.closeConnection(connection_id, socket, true);
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
            if (host === null) {
                response.writeHead(400);
                return response.end();
            }
            let upgrade = getHeader(request, "Upgrade");
            if (upgrade === null || upgrade.toLowerCase() !== "websocket") {
                response.writeHead(400);
                return response.end();
            }
            let connection = getHeader(request, "Connection");
            if (connection === null || connection.toLowerCase() !== "upgrade") {
                response.writeHead(400);
                return response.end();
            }
            let key = getHeader(request, "Sec-WebSocket-Key");
            if (key === null || Buffer.from(key, "base64").length !== 16) {
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
                        return this.closeConnection(connection_id, socket, true);
                    }
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
        if (socket === null) {
            throw "Connection with id \"" + connection_id + "\" has no socket!";
        }
        let final = 1;
        let reserved1 = 0;
        let reserved2 = 0;
        let reserved3 = 0;
        let opcode = 0x02;
        let masked = 0;
        if (!(payload instanceof Buffer)) {
            payload = Buffer.from(payload, "utf8");
            opcode = 0x01;
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
