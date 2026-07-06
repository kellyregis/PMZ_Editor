"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	DEFAULT_LOCALE,
	LOCALE_COOKIE,
	LOCALE_STORAGE_KEY,
	dictionaries,
	normalizeLocale,
	type Locale,
} from "./dictionaries";

type TranslateVars = Record<string, string | number>;

interface LocaleContextValue {
	locale: Locale;
	setLocale: (locale: Locale) => void;
	t: (key: string, vars?: TranslateVars) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function translate({
	locale,
	key,
	vars,
}: {
	locale: Locale;
	key: string;
	vars?: TranslateVars;
}): string {
	let str = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
	if (vars) {
		for (const [name, value] of Object.entries(vars)) {
			str = str.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
		}
	}
	return str;
}

function readClientLocale(): Locale | null {
	if (typeof window === "undefined") return null;
	try {
		const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
		if (stored) return normalizeLocale(stored);
	} catch {
		// localStorage may be unavailable — fall through to cookie.
	}
	const match = document.cookie.match(/(?:^|;\s*)oc_locale=([^;]+)/);
	if (match) return normalizeLocale(decodeURIComponent(match[1]));
	return null;
}

/**
 * Locale provider. To avoid hydration mismatch, the first render always uses
 * `initialLocale` (default "en" — same on server and client); the persisted
 * client preference (cookie set by the SSO bridge, or localStorage) is applied
 * in an effect AFTER hydration.
 */
export function LocaleProvider({
	initialLocale,
	children,
}: {
	initialLocale?: string;
	children: React.ReactNode;
}) {
	const [locale, setLocaleState] = useState<Locale>(
		normalizeLocale(initialLocale),
	);

	useEffect(() => {
		const client = readClientLocale();
		if (client) {
			setLocaleState((current) => (current === client ? current : client));
		}
	}, []);

	const setLocale = useCallback((next: Locale) => {
		setLocaleState(next);
		try {
			window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
		} catch {
			// ignore
		}
		document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${
			60 * 60 * 24 * 365
		}; samesite=lax`;
	}, []);

	const value = useMemo<LocaleContextValue>(
		() => ({
			locale,
			setLocale,
			t: (key, vars) => translate({ locale, key, vars }),
		}),
		[locale, setLocale],
	);

	return (
		<LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
	);
}

export function useLocale(): LocaleContextValue {
	const ctx = useContext(LocaleContext);
	if (!ctx) {
		// Safety fallback if used outside the provider: English passthrough.
		return {
			locale: DEFAULT_LOCALE,
			setLocale: () => {},
			t: (key, vars) => translate({ locale: DEFAULT_LOCALE, key, vars }),
		};
	}
	return ctx;
}

export function useT(): (key: string, vars?: TranslateVars) => string {
	return useLocale().t;
}
