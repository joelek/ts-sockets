"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.client = require("./client");
exports.frames = require("./frames");
exports.server = require("./server");
var client_1 = require("./client");
Object.defineProperty(exports, "WebSocketClient", { enumerable: true, get: function () { return client_1.WebSocketClient; } });
var server_1 = require("./server");
Object.defineProperty(exports, "WebSocketServer", { enumerable: true, get: function () { return server_1.WebSocketServer; } });
