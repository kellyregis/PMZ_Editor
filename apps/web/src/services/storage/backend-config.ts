/**
 * Storage mode flag.
 *
 * NEXT_PUBLIC_STORAGE_BACKEND is a build-time (NEXT_PUBLIC → inlined) flag read
 * on the client. When it equals "backend", projects (and media binaries) are
 * persisted to the pmz-clipper backend via the same-origin proxy routes under
 * /api/editor-storage. Any other value (default: unset) keeps the original
 * local IndexedDB/OPFS behaviour untouched.
 */
export const EDITOR_STORAGE_BASE = "/api/editor-storage";

export function getStorageBackendMode(): string {
	return process.env.NEXT_PUBLIC_STORAGE_BACKEND ?? "";
}

export function isBackendStorage(): boolean {
	return getStorageBackendMode() === "backend";
}
