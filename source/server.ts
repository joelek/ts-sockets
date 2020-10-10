import * as libcrypto from "crypto";
import * as libhttp from "http";
import * as libnet from "net";
import * as libtls from "tls";
import * as stdlib from "@joelek/ts-stdlib";
import * as frames from "./frames";
import * as is from "./is";
import * as shared from "./shared";
import * as utils from "./utils";

type WebSocketServerConnectMessage = {
	connection_id: string;
	connection_url: string;
};

type WebSocketServerDisconnectMessage = {
	connection_id: string;
	connection_url: string;
};

type WebSocketServerMessageMessage = {
	connection_id: string;
	connection_url: string;
	buffer: Buffer;
};

type WebSocketServerMessageMap = {
	"connect": WebSocketServerConnectMessage;
	"disconnect": WebSocketServerDisconnectMessage;
	"message": WebSocketServerMessageMessage;
};

function makeConnectionUrl(request: libhttp.IncomingMessage): string {
	let host = request.headers.host || "";
	let path = request.url || "/";
	let protocol = request.socket instanceof libtls.TLSSocket ? "wss:" : "ws:";
	return `${protocol}//${host}${path}`;
}

export class WebSocketServer {
	private pending_chunks: Map<string, Array<Buffer>>;
	private states: Map<string, shared.ReadyState>;
	private connections: utils.BiMap<string, libnet.Socket>;
	private router: stdlib.routing.MessageRouter<WebSocketServerMessageMap>;

	private onFrame(connection_id: string, connection_url: string, socket: libnet.Socket, frame: frames.WebSocketFrame): void {
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
					pending_chunks = new Array<Buffer>();
					this.pending_chunks.set(connection_id, pending_chunks);
				} else {
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
			} else {
				return this.close(connection_id, shared.StatusCode.PROTOCOL_ERROR);
			}
		} else {
			if (frame.final !== 1) {
				return this.close(connection_id, shared.StatusCode.PROTOCOL_ERROR);
			}
			if (frame.payload.length > 125) {
				return this.close(connection_id, shared.StatusCode.PROTOCOL_ERROR);
			}
			if (frame.opcode === frames.WebSocketFrameType.CLOSE) {
				if (this.states.get(connection_id) === shared.ReadyState.CLOSING) {
					return socket.end();
				} else {
					socket.write(frames.encodeFrame({
						...frame,
						masked: 0
					}), () => {
						return socket.end();
					});
				}
			} else if (frame.opcode === frames.WebSocketFrameType.PING) {
				socket.write(frames.encodeFrame({
					...frame,
					opcode: 0x0A,
					masked: 0
				}));
			} else if (frame.opcode === frames.WebSocketFrameType.PONG) {
			} else {
				return this.close(connection_id, shared.StatusCode.PROTOCOL_ERROR);
			}
		}
	}

	constructor() {
		this.pending_chunks = new Map<string, Array<Buffer>>();
		this.states = new Map<string, shared.ReadyState>();
		this.connections = new utils.BiMap<string, libnet.Socket>();
		this.router = new stdlib.routing.MessageRouter<WebSocketServerMessageMap>();
	}

	broadcast(payload: string | Buffer): void {
		for (let [connection_id, socket] of this.connections) {
			if (this.states.get(connection_id) === shared.ReadyState.OPEN) {
				this.send(connection_id, payload);
			}
		}
	}

	addEventListener<K extends keyof WebSocketServerMessageMap>(type: K, listener: stdlib.routing.MessageObserver<WebSocketServerMessageMap[K]>): void {
		return this.router.addObserver(type, listener);
	}

	close(connection_id: string, status?: shared.StatusCode): void {
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

	getRequestHandler(): libhttp.RequestListener {
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
						} catch (error) {
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

	removeEventListener<K extends keyof WebSocketServerMessageMap>(type: K, listener: stdlib.routing.MessageObserver<WebSocketServerMessageMap[K]>): void {
		return this.router.removeObserver(type, listener);
	}

	send(connection_id: string, payload: string | Buffer): void {
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
