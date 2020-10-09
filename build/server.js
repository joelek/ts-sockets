"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketServer = void 0;
const libcrypto = require("crypto");
const libtls = require("tls");
const stdlib = require("@joelek/ts-stdlib");
const frames = require("./frames");
const is = require("./is");
const shared = require("./shared");
function makeConnectionUrl(request) {
    let host = request.headers.host || "";
    let path = request.url || "/";
    let protocol = request.socket instanceof libtls.TLSSocket ? "wss:" : "ws:";
    return `${protocol}//${host}${path}`;
}
class WebSocketServer {
    constructor() {
        this.pending_chunks = new Map();
        this.connections = new shared.BiMap();
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
    onFrame(connection_id, connection_url, socket, frame) {
        if (frame.reserved1 !== 0 || frame.reserved2 !== 0 || frame.reserved3 !== 0) {
            return this.closeConnection(socket, true);
        }
        if (frame.masked !== 1) {
            return this.closeConnection(socket, true);
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
                        return this.closeConnection(socket, true);
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
            if (frame.opcode === frames.WebSocketFrameType.CLOSE) {
                socket.write(frames.encodeFrame(Object.assign(Object.assign({}, frame), { masked: 0 })), () => {
                    return this.closeConnection(socket, false);
                });
            }
            else if (frame.opcode === frames.WebSocketFrameType.PING) {
                socket.write(frames.encodeFrame(Object.assign(Object.assign({}, frame), { opcode: 0x0A, masked: 0 })));
            }
            else if (frame.opcode === frames.WebSocketFrameType.PONG) {
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
            let host = shared.getHeader(request, "Host");
            if (is.absent(host)) {
                response.writeHead(400);
                return response.end();
            }
            let upgrade = shared.getHeader(request, "Upgrade");
            if (is.absent(upgrade) || upgrade.toLowerCase() !== "websocket") {
                response.writeHead(400);
                return response.end();
            }
            let connection = shared.getHeader(request, "Connection");
            if (is.absent(connection) || connection.toLowerCase() !== "upgrade") {
                response.writeHead(400);
                return response.end();
            }
            let key = shared.getHeader(request, "Sec-WebSocket-Key");
            if (is.absent(key) || Buffer.from(key, "base64").length !== 16) {
                response.writeHead(400);
                return response.end();
            }
            let version = shared.getHeader(request, "Sec-WebSocket-Version");
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
                this.connections.add(connection_id, socket);
                this.router.route("connect", {
                    connection_id,
                    connection_url
                });
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
                    this.router.route("disconnect", {
                        connection_id,
                        connection_url
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
