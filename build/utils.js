"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BiMap = exports.getHeader = void 0;
const is = require("./is");
function getHeader(request, key) {
    let values = request.headers[key.toLowerCase()];
    if (is.present(values)) {
        if (values.constructor === String) {
            return values;
        }
        if (values.constructor === Array && values.length === 1) {
            return values[0];
        }
    }
    return null;
}
exports.getHeader = getHeader;
;
class BiMap {
    constructor() {
        this.value_to_key = new Map();
        this.key_to_value = new Map();
    }
    [Symbol.iterator]() {
        return this.key_to_value[Symbol.iterator]();
    }
    add(key, value) {
        this.value_to_key.set(value, key);
        this.key_to_value.set(key, value);
    }
    key(value) {
        return this.value_to_key.get(value) || null;
    }
    remove(key) {
        let value = this.key_to_value.get(key);
        if (is.present(value)) {
            this.value_to_key.delete(value);
        }
        this.key_to_value.delete(key);
    }
    value(key) {
        return this.key_to_value.get(key) || null;
    }
}
exports.BiMap = BiMap;
;
