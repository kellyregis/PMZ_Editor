"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { EditorCore } from "@/core";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import { mediaTimeFromSeconds, ZERO_MEDIA_TIME } from "@/wasm";

/**
 * Client-side clip importer.
 *
 * IMPORTANT: this MUST run in the browser. Project/media creation goes through
 * the EditorCore singleton + storageService, which persist to IndexedDB (project
 * + media metadata) and OPFS (binary media) — browser-only APIs with no server
 * equivalent. So we build the project here (not in a route handler): fetch the
 * clip metadata from our server proxy, download the presigned media into File
 * objects, register them as media assets, place them on the timeline, insert the
 * captions, save, and redirect into the editor.
 */

interface ClipCaption {
	text: string;
	start: number; // seconds
	duration: number; // seconds
}

interface ClipData {
	title?: string;
	video_url: string;
	duration_s?: number;
	captions?: ClipCaption[];
	music_url?: string;
}

async function urlToFile({
	url,
	name,
	fallbackType,
}: {
	url: string;
	name: string;
	fallbackType: string;
}): Promise<File> {
	const res = await fetch(url, { cache: "no-store" });
	if (!res.ok) {
		throw new Error(`Failed to download media (${res.status})`);
	}
	const blob = await res.blob();
	return new File([blob], name, { type: blob.type || fallbackType });
}

function LoadingScreen({ label }: { label: string }) {
	return (
		<div className="bg-background flex h-screen w-screen flex-col items-center justify-center gap-4 text-center">
			<Loader2 className="text-muted-foreground size-6 animate-spin" />
			<p className="text-muted-foreground text-sm">{label}</p>
		</div>
	);
}

export default function ImportPage() {
	// useSearchParams must be inside a Suspense boundary or `next build` fails
	// at prerender time (this is a build error, not a type error).
	return (
		<Suspense fallback={<LoadingScreen label="Preparando importação…" />}>
			<ImportRunner />
		</Suspense>
	);
}

function ImportRunner() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [status, setStatus] = useState("Preparando importação…");
	const [error, setError] = useState<string | null>(null);
	const startedRef = useRef(false);

	useEffect(() => {
		if (startedRef.current) return;
		startedRef.current = true;

		const clipId = searchParams.get("clip_id");
		const kind = searchParams.get("kind") === "merge" ? "merge" : "clip";

		if (!clipId) {
			router.replace("/projects");
			return;
		}

		const run = async () => {
			try {
				setStatus("Buscando dados do clipe…");
				const res = await fetch(
					`/api/import/clip-data?clip_id=${encodeURIComponent(
						clipId,
					)}&kind=${kind}`,
					{ cache: "no-store" },
				);
				if (res.status === 401) {
					// Session missing/expired — bounce back through SSO/app.
					window.location.href = "/api/auth/sso";
					return;
				}
				if (!res.ok) {
					throw new Error(`Não foi possível carregar o clipe (${res.status})`);
				}
				const data = (await res.json()) as ClipData;

				const editor = EditorCore.getInstance();

				setStatus("Criando projeto…");
				const title = data.title?.trim() || "Clipe importado";
				const projectId = await editor.project.createNewProject({
					name: title,
				});

				const safeName = title.replace(/[^a-zA-Z0-9._ -]/g, "_");

				// --- Video (main track) ---
				setStatus("Baixando vídeo…");
				const videoFile = await urlToFile({
					url: data.video_url,
					name: `${safeName}.mp4`,
					fallbackType: "video/mp4",
				});
				setStatus("Processando vídeo…");
				const [videoAsset] = await processMediaAssets({ files: [videoFile] });
				if (videoAsset) {
					const savedVideo = await editor.media.addMediaAsset({
						projectId,
						asset: videoAsset,
					});
					if (savedVideo) {
						const duration =
							savedVideo.duration != null
								? mediaTimeFromSeconds({ seconds: savedVideo.duration })
								: mediaTimeFromSeconds({ seconds: data.duration_s ?? 5 });
						editor.timeline.insertElement({
							element: buildElementFromMedia({
								mediaId: savedVideo.id,
								mediaType: "video",
								name: savedVideo.name,
								duration,
								startTime: ZERO_MEDIA_TIME,
							}),
							placement: { mode: "auto" },
						});
					}
				}

				// --- Music (audio track), optional ---
				if (data.music_url) {
					setStatus("Baixando música…");
					try {
						const musicFile = await urlToFile({
							url: data.music_url,
							name: `${safeName}-music.mp3`,
							fallbackType: "audio/mpeg",
						});
						const [musicAsset] = await processMediaAssets({
							files: [musicFile],
						});
						if (musicAsset) {
							const savedMusic = await editor.media.addMediaAsset({
								projectId,
								asset: musicAsset,
							});
							if (savedMusic) {
								const duration =
									savedMusic.duration != null
										? mediaTimeFromSeconds({ seconds: savedMusic.duration })
										: mediaTimeFromSeconds({ seconds: 5 });
								editor.timeline.insertElement({
									element: buildElementFromMedia({
										mediaId: savedMusic.id,
										mediaType: "audio",
										name: savedMusic.name,
										duration,
										startTime: ZERO_MEDIA_TIME,
									}),
									placement: { mode: "auto" },
								});
							}
						}
					} catch (musicError) {
						// Music is optional — don't fail the whole import.
						console.error("Failed to import music track:", musicError);
					}
				}

				// --- Captions (text track) ---
				if (data.captions && data.captions.length > 0) {
					setStatus("Inserindo legendas…");
					insertCaptionChunksAsTextTrack({
						editor,
						captions: data.captions.map((c) => ({
							text: c.text,
							startTime: c.start,
							duration: c.duration,
						})),
					});
				}

				setStatus("Salvando…");
				await editor.project.saveCurrentProject();

				router.replace(`/editor/${projectId}`);
			} catch (err) {
				console.error("Clip import failed:", err);
				setError(
					err instanceof Error ? err.message : "Falha ao importar o clipe",
				);
			}
		};

		void run();
	}, [router, searchParams]);

	return (
		<div className="bg-background flex h-screen w-screen flex-col items-center justify-center gap-4 text-center">
			{error ? (
				<>
					<p className="text-destructive text-sm">{error}</p>
					<button
						type="button"
						className="text-muted-foreground text-xs underline"
						onClick={() => router.replace("/projects")}
					>
						Ir para meus projetos
					</button>
				</>
			) : (
				<>
					<Loader2 className="text-muted-foreground size-6 animate-spin" />
					<p className="text-muted-foreground text-sm">{status}</p>
				</>
			)}
		</div>
	);
}
