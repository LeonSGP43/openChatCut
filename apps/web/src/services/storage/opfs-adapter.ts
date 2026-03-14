import type { StorageAdapter } from "./types";

type NavigatorWithOPFS = Navigator & {
	storage?: StorageManager & {
		getDirectory?: () => Promise<FileSystemDirectoryHandle>;
	};
};

type FallbackFileRecord = {
	id: string;
	file: File | Blob;
	name?: string;
	type?: string;
	lastModified?: number;
};

export class OPFSAdapter implements StorageAdapter<File> {
	private directoryName: string;
	private fallbackDbName: string;
	private static readonly FALLBACK_STORE_NAME = "files";

	constructor(directoryName = "media") {
		this.directoryName = directoryName;
		this.fallbackDbName = `video-editor-opfs-fallback-${directoryName}`;
	}

	private getStorageManager():
		| (StorageManager & {
				getDirectory: () => Promise<FileSystemDirectoryHandle>;
		  })
		| null {
		if (typeof navigator === "undefined") return null;
		const storage = (navigator as NavigatorWithOPFS).storage;
		if (!storage || typeof storage.getDirectory !== "function") {
			return null;
		}
		return storage as StorageManager & {
			getDirectory: () => Promise<FileSystemDirectoryHandle>;
		};
	}

	private shouldUseFallback(): boolean {
		return this.getStorageManager() === null;
	}

	private isRecoverableOPFSError(error: unknown): boolean {
		const name = (error as { name?: string } | null)?.name;
		return (
			name === "TypeError" ||
			name === "NotSupportedError" ||
			name === "SecurityError" ||
			name === "InvalidStateError"
		);
	}

