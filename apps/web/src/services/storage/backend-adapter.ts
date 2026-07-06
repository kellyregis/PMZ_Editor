import type { ProjectStorageAdapter } from "./types";
import { EDITOR_STORAGE_BASE } from "./backend-config";

/**
 * Projects storage backed by the pmz-clipper backend (via the same-origin
 * /api/editor-storage proxy, which injects the server-only bearer secret).
 * Implements ProjectStorageAdapter so it is a drop-in replacement for the
 * IndexedDB projects adapter.
 *
 * Backend project shape: { id, name, data_json, updated_at }, where data_json
 * is the SerializedProject payload we store/load.
 */
interface BackendProjectRow<T> {
	id: string;
	name?: string;
	data_json: T;
	updated_at?: string;
}

export class BackendStorageAdapter<T> implements ProjectStorageAdapter<T> {
	private readonly base = `${EDITOR_STORAGE_BASE}/projects`;

	async get(key: string): Promise<T | null> {
		const res = await fetch(`${this.base}/${encodeURIComponent(key)}`, {
			cache: "no-store",
		});
		if (res.status === 404) return null;
		if (!res.ok) {
			throw new Error(`Backend project get failed (${res.status})`);
		}
		const row = (await res.json()) as BackendProjectRow<T> | null;
		return row?.data_json ?? null;
	}

	async set({ key, value }: { key: string; value: T }): Promise<void> {
		const name =
			(value as { metadata?: { name?: string } })?.metadata?.name ??
			"Untitled Project";
		const res = await fetch(`${this.base}/${encodeURIComponent(key)}`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ id: key, name, data_json: value }),
		});
		if (!res.ok) {
			throw new Error(`Backend project set failed (${res.status})`);
		}
	}

	async remove(key: string): Promise<void> {
		const res = await fetch(`${this.base}/${encodeURIComponent(key)}`, {
			method: "DELETE",
		});
		if (!res.ok && res.status !== 404) {
			throw new Error(`Backend project remove failed (${res.status})`);
		}
	}

	async list(): Promise<string[]> {
		const rows = await this.fetchAll();
		return rows.map((row) => row.id);
	}

	async getAll(): Promise<T[]> {
		const rows = await this.fetchAll();
		return rows
			.map((row) => row.data_json)
			.filter((value): value is T => value != null);
	}

	async clear(): Promise<void> {
		const ids = await this.list();
		await Promise.all(ids.map((id) => this.remove(id)));
	}

	private async fetchAll(): Promise<BackendProjectRow<T>[]> {
		const res = await fetch(this.base, { cache: "no-store" });
		if (!res.ok) {
			throw new Error(`Backend project list failed (${res.status})`);
		}
		const data = await res.json();
		if (Array.isArray(data)) return data as BackendProjectRow<T>[];
		if (Array.isArray(data?.projects)) {
			return data.projects as BackendProjectRow<T>[];
		}
		return [];
	}
}

/**
 * Upload a media File to the backend (MinIO) via the proxy. Returns the stored
 * URL (and optional backend id). The File is sent as multipart/form-data.
 */
export async function uploadBackendMedia({
	file,
}: {
	file: File;
}): Promise<{ id?: string; url: string }> {
	const form = new FormData();
	form.append("file", file, file.name);

	const res = await fetch(`${EDITOR_STORAGE_BASE}/media`, {
		method: "POST",
		body: form,
	});
	if (!res.ok) {
		throw new Error(`Backend media upload failed (${res.status})`);
	}
	const data = (await res.json()) as { id?: string; url?: string };
	if (!data?.url) {
		throw new Error("Backend media upload returned no url");
	}
	return { id: data.id, url: data.url };
}

/**
 * Fetch a media binary from a backend/MinIO URL and materialize it as a File.
 * The URL is presigned/public, so the browser fetches it directly.
 */
export async function fetchBackendMediaFile({
	url,
	name,
	type,
}: {
	url: string;
	name: string;
	type?: string;
}): Promise<File> {
	const res = await fetch(url, { cache: "no-store" });
	if (!res.ok) {
		throw new Error(`Backend media fetch failed (${res.status})`);
	}
	const blob = await res.blob();
	return new File([blob], name, { type: type || blob.type });
}
