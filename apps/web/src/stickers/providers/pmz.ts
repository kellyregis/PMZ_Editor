import { buildStickerId, parseStickerId } from "../sticker-id";
import type {
	StickerBrowseResult,
	StickerItem,
	StickerProvider,
	StickerSearchResult,
} from "../types";

/**
 * PMZ curated sticker pack.
 *
 * A small set of original, flat-vector stickers authored in-house and served as
 * inline SVG `data:` URLs. Rationale:
 *  - CC0 / royalty-free by construction (our own artwork) — safe for commercial
 *    SaaS, no attribution, no third-party licensing.
 *  - `data:` URLs are same-origin, so they do NOT taint the preview canvas
 *    (external CDN images would, breaking the wasm texture upload) and need no
 *    `next.config` remotePatterns / CORS.
 * To point at a hosted asset library (e.g. our MinIO) later, swap `svg` for a
 * same-origin URL and set `crossOrigin` handling accordingly.
 */

const PMZ_PROVIDER_ID = "pmz";

interface PmzSticker {
	key: string;
	name: string;
	keywords: string[];
	svg: string;
}

function svgDoc(inner: string): string {
	return `<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512' viewBox='0 0 512 512'>${inner}</svg>`;
}

const STICKERS: PmzSticker[] = [
	{
		key: "heart",
		name: "Heart",
		keywords: ["love", "like", "coração"],
		svg: svgDoc(
			"<path d='M256 448S64 336 64 208c0-64 48-112 112-112 40 0 68 24 80 48 12-24 40-48 80-48 64 0 112 48 112 112 0 128-192 240-192 240Z' fill='#e0245e'/>",
		),
	},
	{
		key: "star",
		name: "Star",
		keywords: ["favorite", "estrela"],
		svg: svgDoc(
			"<path d='M256 48l61 128 139 20-100 98 24 138-124-66-124 66 24-138-100-98 139-20Z' fill='#f5c518'/>",
		),
	},
	{
		key: "fire",
		name: "Fire",
		keywords: ["hot", "lit", "fogo"],
		svg: svgDoc(
			"<path d='M256 40c44 80 104 110 104 210 0 80-48 150-104 150s-104-70-104-150c0-40 24-70 48-80-10 50 20 80 40 80-30-40 0-130 16-210Z' fill='#ff6b35'/><path d='M256 220c22 34 44 54 44 96 0 40-22 68-44 68s-44-28-44-68c0-24 16-42 30-52-4 26 6 40 14 40-8-24 0-58 0-84Z' fill='#ffd23f'/>",
		),
	},
	{
		key: "check",
		name: "Check",
		keywords: ["yes", "ok", "certo"],
		svg: svgDoc(
			"<circle cx='256' cy='256' r='200' fill='#2ecc71'/><path d='M170 262l58 58 116-124' stroke='#fff' stroke-width='36' fill='none' stroke-linecap='round' stroke-linejoin='round'/>",
		),
	},
	{
		key: "cross",
		name: "Cross",
		keywords: ["no", "wrong", "errado"],
		svg: svgDoc(
			"<circle cx='256' cy='256' r='200' fill='#e74c3c'/><path d='M190 190l132 132M322 190L190 322' stroke='#fff' stroke-width='36' stroke-linecap='round'/>",
		),
	},
	{
		key: "hundred",
		name: "100",
		keywords: ["hundred", "cem", "perfect"],
		svg: svgDoc(
			"<text x='256' y='292' font-family='Arial, sans-serif' font-size='190' font-weight='bold' fill='#e0245e' text-anchor='middle'>100</text><rect x='96' y='330' width='320' height='16' rx='8' fill='#e0245e'/><rect x='96' y='362' width='320' height='16' rx='8' fill='#e0245e'/>",
		),
	},
	{
		key: "sparkles",
		name: "Sparkles",
		keywords: ["shine", "magic", "brilho"],
		svg: svgDoc(
			"<path d='M256 80l30 146 146 30-146 30-30 146-30-146-146-30 146-30Z' fill='#ffd23f'/><path d='M120 340l14 44 44 14-44 14-14 44-14-44-44-14 44-14Z' fill='#ffe680'/>",
		),
	},
	{
		key: "bolt",
		name: "Bolt",
		keywords: ["lightning", "energy", "raio"],
		svg: svgDoc(
			"<path d='M300 40 140 280h100l-40 192 180-252H270Z' fill='#ffd23f' stroke='#e6b800' stroke-width='6' stroke-linejoin='round'/>",
		),
	},
	{
		key: "sun",
		name: "Sun",
		keywords: ["sol", "bright", "day"],
		svg: svgDoc(
			"<g stroke='#ffcc00' stroke-width='24' stroke-linecap='round'><path d='M256 56v56M256 400v56M56 256h56M400 256h56M116 116l40 40M356 356l40 40M396 116l-40 40M156 356l-40 40'/></g><circle cx='256' cy='256' r='104' fill='#ffcc00'/>",
		),
	},
	{
		key: "arrow",
		name: "Arrow",
		keywords: ["right", "next", "seta"],
		svg: svgDoc(
			"<path d='M96 256h264M280 176l80 80-80 80' stroke='#3498db' stroke-width='40' fill='none' stroke-linecap='round' stroke-linejoin='round'/>",
		),
	},
	{
		key: "warning",
		name: "Warning",
		keywords: ["alert", "atenção", "aviso"],
		svg: svgDoc(
			"<path d='M256 64l216 376H40Z' fill='#ffcc00' stroke='#e6b800' stroke-width='10' stroke-linejoin='round'/><rect x='240' y='198' width='32' height='132' rx='16' fill='#4d3b00'/><circle cx='256' cy='384' r='20' fill='#4d3b00'/>",
		),
	},
	{
		key: "speech",
		name: "Speech",
		keywords: ["talk", "chat", "balão"],
		svg: svgDoc(
			"<path d='M96 96h320a32 32 0 0 1 32 32v192a32 32 0 0 1-32 32H240l-80 80v-80H96a32 32 0 0 1-32-32V128a32 32 0 0 1 32-32Z' fill='#3498db'/>",
		),
	},
	{
		key: "smile",
		name: "Smile",
		keywords: ["happy", "face", "sorriso"],
		svg: svgDoc(
			"<circle cx='256' cy='256' r='200' fill='#ffcc00'/><circle cx='190' cy='212' r='26' fill='#333'/><circle cx='322' cy='212' r='26' fill='#333'/><path d='M168 300q88 84 176 0' stroke='#333' stroke-width='28' fill='none' stroke-linecap='round'/>",
		),
	},
	{
		key: "eyes",
		name: "Eyes",
		keywords: ["look", "watching", "olhos"],
		svg: svgDoc(
			"<ellipse cx='182' cy='256' rx='72' ry='92' fill='#fff' stroke='#333' stroke-width='8'/><circle cx='198' cy='272' r='34' fill='#333'/><ellipse cx='330' cy='256' rx='72' ry='92' fill='#fff' stroke='#333' stroke-width='8'/><circle cx='314' cy='272' r='34' fill='#333'/>",
		),
	},
];

