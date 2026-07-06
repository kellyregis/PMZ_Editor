import type { EditorCore } from "@/core";
import { mediaTimeToSeconds } from "@/wasm";

/**
 * Compact, model-friendly snapshot of the active scene, built CLIENT-SIDE and
 * POSTed to /api/ai. It must be built in the browser because the timeline lives
 * in the EditorCore singleton (browser-only); the server route has no access to
 * it. All times are in SECONDS. Element ids are the stable handles the model
 * uses to target operations (trim/delete/set_caption_text).
 */
export interface SceneSnapshotCaption {
	element_id: string;
	text: string;
	start_s: number;
	duration_s: number;
}

export interface SceneSnapshotClip {
	element_id: string;
	type: string; // "video" | "image" | "audio" | "graphic" | ...
	start_s: number;
	duration_s: number;
}

export interface SceneSnapshot {
	duration_s: number;
	captions: SceneSnapshotCaption[];
	clips: SceneSnapshotClip[];
}

function round(n: number): number {
	return Math.round(n * 1000) / 1000;
}

export function buildSceneSnapshot({
	editor,
}: {
	editor: EditorCore;
}): SceneSnapshot | null {
	const active = editor.project.getActiveOrNull();
	if (!active) return null;

	const tracks = editor.scenes.getActiveScene().tracks;
	const captions: SceneSnapshotCaption[] = [];
	const clips: SceneSnapshotClip[] = [];

	for (const track of [...tracks.overlay, tracks.main, ...tracks.audio]) {
		for (const element of track.elements) {
			const start_s = round(mediaTimeToSeconds({ time: element.startTime }));
			const duration_s = round(mediaTimeToSeconds({ time: element.duration }));
			if (element.type === "text") {
				captions.push({
					element_id: element.id,
					text: String(element.params.content ?? ""),
					start_s,
					duration_s,
				});
			} else {
				clips.push({
					element_id: element.id,
					type: element.type,
					start_s,
					duration_s,
				});
			}
		}
	}

	return {
		duration_s: round(mediaTimeToSeconds({ time: active.metadata.duration })),
		captions,
		clips,
	};
}
