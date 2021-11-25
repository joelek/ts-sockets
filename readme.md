# @joelek/ts-sockets

WebSocket client and server for NodeJS written completely in TypeScript.

## Features

### Client

The client can connect to both secure and normal WebSocket servers. The correct transport is selected based on the protocol specified in the URL.

```ts
import { WebSocketClient } from "@joelek/ts-sockets";

let secure = new WebSocketClient("wss:/localhost/some/path");
let normal = new WebSocketClient("ws:/localhost/some/path");
```

The client supports adding and removing of strongly-typed event listeners through the `.addEventListener()` and `.removeEventListener()` methods.

```ts
client.addEventListener("close", (event) => {
	process.stdout.write("close\n");
});

client.addEventListener("error", (event) => {
	process.stdout.write("error\n");
});

client.addEventListener("message", (event) => {
	process.stdout.write("message: " + event.data + "\n");
});

client.addEventListener("open", (event) => {
	process.stdout.write("open\n");
});
```

The client supports sending text or binary messages using the `.send()` method. Text messages are encoded using UTF-8 as defined in the WebSocket specification.

```ts
client.send("räksmörgås");
```

### Server

The server handles all upgrade requests as defined in version 13 of the WebSocket protocol. It can be attached to an existing HTTP or HTTPS server through the `.getRequestHandler()` method.

```ts
import * as libhttp from "http";
import { WebSocketServer } from "@joelek/ts-sockets";

let server = new WebSocketServer();
libhttp.createServer(server.getRequestHandler()).listen();
```

The server supports adding and removing of strongly-typed event listeners through the `.addEventListener()` and `.removeEventListener()` methods. You can easily keep track of active connections and sessions using the `connection_id` member attached to each event emitted.

```ts
let connections = new Set<string>();

server.addEventListener("connect", (event) => {
	let connection_id = event.connection_id;
	process.stdout.write("connect: " + connection_id + "\n");
	connections.add(connection_id);
});

server.addEventListener("disconnect", (event) => {
	let connection_id = event.connection_id;
	process.stdout.write("disconnect: " + connection_id + "\n");
	connections.delete(connection_id);
});

server.addEventListener("message", (event) => {
	let connection_id = event.connection_id;
	process.stdout.write("message: " + connection_id + "\n");
});
```

The server supports sending text or binary messages using the `.send()` method. Text messages are encoded using UTF-8 as defined in the WebSocket specification.

```ts
server.send(connection_id, "räksmörgås");
```

## Sponsorship

The continued development of this software depends on your sponsorship. Please consider sponsoring this project if you find that the software creates value for you and your organization.

The sponsor button can be used to view the different sponsoring options. Contributions of all sizes are welcome.

Thank you for your support!

### Ethereum

Ethereum contributions can be made to address `0xf1B63d95BEfEdAf70B3623B1A4Ba0D9CE7F2fE6D`.

![](./eth.png)

## Installation

Releases follow semantic versioning and release packages are published using the GitHub platform. Use the following command to install the latest release.

```
npm install joelek/ts-sockets#semver:^2.2
```

Use the following command to install the very latest build. The very latest build may include breaking changes and should not be used in production environments.

```
npm install joelek/ts-sockets#master
```

NB: This project targets TypeScript 4 in strict mode.
