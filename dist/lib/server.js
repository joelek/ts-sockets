"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketServer = void 0;
const libcrypto = require("crypto");
const libtls = require("tls");
const stdlib = require("@joelek/ts-stdlib");
const frames = require("./frames");
const is = require("./is");
const shared = require("./shared");
const utils = require("./utils");
function makeConnectionUrl(request) {
    let host = request.headers.host || "";
    let path = request.url || "/";
    let protocol = request.socket instanceof libtls.TLSSocket ? "wss:" : "ws:";
    return `${protocol}//${host}${path}`;
}
class WebSocketServer {
    constructor() {
        this.pending_chunks = new Map();
        this.states = new Map();
        this.connections = new utils.BiMap();
        this.router = new stdlib.routing.MessageRouter();
    }
    onFrame(connection_id, connection_url, socket, frame) {
        if (frame.reserved1 !== 0 || frame.reserved2 !== 0 || frame.reserved3 !== 0) {
            return this.close(connection_id, shared.StatusCode.PROTOCOL_ERROR);
        }
        if (frame.masked !== 1) {
            return this.close(connection_id, shared.StatusCode.PROTOCOL_ERROR);
        }
        if (frame.opcode < 8) {
            if (frame.opcode === frames.WebSocketFrameType.CONTINUATION || frame.opcode === frames.WebSocketFrameType.TEXT || frame.opcode == frames.WebSocketFrameType.BINARY) {
                let pending_chunks = this.pending_chunks.get(connection_id);
                if (is.absent(pending_chunks)) {
                    pending_chunks = new Array();
                    this.pending_chunks.set(connection_id, pending_chunks);
                }
                else {
                    if (frame.opcode !== frames.WebSocketFrameType.CONTINUATION) {
                        return this.close(connection_id, shared.StatusCode.PROTOCOL_ERROR);
                    }
                }
                pending_chunks.push(frame.payload);
                if (frame.final === 1) {
                    let buffer = Buffer.concat(pending_chunks);
                    this.pending_chunks.delete(connection_id);
                    this.router.route("message", {
                        connection_id,
                        connection_url,
                        buffer
                    });
                }
            }
            else {
                return this.close(connection_id, shared.StatusCode.PROTOCOL_ERROR);
            }
        }
        else {
            if (frame.final !== 1) {
                return this.close(connection_id, shared.StatusCode.PROTOCOL_ERROR);
            }
            if (frame.payload.length > 125) {
                return this.close(connection_id, shared.StatusCode.PROTOCOL_ERROR);
            }
            if (frame.opcode === frames.WebSocketFrameType.CLOSE) {
                if (this.states.get(connection_id) === shared.ReadyState.CLOSING) {
                    socket.end();
                    return;
                }
                else {
                    socket.write(frames.encodeFrame(Object.assign(Object.assign({}, frame), { masked: 0 })), () => {
                        return socket.end();
                    });
                }
            }
            else if (frame.opcode === frames.WebSocketFrameType.PING) {
                socket.write(frames.encodeFrame(Object.assign(Object.assign({}, frame), { opcode: 0x0A, masked: 0 })));
            }
            else if (frame.opcode === frames.WebSocketFrameType.PONG) {
            }
            else {
                return this.close(connection_id, shared.StatusCode.PROTOCOL_ERROR);
            }
        }
    }
    addEventListener(type, listener) {
        return this.router.addObserver(type, listener);
    }
    broadcast(payload) {
        for (let [connection_id, socket] of this.connections) {
            if (this.states.get(connection_id) === shared.ReadyState.OPEN) {
                this.send(connection_id, payload);
            }
        }
    }
    close(connection_id, status) {
        if (this.states.get(connection_id) !== shared.ReadyState.OPEN) {
            throw `Expected socket to be open!`;
        }
        const socket = this.connections.value(connection_id);
        if (is.absent(socket)) {
            throw "Connection with id \"" + connection_id + "\" has no socket!";
        }
        let payload = Buffer.alloc(0);
        if (is.present(status)) {
            payload = Buffer.concat([Buffer.alloc(2), Buffer.from("Connection closed by server.")]);
            payload.writeUInt16BE(status, 0);
        }
        let frame = frames.encodeFrame({
            final: 1,
            reserved1: 0,
            reserved2: 0,
            reserved3: 0,
            opcode: frames.WebSocketFrameType.CLOSE,
            masked: 0,
            payload: payload
        });
        socket.write(frame);
        this.states.set(connection_id, shared.ReadyState.CLOSING);
    }
    getRequestHandler() {
        return (request, response) => {
            let socket = request.socket;
            let connection_id = this.connections.key(socket);
            if (is.present(connection_id)) {
                response.writeHead(400);
                return response.end();
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
            let host = utils.getHeader(request, "Host");
            if (is.absent(host)) {
                response.writeHead(400);
                return response.end();
            }
            let upgrade = utils.getHeader(request, "Upgrade");
            if (is.absent(upgrade) || upgrade.toLowerCase() !== "websocket") {
                response.writeHead(400);
                return response.end();
            }
            let connection = utils.getHeader(request, "Connection");
            if (is.absent(connection) || connection.toLowerCase() !== "upgrade") {
                response.writeHead(400);
                return response.end();
            }
            let key = utils.getHeader(request, "Sec-WebSocket-Key");
            if (is.absent(key) || Buffer.from(key, "base64").length !== 16) {
                response.writeHead(400);
                return response.end();
            }
            let version = utils.getHeader(request, "Sec-WebSocket-Version");
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
                let connection_url = makeConnectionUrl(request);
                let buffer = Buffer.alloc(0);
                socket.on("data", (chunk) => {
                    buffer = Buffer.concat([buffer, chunk]);
                    while (true) {
                        try {
                            let state = {
                                buffer,
                                offset: 0
                            };
                            let frame = frames.decodeFrame(state);
                            this.onFrame(connection_id, connection_url, socket, frame);
                            buffer = buffer.slice(state.offset);
                        }
                        catch (error) {
                            break;
                        }
                    }
                });
                socket.on("close", () => {
                    this.connections.remove(connection_id);
                    this.states.delete(connection_id);
                    this.router.route("disconnect", {
                        connection_id,
                        connection_url
                    });
                });
                socket.setTimeout(0);
                this.connections.add(connection_id, socket);
                this.states.set(connection_id, shared.ReadyState.OPEN);
                this.router.route("connect", {
                    connection_id,
                    connection_url
                });
            });
        };
    }
    removeEventListener(type, listener) {
        return this.router.removeObserver(type, listener);
    }
    send(connection_id, payload) {
        if (this.states.get(connection_id) !== shared.ReadyState.OPEN) {
            throw `Expected socket to be open!`;
        }
        let socket = this.connections.value(connection_id);
        if (is.absent(socket)) {
            throw "Connection with id \"" + connection_id + "\" has no socket!";
        }
        let final = 1;
        let reserved1 = 0;
        let reserved2 = 0;
        let reserved3 = 0;
        let opcode = frames.WebSocketFrameType.BINARY;
        let masked = 0;
        if (!(payload instanceof Buffer)) {
            payload = Buffer.from(payload, "utf8");
            opcode = frames.WebSocketFrameType.TEXT;
        }
        let frame = frames.encodeFrame({
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
