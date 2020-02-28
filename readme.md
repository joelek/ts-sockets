# @joelek/ts-sockets

WebSocket server written completely in TypeScript.

## Features

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

Install this package from GitHub.

```
npm install joelek/ts-sockets
```
