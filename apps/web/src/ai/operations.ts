import type { EditorCore } from "@/core";
import {
	AddTrackCommand,
	BatchCommand,
	type Command,
	DeleteElementsCommand,
	InsertElementCommand,
	SplitElementsCommand,
	UpdateElementsCommand,
} from "@/commands";
import type { SceneTracks, TimelineElement } from "@/timeline";
import { getElementsAtTime } from "@/timeline";
import { buildSubtitleTextElement } from "@/subtitles/build-subtitle-text-element";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	roundMediaTime,
} from "@/wasm";

/**
 * AI operations returned by the clipper backend, applied to the timeline via the
 * EditorCore command pattern. Every op is validated against the CURRENT scene
 * (ids must exist) before a command is built; invalid ops are dropped with a
 * warning. All commands are wrapped in ONE BatchCommand → single undo step.
 * Times are in SECONDS (converted to MediaTime ticks here).
 */
export type AiOperation =
	| { op: "split"; at_s: number; element_id?: string }
	| { op: "trim"; element_id: string; new_start_s?: number; new_end_s?: number }
	| { op: "delete"; element_id: string }
	| { op: "add_caption"; text: string; start_s: number; duration_s: number }
	| { op: "set_caption_text"; element_id: string; text: string };

interface ElementLoc {
	trackId: string;
	element: TimelineElement;
}

function indexElements(tracks: SceneTracks): Map<string, ElementLoc> {
	const map = new Map<string, ElementLoc>();
	for (const track of [...tracks.overlay, tracks.main, ...tracks.audio]) {
		for (const element of track.elements) {
			map.set(element.id, { trackId: track.id, element });
		}
	}
	return map;
}

export function applyAiOperations({
	editor,
	operations,
}: {
	editor: EditorCore;
	operations: AiOperation[];
}): { applied: number; warnings: string[] } {
	const warnings: string[] = [];

	const active = editor.project.getActiveOrNull();
	if (!active) {
		return { applied: 0, warnings: ["Nenhum projeto ativo."] };
	}
	if (!Array.isArray(operations) || operations.length === 0) {
		return { applied: 0, warnings: ["A IA não retornou operações."] };
	}

	const tracks = editor.scenes.getActiveScene().tracks;
	const index = indexElements(tracks);

	const commands: Command[] = [];
	const updates: Array<{
		trackId: string;
		elementId: string;
		patch: Partial<TimelineElement>;
	}> = [];
	const deletes: Array<{ trackId: string; elementId: string }> = [];
	const captionInserts: Array<{
		text: string;
		startTime: number;
		duration: number;
	}> = [];

	for (const op of operations) {
		switch (op?.op) {
			case "split": {
				const splitTime = roundMediaTime({
					time: mediaTimeFromSeconds({ seconds: op.at_s }),
				});
				let elements: { trackId: string; elementId: string }[];
				if (op.element_id) {
					const loc = index.get(op.element_id);
					if (!loc) {
						warnings.push(`split: elemento ${op.element_id} não existe`);
						continue;
					}
					elements = [{ trackId: loc.trackId, elementId: op.element_id }];
				} else {
					elements = getElementsAtTime({ tracks, time: splitTime });
				}
				if (elements.length === 0) {
					warnings.push(`split: nenhum elemento em ${op.at_s}s`);
					continue;
				}
				commands.push(new SplitElementsCommand({ elements, splitTime }));
				break;
			}
			case "trim": {
				const loc = index.get(op.element_id);
				if (!loc) {
					warnings.push(`trim: elemento ${op.element_id} não existe`);
					continue;
				}
				const patch: Partial<TimelineElement> = {};
				if (typeof op.new_start_s === "number") {
					patch.startTime = mediaTimeFromSeconds({ seconds: op.new_start_s });
				}
				if (typeof op.new_end_s === "number") {
					const baseStartS =
						typeof op.new_start_s === "number"
							? op.new_start_s
							: mediaTimeToSeconds({ time: loc.element.startTime });
					const durationS = op.new_end_s - baseStartS;
					if (durationS > 0) {
						patch.duration = mediaTimeFromSeconds({ seconds: durationS });
					}
				}
				if (Object.keys(patch).length === 0) {
					warnings.push(`trim: nada a alterar em ${op.element_id}`);
					continue;
				}
				updates.push({
					trackId: loc.trackId,
					elementId: op.element_id,
					patch,
				});
				break;
			}
			case "delete": {
				const loc = index.get(op.element_id);
				if (!loc) {
					warnings.push(`delete: elemento ${op.element_id} não existe`);
					continue;
				}
				deletes.push({ trackId: loc.trackId, elementId: op.element_id });
				break;
			}
			case "set_caption_text": {
				const loc = index.get(op.element_id);
				if (!loc) {
					warnings.push(
						`set_caption_text: elemento ${op.element_id} não existe`,
					);
					continue;
				}
				if (loc.element.type !== "text") {
					warnings.push(`set_caption_text: ${op.element_id} não é legenda`);
					continue;
				}
				updates.push({
					trackId: loc.trackId,
					elementId: op.element_id,
					// params is shallow-merged by the update pipeline, so patching
					// only `content` preserves all other style params.
					patch: { params: { content: op.text } } as Partial<TimelineElement>,
				});
				break;
			}
			case "add_caption": {
				if (
					!op.text ||
					typeof op.start_s !== "number" ||
					typeof op.duration_s !== "number"
				) {
					warnings.push("add_caption: dados inválidos");
					continue;
				}
				captionInserts.push({
					text: op.text,
					startTime: op.start_s,
					duration: op.duration_s,
				});
				break;
			}
			default:
				warnings.push(`operação desconhecida: ${JSON.stringify(op)}`);
		}
	}

	if (updates.length > 0) {
		commands.push(new UpdateElementsCommand({ updates }));
	}
	if (deletes.length > 0) {
		commands.push(new DeleteElementsCommand({ elements: deletes }));
	}
	if (captionInserts.length > 0) {
		const canvasSize = active.settings.canvasSize;
		const addTrack = new AddTrackCommand({ type: "text", index: 0 });
		const trackId = addTrack.getTrackId();
		commands.push(addTrack);
		captionInserts.forEach((caption, i) => {
			commands.push(
				new InsertElementCommand({
					placement: { mode: "explicit", trackId },
					element: buildSubtitleTextElement({ index: i, caption, canvasSize }),
				}),
			);
		});
	}

	if (commands.length === 0) {
		return { applied: 0, warnings };
	}

	editor.command.execute({ command: new BatchCommand(commands) });
	return { applied: commands.length, warnings };
}
