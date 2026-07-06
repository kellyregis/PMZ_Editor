"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Section, SectionContent } from "@/components/section";
import { Separator } from "@/components/ui/separator";
import { useEditor } from "@/editor/use-editor";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import { buildSceneSnapshot } from "@/ai/scene-snapshot";
import { applyAiOperations, type AiOperation } from "@/ai/operations";

interface AiResponse {
	message?: string;
	operations?: AiOperation[];
}

export function AIView() {
	const editor = useEditor();
	const [prompt, setPrompt] = useState("");
	const [lang, setLang] = useState("en");
	const [busy, setBusy] = useState<null | "apply" | "translate">(null);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [warnings, setWarnings] = useState<string[]>([]);

	const run = async ({
		kind,
		body,
	}: {
		kind: "apply" | "translate";
		body: Record<string, unknown>;
	}) => {
		setBusy(kind);
		setError(null);
		setMessage(null);
		setWarnings([]);
		try {
			const snapshot = buildSceneSnapshot({ editor });
			if (!snapshot) {
				setError("Abra um projeto antes de usar a IA.");
				return;
			}

			const res = await fetch("/api/ai", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ ...body, scene: snapshot }),
			});

			if (res.status === 401) {
				setError("Sessão expirada. Recarregue a página.");
				return;
			}
			if (res.status === 501) {
				setError("IA não configurada (PMZ_SSO_SECRET ausente).");
				return;
			}
			if (!res.ok) {
				setError(`Falha na IA (${res.status}).`);
				return;
			}

			const data = (await res.json()) as AiResponse;
			const operations = Array.isArray(data.operations) ? data.operations : [];
			const result = applyAiOperations({ editor, operations });
			setMessage(
				data.message ?? `${result.applied} operação(ões) aplicada(s).`,
			);
			setWarnings(result.warnings);
		} catch (err) {
			console.error("AI request failed:", err);
			setError(err instanceof Error ? err.message : "Erro inesperado.");
		} finally {
			setBusy(null);
		}
	};

	const handleApply = () => {
		const trimmed = prompt.trim();
		if (!trimmed) return;
		void run({ kind: "apply", body: { prompt: trimmed } });
	};

	const handleTranslate = () => {
		void run({
			kind: "translate",
			body: { prompt: "translate captions", target_lang: lang },
		});
	};

	const isBusy = busy !== null;

	return (
		<PanelView title="IA" contentClassName="px-0 flex flex-col h-full">
			<Section showTopBorder={false} showBottomBorder={false} className="flex-1">
				<SectionContent className="flex flex-col gap-4 h-full pt-1">
					{/* Natural-language commands */}
					<div className="flex flex-col gap-2">
						<p className="text-muted-foreground text-xs">
							Diga o que quer fazer (ex.: "corta em 10s", "remove a primeira
							legenda", "deixa 20s").
						</p>
						<Textarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							placeholder="Digite um comando…"
							rows={3}
							disabled={isBusy}
						/>
						<Button
							type="button"
							className="w-full"
							onClick={handleApply}
							disabled={isBusy || prompt.trim().length === 0}
						>
							{busy === "apply" && <Spinner className="mr-1" />}
							Aplicar
						</Button>
					</div>

					<Separator />

					{/* Subtitle translation */}
					<div className="flex flex-col gap-2">
						<p className="text-muted-foreground text-xs">Traduzir legendas</p>
						<Select value={lang} onValueChange={(value) => setLang(value)}>
							<SelectTrigger>
								<SelectValue placeholder="Idioma" />
							</SelectTrigger>
							<SelectContent>
								{TRANSCRIPTION_LANGUAGES.map((language) => (
									<SelectItem key={language.code} value={language.code}>
										{language.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							type="button"
							variant="outline"
							className="w-full"
							onClick={handleTranslate}
							disabled={isBusy}
						>
							{busy === "translate" && <Spinner className="mr-1" />}
							Traduzir
						</Button>
					</div>

					{message && (
						<div className="bg-primary/10 border-primary/20 rounded-md border p-3">
							<p className="text-sm">{message}</p>
						</div>
					)}
					{error && (
						<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
							<p className="text-destructive text-sm">{error}</p>
						</div>
					)}
					{warnings.length > 0 && (
						<div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3">
							<ul className="space-y-1 text-sm text-amber-700">
								{warnings.map((warning) => (
									<li key={warning}>{warning}</li>
								))}
							</ul>
						</div>
					)}
				</SectionContent>
			</Section>
		</PanelView>
	);
}
