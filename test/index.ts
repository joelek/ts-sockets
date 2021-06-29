import * as libhttp from "http";
import * as sockets from "../source/node";

let server = new sockets.WebSocketServer();

server.addEventListener("connect", (message) => {
	console.log("server connect:", message);
	server.send(message.connection_id, "server says hi!");
});

server.addEventListener("disconnect", (message) => {
	console.log("server disconnect:", message);
});

server.addEventListener("message", (message) => {
	console.log("server message:", message);
	server.close(message.connection_id);
});

let http = libhttp.createServer(server.getRequestHandler()).listen(80);

let client = new sockets.WebSocketClient("ws://localhost/");

client.addEventListener("close", (message) => {
	console.log("client close:", message);
	http.close();
});

client.addEventListener("error", (message) => {
	console.log("client error:", message);
});

client.addEventListener("message", (message) => {
	console.log("client message:", message);
});

client.addEventListener("open", (message) => {
	console.log("client open:", message);
	client.send("client says hi!")
});
