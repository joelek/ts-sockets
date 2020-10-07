import * as libhttp from "http";
import * as is from "./is";

export function getHeader(request: libhttp.IncomingMessage, key: string): string | null {
	let values = request.headers[key.toLowerCase()];
	if (is.present(values)) {
		if (values.constructor === String) {
			return values as string;
		}
		if (values.constructor === Array && values.length === 1) {
			return values[0];
		}
	}
	return null;
};

export type State = {
	buffer: Buffer,
	offset: number
};

export class BiMap<A, B> {
	private value_to_key: Map<B, A>;
	private key_to_value: Map<A, B>;

	constructor() {
		this.value_to_key = new Map<B, A>();
		this.key_to_value = new Map<A, B>();
	}

	add(key: A, value: B): void {
		this.value_to_key.set(value, key);
		this.key_to_value.set(key, value);
	}

	key(value: B): A | null {
		return this.value_to_key.get(value) || null;
	}

	remove(key: A): void {
		let value = this.key_to_value.get(key);
		if (is.present(value)) {
			this.value_to_key.delete(value);
		}
		this.key_to_value.delete(key);
	}

	value(key: A): B | null {
		return this.key_to_value.get(key) || null;
	}
};
