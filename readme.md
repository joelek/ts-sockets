# @joelek/ts-sockets

WebSocket client and server written completely in TypeScript.

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

## Configure

Releases follow semantic versioning and release packages are published using the GitHub platform. Use the following command to install the latest release.

```
npm install joelek/ts-sockets#semver:^2
```

NB: This project currently targets TypeScript 4. Some features may not be supported for older TypeScript versions.
