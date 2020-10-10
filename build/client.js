"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketClient = void 0;
const libcrypto = require("crypto");
const libhttp = require("http");
const libhttps = require("https");
const liburl = require("url");
const stdlib = require("@joelek/ts-stdlib");
const frames = require("./frames");
const is = require("./is");
const shared = require("./shared");
const utils = require("./utils");
function makeHttpPromise(url, options) {
    return new Promise((resolve, reject) => {
        libhttp.get(url, options)
            .on("upgrade", (response, socket, buffer) => {
            resolve({ response, socket, buffer });
        })
            .on("error", reject);
    });
}
function makeHttpsPromise(url, options) {
    return new Promise((resolve, reject) => {
        libhttps.get(url, options)
            .on("upgrade", (response, socket, buffer) => {
            resolve({ response, socket, buffer });
        })
            .on("error", reject);
    });
}
class WebSocketClient {
    constructor(url) {
        var _a;
        this.state = shared.ReadyState.CONNECTING;
        this.listeners = new stdlib.routing.MessageRouter();
        this.pending = new Array();
        this.socket = undefined;
        let key = libcrypto.randomBytes(16).toString("base64");
        let headers = {
            "Connection": "upgrade",
            "Host": (_a = liburl.parse(url).host) !== null && _a !== void 0 ? _a : "",
            "Sec-WebSocket-Key": key,
            "Sec-WebSocket-Version": "13",
            "Upgrade": "websocket"
        };
        (() => {
            if (url.startsWith("wss:")) {
                return makeHttpsPromise("https:" + url.substring(4), { headers, rejectUnauthorized: false });
            }
            else if (url.startsWith("ws:")) {
                return makeHttpPromise("http:" + url.substring(3), { headers });
            }
            else {
                throw `Expected ${url} to be a WebSocket URL!`;
            }
        })().then((upgraded) => {
            var _a, _b;
            let response = upgraded.response;
            let socket = upgraded.socket;
            let buffer = upgraded.buffer;
            socket.on("close", () => {
                this.state = shared.ReadyState.CLOSED;
                this.listeners.route("close", undefined);
            });
            socket.on("error", () => {
                this.state = shared.ReadyState.CLOSING;
                this.listeners.route("error", undefined);
                socket.end();
            });
            if (response.statusCode !== 101) {
                return socket.emit("error");
            }
            if (((_a = utils.getHeader(response, "Connection")) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== "upgrade") {
                return socket.emit("error");
            }
            if (((_b = utils.getHeader(response, "Upgrade")) === null || _b === void 0 ? void 0 : _b.toLowerCase()) !== "websocket") {
                return socket.emit("error");
            }
            let accept = libcrypto.createHash("sha1")
                .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
                .digest("base64");
            if (utils.getHeader(response, "Sec-WebSocket-Accept") !== accept) {
                return socket.emit("error");
            }
            this.socket = socket;
            let processBuffer = () => {
                while (true) {
                    try {
                        let state = {
                            buffer,
                            offset: 0
                        };
                        let frame = frames.decodeFrame(state);
                        this.onFrame(socket, frame);
                        buffer = buffer.slice(state.offset);
                    }
                    catch (error) {
                        break;
                    }
                }
            };
            this.socket.on("data", (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                processBuffer();
            });
            this.state = shared.ReadyState.OPEN;
            this.listeners.route("open", undefined);
            processBuffer();
        });
    }
    onFrame(socket, frame) {
        if (frame.reserved1 !== 0 || frame.reserved2 !== 0 || frame.reserved3 !== 0) {
            return this.close(shared.StatusCode.PROTOCOL_ERROR);
        }
        if (frame.opcode < 8) {
            if (frame.opcode === frames.WebSocketFrameType.CONTINUATION || frame.opcode === frames.WebSocketFrameType.TEXT || frame.opcode == frames.WebSocketFrameType.BINARY) {
                if (this.pending.length === 0) {
                    if (frame.opcode === frames.WebSocketFrameType.CONTINUATION) {
                        return this.close(shared.StatusCode.PROTOCOL_ERROR);
                    }
                }
                else {
                    if (frame.opcode !== frames.WebSocketFrameType.CONTINUATION) {
                        return this.close(shared.StatusCode.PROTOCOL_ERROR);
                    }
                }
                this.pending.push(frame.payload);
                if (frame.final === 1) {
                    let buffer = Buffer.concat(this.pending);
                    this.pending.splice(0);
                    this.listeners.route("message", {
                        data: buffer.toString()
                    });
                }
            }
            else {
                return this.close(shared.StatusCode.PROTOCOL_ERROR);
            }
        }
        else {
            if (frame.final !== 1) {
                return this.close(shared.StatusCode.PROTOCOL_ERROR);
            }
            if (frame.payload.length > 125) {
                return this.close(shared.StatusCode.PROTOCOL_ERROR);
            }
            if (frame.opcode === frames.WebSocketFrameType.CLOSE) {
                if (this.readyState === shared.ReadyState.CLOSING) {
                    return socket.end();
                }
                else {
                    socket.write(frames.encodeFrame(Object.assign(Object.assign({}, frame), { masked: 1 })), () => {
                        return socket.end();
                    });
                }
            }
            else if (frame.opcode === frames.WebSocketFrameType.PING) {
                socket.write(frames.encodeFrame(Object.assign(Object.assign({}, frame), { opcode: 0x0A, masked: 1 })));
            }
            else if (frame.opcode === frames.WebSocketFrameType.PONG) {
            }
            else {
                return this.close(shared.StatusCode.PROTOCOL_ERROR);
            }
        }
    }
    addEventListener(type, listener) {
        this.listeners.addObserver(type, listener);
    }
    close(status) {
        if (this.state !== shared.ReadyState.OPEN) {
            throw `Expected socket to be open!`;
        }
        const socket = this.socket;
        if (is.absent(socket)) {
            throw `Expected socket to be open!`;
        }
        let payload = Buffer.alloc(0);
        if (is.present(status)) {
            payload = Buffer.concat([Buffer.alloc(2), Buffer.from("Connection closed by client.")]);
            payload.writeUInt16BE(status, 0);
        }
        let frame = frames.encodeFrame({
            final: 1,
            reserved1: 0,
            reserved2: 0,
            reserved3: 0,
            opcode: frames.WebSocketFrameType.CLOSE,
            masked: 1,
            payload: payload
        });
        socket.write(frame);
        this.state = shared.ReadyState.CLOSING;
    }
    removeEventListener(type, listener) {
        this.listeners.removeObserver(type, listener);
    }
    send(payload) {
        if (this.state !== shared.ReadyState.OPEN) {
            throw `Expected socket to be open!`;
        }
        let socket = this.socket;
        if (is.absent(socket)) {
            throw `Expected socket to be open!`;
        }
        let final = 1;
        let reserved1 = 0;
        let reserved2 = 0;
        let reserved3 = 0;
        let opcode = frames.WebSocketFrameType.BINARY;
        let masked = 1;
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
    get readyState() {
        return this.state;
    }
}
exports.WebSocketClient = WebSocketClient;
;