function buildDataUrl({ svg }: { svg: string }): string {
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function getSticker({ key }: { key: string }): PmzSticker | null {
	return STICKERS.find((sticker) => sticker.key === key) ?? null;
}

function toStickerItem({ sticker }: { sticker: PmzSticker }): StickerItem {
	return {
		id: buildStickerId({
			providerId: PMZ_PROVIDER_ID,
			providerValue: sticker.key,
		}),
		provider: PMZ_PROVIDER_ID,
		name: sticker.name,
		previewUrl: buildDataUrl({ svg: sticker.svg }),
		metadata: {},
	};
}

function filterByQuery({ query }: { query: string }): PmzSticker[] {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return STICKERS;
	return STICKERS.filter(
		(sticker) =>
			sticker.name.toLowerCase().includes(normalized) ||
			sticker.keywords.some((keyword) =>
				keyword.toLowerCase().includes(normalized),
			),
	);
}

export const pmzProvider: StickerProvider = {
	id: PMZ_PROVIDER_ID,
	async search({
		query,
	}: {
		query: string;
		options?: { limit?: number };
	}): Promise<StickerSearchResult> {
		const items = filterByQuery({ query }).map((sticker) =>
			toStickerItem({ sticker }),
		);
		return { items, total: items.length, hasMore: false };
	},
	async browse(): Promise<StickerBrowseResult> {
		return {
			sections: [
				{
					id: "all",
					items: STICKERS.map((sticker) => toStickerItem({ sticker })),
					hasMore: false,
					layout: "grid",
				},
			],
		};
	},
	resolveUrl({
		stickerId,
	}: {
		stickerId: string;
		options?: { width?: number; height?: number };
	}): string {
		try {
			const { providerValue } = parseStickerId({ stickerId });
			const sticker = getSticker({ key: providerValue }) ?? STICKERS[0];
			return buildDataUrl({ svg: sticker.svg });
		} catch {
			return buildDataUrl({ svg: STICKERS[0].svg });
		}
	},
};
