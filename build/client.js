"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketClient = exports.ReadyState = void 0;
const libcrypto = require("crypto");
const libhttp = require("http");
const libhttps = require("https");
const liburl = require("url");
const stdlib = require("@joelek/ts-stdlib");
const frames = require("./frames");
const is = require("./is");
const shared = require("./shared");
function makeHttpPromise(url, options) {
    return new Promise((resolve, reject) => {
        libhttp.get(url, options)
            .on("upgrade", resolve)
            .on("error", reject);
    });
}
function makeHttpsPromise(url, options) {
    return new Promise((resolve, reject) => {
        libhttps.get(url, options)
            .on("upgrade", resolve)
            .on("error", reject);
    });
}
var ReadyState;
(function (ReadyState) {
    ReadyState[ReadyState["CONNECTING"] = 0] = "CONNECTING";
    ReadyState[ReadyState["OPEN"] = 1] = "OPEN";
    ReadyState[ReadyState["CLOSING"] = 2] = "CLOSING";
    ReadyState[ReadyState["CLOSED"] = 3] = "CLOSED";
})(ReadyState = exports.ReadyState || (exports.ReadyState = {}));
;
class WebSocketClient {
    constructor(url) {
        var _a;
        this.state = ReadyState.CONNECTING;
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
        })().then((response) => {
            var _a, _b;
            let socket = response.socket;
            socket.on("close", () => {
                this.state = ReadyState.CLOSED;
                this.listeners.route("close", undefined);
            });
            socket.on("error", () => {
                this.state = ReadyState.CLOSING;
                this.listeners.route("error", undefined);
                socket.end();
            });
            if (response.statusCode !== 101) {
                return socket.emit("error");
            }
            if (((_a = shared.getHeader(response, "Connection")) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== "upgrade") {
                return socket.emit("error");
            }
            if (((_b = shared.getHeader(response, "Upgrade")) === null || _b === void 0 ? void 0 : _b.toLowerCase()) !== "websocket") {
                return socket.emit("error");
            }
            let accept = libcrypto.createHash("sha1")
                .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
                .digest("base64");
            if (shared.getHeader(response, "Sec-WebSocket-Accept") !== accept) {
                return socket.emit("error");
            }
            this.socket = socket;
            this.state = ReadyState.OPEN;
            this.socket.on("data", (buffer) => {
                let state = {
                    buffer,
                    offset: 0
                };
                try {
                    while (state.offset < buffer.length) {
                        let frame = frames.decodeFrame(state);
                        this.onFrame(socket, frame);
                    }
                }
                catch (error) {
                    return socket.emit("error");
                }
            });
            this.listeners.route("open", undefined);
        });
    }
    onFrame(socket, frame) {
        if (frame.reserved1 !== 0 || frame.reserved2 !== 0 || frame.reserved3 !== 0) {
            return socket.emit("error");
        }
        if (frame.opcode < 8) {
            if (frame.opcode === frames.WebSocketFrameType.CONTINUATION || frame.opcode === frames.WebSocketFrameType.TEXT || frame.opcode == frames.WebSocketFrameType.BINARY) {
                if (this.pending.length === 0) {
                    if (frame.opcode === frames.WebSocketFrameType.CONTINUATION) {
                        return socket.emit("error");
                    }
                }
                else {
                    if (frame.opcode !== frames.WebSocketFrameType.CONTINUATION) {
                        return socket.emit("error");
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
                return socket.emit("error");
            }
        }
        else {
            if (frame.final !== 1) {
                return socket.emit("error");
            }
            if (frame.payload.length > 125) {
                return socket.emit("error");
            }
            if (frame.opcode === frames.WebSocketFrameType.CLOSE) {
                socket.write(frames.encodeFrame(Object.assign(Object.assign({}, frame), { masked: 0 })), () => {
                    return socket.end();
                });
            }
            else if (frame.opcode === frames.WebSocketFrameType.PING) {
                socket.write(frames.encodeFrame(Object.assign(Object.assign({}, frame), { opcode: 0x0A, masked: 0 })));
            }
            else if (frame.opcode === frames.WebSocketFrameType.PONG) {
            }
            else {
                return socket.emit("error");
            }
        }
    }
    addEventListener(type, listener) {
        this.listeners.addObserver(type, listener);
    }
    removeEventListener(type, listener) {
        this.listeners.removeObserver(type, listener);
    }
    send(payload) {
        if (this.state !== ReadyState.OPEN) {
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