	private async getFallbackDB(): Promise<IDBDatabase> {
		if (typeof indexedDB === "undefined") {
			throw new Error(
				"Neither OPFS nor IndexedDB is available in this environment.",
			);
		}

		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.fallbackDbName, 1);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result);
			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(OPFSAdapter.FALLBACK_STORE_NAME)) {
					db.createObjectStore(OPFSAdapter.FALLBACK_STORE_NAME, {
						keyPath: "id",
					});
				}
			};
		});
	}

	private fallbackRecordToFile({
		key,
		record,
	}: {
		key: string;
		record: FallbackFileRecord | null | undefined;
	}): File | null {
		if (!record) return null;
		if (record.file instanceof File) return record.file;
		if (record.file instanceof Blob) {
			return new File([record.file], record.name ?? key, {
				type: record.type ?? record.file.type,
				lastModified: record.lastModified ?? Date.now(),
			});
		}
		return null;
	}

	private async getFromFallback(key: string): Promise<File | null> {
		const db = await this.getFallbackDB();
		const transaction = db.transaction([OPFSAdapter.FALLBACK_STORE_NAME], "readonly");
		const store = transaction.objectStore(OPFSAdapter.FALLBACK_STORE_NAME);

		return new Promise((resolve, reject) => {
			const request = store.get(key);
			request.onerror = () => reject(request.error);
			request.onsuccess = () =>
				resolve(
					this.fallbackRecordToFile({
						key,
						record: request.result as FallbackFileRecord | null | undefined,
					}),
				);
		});
	}

	private async setToFallback({
		key,
		file,
	}: {
		key: string;
		file: File;
	}): Promise<void> {
		const db = await this.getFallbackDB();
		const transaction = db.transaction([OPFSAdapter.FALLBACK_STORE_NAME], "readwrite");
		const store = transaction.objectStore(OPFSAdapter.FALLBACK_STORE_NAME);
		const payload: FallbackFileRecord = {
			id: key,
			file,
			name: file.name,
			type: file.type,
			lastModified: file.lastModified,
		};

		return new Promise((resolve, reject) => {
			const request = store.put(payload);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	private async removeFromFallback(key: string): Promise<void> {
		const db = await this.getFallbackDB();
		const transaction = db.transaction([OPFSAdapter.FALLBACK_STORE_NAME], "readwrite");
		const store = transaction.objectStore(OPFSAdapter.FALLBACK_STORE_NAME);

		return new Promise((resolve, reject) => {
			const request = store.delete(key);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	private async listFromFallback(): Promise<string[]> {
		const db = await this.getFallbackDB();
		const transaction = db.transaction([OPFSAdapter.FALLBACK_STORE_NAME], "readonly");
		const store = transaction.objectStore(OPFSAdapter.FALLBACK_STORE_NAME);

		return new Promise((resolve, reject) => {
			const request = store.getAllKeys();
			request.onerror = () => reject(request.error);
			request.onsuccess = () =>
				resolve((request.result as IDBValidKey[]).map((key) => String(key)));
		});
	}

	private async clearFallback(): Promise<void> {
		const db = await this.getFallbackDB();
		const transaction = db.transaction([OPFSAdapter.FALLBACK_STORE_NAME], "readwrite");
		const store = transaction.objectStore(OPFSAdapter.FALLBACK_STORE_NAME);

		return new Promise((resolve, reject) => {
			const request = store.clear();
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	private async getDirectory(): Promise<FileSystemDirectoryHandle> {
		const storage = this.getStorageManager();
		if (!storage) {
			throw new Error("OPFS is not supported in this environment.");
		}

		const opfsRoot = await storage.getDirectory();
		return await opfsRoot.getDirectoryHandle(this.directoryName, {
			create: true,
		});
	}

	async get(key: string): Promise<File | null> {
		if (this.shouldUseFallback()) {
			return await this.getFromFallback(key);
		}

		try {
			const directory = await this.getDirectory();
			const fileHandle = await directory.getFileHandle(key);
			return await fileHandle.getFile();
		} catch (error) {
			if ((error as Error).name === "NotFoundError") {
				return null;
			}
			if (this.isRecoverableOPFSError(error)) {
				return await this.getFromFallback(key);
			}
			throw error;
		}
	}

	async set(key: string, file: File): Promise<void> {
		if (this.shouldUseFallback()) {
			await this.setToFallback({ key, file });
			return;
		}

		try {
			const directory = await this.getDirectory();
			const fileHandle = await directory.getFileHandle(key, { create: true });
			const writable = await fileHandle.createWritable();

			await writable.write(file);
			await writable.close();
		} catch (error) {
			if (this.isRecoverableOPFSError(error)) {
				await this.setToFallback({ key, file });
				return;
			}
			throw error;
		}
	}

	async remove(key: string): Promise<void> {
		if (this.shouldUseFallback()) {
			await this.removeFromFallback(key);
			return;
		}

		try {
			const directory = await this.getDirectory();
			await directory.removeEntry(key);
		} catch (error) {
			if ((error as Error).name !== "NotFoundError") {
				if (this.isRecoverableOPFSError(error)) {
					await this.removeFromFallback(key);
					return;
				}
				throw error;
			}
		}
	}

	async list(): Promise<string[]> {
		if (this.shouldUseFallback()) {
			return await this.listFromFallback();
		}

		try {
			const directory = await this.getDirectory();
			const keys: string[] = [];

			for await (const name of directory.keys()) {
				keys.push(name);
			}

			return keys;
		} catch (error) {
			if (this.isRecoverableOPFSError(error)) {
				return await this.listFromFallback();
			}
			throw error;
		}
	}

	async clear(): Promise<void> {
		if (this.shouldUseFallback()) {
			await this.clearFallback();
			return;
		}

		try {
			const directory = await this.getDirectory();

			for await (const name of directory.keys()) {
				await directory.removeEntry(name);
			}
		} catch (error) {
			if (this.isRecoverableOPFSError(error)) {
				await this.clearFallback();
				return;
			}
			throw error;
		}
	}

	// Helper method to check OPFS support
	static isSupported(): boolean {
		if (typeof navigator === "undefined") return false;
		const storage = (navigator as NavigatorWithOPFS).storage;
		return typeof storage?.getDirectory === "function";
	}
}
