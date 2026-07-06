/**
 * Lightweight, zero-dependency i18n dictionary (PT + EN).
 *
 * Flat dotted keys; `pt` and `en` must share the same keys. Missing keys fall
 * back to English, then to the key itself. Add new keys to BOTH maps.
 */

export type Locale = "en" | "pt";

export const LOCALES: Locale[] = ["en", "pt"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "oc_locale";
export const LOCALE_COOKIE = "oc_locale";

export function normalizeLocale(value: string | null | undefined): Locale {
	return value === "pt" ? "pt" : "en";
}

const en: Record<string, string> = {
	// Panels (left tab bar)
	"panel.media": "Media",
	"panel.ai": "AI",
	"panel.sounds": "Sounds",
	"panel.text": "Text",
	"panel.stickers": "Stickers",
	"panel.effects": "Effects",
	"panel.transitions": "Transitions",
	"panel.captions": "Captions",
	"panel.adjustment": "Adjustment",
	"panel.settings": "Settings",

	// Header
	"header.exit": "Exit project",
	"header.shortcuts": "Shortcuts",
	"header.export": "Export",
	"header.language": "Language",

	// Common actions (seeded for upcoming toolbar/menu translation)
	"action.play": "Play",
	"action.pause": "Pause",
	"action.split": "Split",
	"action.trim": "Trim",
	"action.undo": "Undo",
	"action.redo": "Redo",
	"action.export": "Export",
	"action.delete": "Delete",
	"action.duplicate": "Duplicate",
	"common.apply": "Apply",
	"common.cancel": "Cancel",
	"common.save": "Save",
	"common.loading": "Loading…",

	// AI panel
	"ai.hint":
		'Say what you want to do (e.g. "split at 10s", "remove the first caption", "make it 20s").',
	"ai.placeholder": "Type a command…",
	"ai.apply": "Apply",
	"ai.translateTitle": "Translate captions",
	"ai.translate": "Translate",
	"ai.language": "Language",
	"ai.needProject": "Open a project before using AI.",
	"ai.sessionExpired": "Session expired. Reload the page.",
	"ai.notConfigured": "AI is not configured (PMZ_SSO_SECRET missing).",
	"ai.failed": "AI request failed ({status}).",
	"ai.applied": "{count} operation(s) applied.",
};

const pt: Record<string, string> = {
	// Painéis (barra de abas à esquerda)
	"panel.media": "Mídia",
	"panel.ai": "IA",
	"panel.sounds": "Sons",
	"panel.text": "Texto",
	"panel.stickers": "Figurinhas",
	"panel.effects": "Efeitos",
	"panel.transitions": "Transições",
	"panel.captions": "Legendas",
	"panel.adjustment": "Ajustes",
	"panel.settings": "Configurações",

	// Cabeçalho
	"header.exit": "Sair do projeto",
	"header.shortcuts": "Atalhos",
	"header.export": "Exportar",
	"header.language": "Idioma",

	// Ações comuns
	"action.play": "Reproduzir",
	"action.pause": "Pausar",
	"action.split": "Dividir",
	"action.trim": "Aparar",
	"action.undo": "Desfazer",
	"action.redo": "Refazer",
	"action.export": "Exportar",
	"action.delete": "Excluir",
	"action.duplicate": "Duplicar",
	"common.apply": "Aplicar",
	"common.cancel": "Cancelar",
	"common.save": "Salvar",
	"common.loading": "Carregando…",

	// Painel de IA
	"ai.hint":
		'Diga o que quer fazer (ex.: "corta em 10s", "remove a primeira legenda", "deixa 20s").',
	"ai.placeholder": "Digite um comando…",
	"ai.apply": "Aplicar",
	"ai.translateTitle": "Traduzir legendas",
	"ai.translate": "Traduzir",
	"ai.language": "Idioma",
	"ai.needProject": "Abra um projeto antes de usar a IA.",
	"ai.sessionExpired": "Sessão expirada. Recarregue a página.",
	"ai.notConfigured": "IA não configurada (PMZ_SSO_SECRET ausente).",
	"ai.failed": "Falha na IA ({status}).",
	"ai.applied": "{count} operação(ões) aplicada(s).",
};

export const dictionaries: Record<Locale, Record<string, string>> = { en, pt };
