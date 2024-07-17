import * as libcrypto from "crypto";
import * as libhttp from "http";
import * as libnet from "net";
import * as libtls from "tls";
import * as stdlib from "@joelek/ts-stdlib";
import * as frames from "./frames";
import * as is from "./is";
import * as shared from "./shared";
import * as utils from "./utils";

type UpgradeListener = (request: libhttp.IncomingMessage, socket: libnet.Socket) => void;

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

function writeResponseStatusAndHeaders(request: libhttp.IncomingMessage, socket: libnet.Socket, statusCode: number, headers?: libhttp.OutgoingHttpHeaders | libhttp.OutgoingHttpHeader[]): number {
	let lines = [
		`HTTP/${request.httpVersion} ${statusCode}`
	];
	if (headers != null) {
		if (Array.isArray(headers)) {
			for (let header of headers) {
				if (header == null) {
					continue;
				}
				if (Array.isArray(header)) {
					for (let value of header) {
						lines.push(value);
					}
				} else {
					lines.push(`${header}`);
				}
			}
		} else {
			for (let key in headers) {
				let header = headers[key];
				if (header == null) {
					continue;
				}
				if (Array.isArray(header)) {
					for (let value of header) {
						lines.push(`${key}: ${value}`);
					}
				} else {
					lines.push(`${key}: ${header}`);
				}
			}
		}
	}
	lines.push("");
	socket.write(lines.map((line) => `${line}\r\n`).join(""));
	return statusCode;
}

export class WebSocketServer {
	private pending_chunks: Map<string, Array<Buffer>>;
	private states: Map<string, shared.ReadyState>;
	private connections: utils.BiMap<string, libnet.Socket>;
	private router: stdlib.routing.MessageRouter<WebSocketServerMessageMap>;

	private writeResponseStatusAndHeaders(request: libhttp.IncomingMessage, socket: libnet.Socket): number {
		let connection_id = this.connections.key(socket);
		if (is.present(connection_id)) {
			return writeResponseStatusAndHeaders(request, socket, 400);
		}
		let major = request.httpVersionMajor;
		let minor = request.httpVersionMinor;
		if (major < 1 || (major === 1 && minor < 1)) {
			return writeResponseStatusAndHeaders(request, socket, 400);
		}
		let method = request.method;
		if (method !== "GET") {
			return writeResponseStatusAndHeaders(request, socket, 400);
		}
		let host = utils.getHeader(request, "Host");
		if (is.absent(host)) {
			return writeResponseStatusAndHeaders(request, socket, 400);
		}
		let upgrade = utils.getHeader(request, "Upgrade");
		if (is.absent(upgrade) || upgrade.toLowerCase() !== "websocket") {
			return writeResponseStatusAndHeaders(request, socket, 400);
		}
		let connection = utils.getHeader(request, "Connection");
		if (is.absent(connection) || connection.toLowerCase() !== "upgrade") {
			return writeResponseStatusAndHeaders(request, socket, 400);
		}
		let key = utils.getHeader(request, "Sec-WebSocket-Key");
		if (is.absent(key) || Buffer.from(key, "base64").length !== 16) {
			return writeResponseStatusAndHeaders(request, socket, 400);
		}
		let version = utils.getHeader(request, "Sec-WebSocket-Version");
		if (version !== "13") {
			return writeResponseStatusAndHeaders(request, socket, 426, {
				"Sec-WebSocket-Version": "13"
			});
		}
		let accept = libcrypto.createHash("sha1")
			.update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
			.digest("base64");
		return writeResponseStatusAndHeaders(request, socket, 101, {
			"Upgrade": "websocket",
			"Connection": "Upgrade",
			"Sec-WebSocket-Accept": accept
		});
	}

	private setupHandlers(socket: libnet.Socket, connection_url: string) {
		let connection_id = libcrypto.randomBytes(16).toString("hex");
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
		socket.on("error", (error) => {
			socket.end();
		});
		socket.setTimeout(0);
		this.connections.add(connection_id, socket);
		this.states.set(connection_id, shared.ReadyState.OPEN);
		this.router.route("connect", {
			connection_id,
			connection_url
		});
	}

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
					socket.end();
					return;
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

	addEventListener<K extends keyof WebSocketServerMessageMap>(type: K, listener: stdlib.routing.MessageObserver<WebSocketServerMessageMap[K]>): void {
		return this.router.addObserver(type, listener);
	}

	broadcast(payload: string | Buffer): void {
		for (let [connection_id, socket] of this.connections) {
			if (this.states.get(connection_id) === shared.ReadyState.OPEN) {
				this.send(connection_id, payload);
			}
		}
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
			if (this.writeResponseStatusAndHeaders(request, socket) === 101) {
				this.setupHandlers(socket, makeConnectionUrl(request));
			}
		};
	}

	getUpgradeHandler(): UpgradeListener {
		return (request, socket) => {
			if (this.writeResponseStatusAndHeaders(request, socket) === 101) {
				this.setupHandlers(socket, makeConnectionUrl(request));
			}
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
