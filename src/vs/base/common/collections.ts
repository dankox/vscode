/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * An interface for a JavaScript object that
 * acts a dictionary. The keys are strings.
 */
export type IStringDictionary<V> = Record<string, V>;


/**
 * An interface for a JavaScript object that
 * acts a dictionary. The keys are numbers.
 */
export type INumberDictionary<V> = Record<number, V>;

const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * Returns an array which contains all values that reside
 * in the given dictionary.
 */
export function values<T>(from: IStringDictionary<T> | INumberDictionary<T>): T[] {
	const result: T[] = [];
	for (const key in from) {
		if (hasOwnProperty.call(from, key)) {
			result.push((from as any)[key]);
		}
	}
	return result;
}

/**
 * Iterates over each entry in the provided dictionary. The iterator will stop when the callback returns `false`.
 *
 * @deprecated Use `Object.entries(x)` with a `for...of` loop.
 */
export function forEach<T>(from: IStringDictionary<T> | INumberDictionary<T>, callback: (entry: { key: any; value: T }) => any): void {
	for (const [key, value] of Object.entries(from)) {
		const result = callback({ key, value });
		if (result === false) {
			return;
		}
	}
}

/**
 * Groups the collection into a dictionary based on the provided
 * group function.
 */
export function groupBy<K extends string | number | symbol, V>(data: V[], groupFn: (element: V) => K): Record<K, V[]> {
	const result: Record<K, V[]> = Object.create(null);
	for (const element of data) {
		const key = groupFn(element);
		let target = result[key];
		if (!target) {
			target = result[key] = [];
		}
		target.push(element);
	}
	return result;
}

export function fromMap<T>(original: Map<string, T>): IStringDictionary<T> {
	const result: IStringDictionary<T> = Object.create(null);
	if (original) {
		original.forEach((value, key) => {
			result[key] = value;
		});
	}
	return result;
}

export function diffSets<T>(before: Set<T>, after: Set<T>): { removed: T[]; added: T[] } {
	const removed: T[] = [];
	const added: T[] = [];
	for (const element of before) {
		if (!after.has(element)) {
			removed.push(element);
		}
	}
	for (const element of after) {
		if (!before.has(element)) {
			added.push(element);
		}
	}
	return { removed, added };
}

export function diffMaps<K, V>(before: Map<K, V>, after: Map<K, V>): { removed: V[]; added: V[] } {
	const removed: V[] = [];
	const added: V[] = [];
	for (const [index, value] of before) {
		if (!after.has(index)) {
			removed.push(value);
		}
	}
	for (const [index, value] of after) {
		if (!before.has(index)) {
			added.push(value);
		}
	}
	return { removed, added };
}
export class SetMap<K, V> {

	private map = new Map<K, Set<V>>();

	add(key: K, value: V): void {
		let values = this.map.get(key);

		if (!values) {
			values = new Set<V>();
			this.map.set(key, values);
		}

		values.add(value);
	}

	delete(key: K, value: V): void {
		const values = this.map.get(key);

		if (!values) {
			return;
		}

		values.delete(value);

		if (values.size === 0) {
			this.map.delete(key);
		}
	}

	forEach(key: K, fn: (value: V) => void): void {
		const values = this.map.get(key);

		if (!values) {
			return;
		}

		values.forEach(fn);
	}
}
