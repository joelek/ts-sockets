/// <reference types="node" />
/// <reference types="node" />
import * as libhttp from "http";
export declare function getHeader(request: libhttp.IncomingMessage, key: string): string | null;
export type State = {
    buffer: Buffer;
    offset: number;
};
export declare class BiMap<A, B> {
    private value_to_key;
    private key_to_value;
    constructor();
    [Symbol.iterator](): Iterator<[A, B]>;
    add(key: A, value: B): void;
    key(value: B): A | null;
    remove(key: A): void;
    value(key: A): B | null;
}
