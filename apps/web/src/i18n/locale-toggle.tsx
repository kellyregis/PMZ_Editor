"use client";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/i18n/locale-provider";

/**
 * Compact EN/PT language toggle for the editor header. Shows the current
 * locale; clicking switches and persists it (cookie + localStorage).
 */
export function LocaleToggle() {
	const { locale, setLocale, t } = useLocale();
	return (
		<Button
			variant="ghost"
			size="icon"
			className="size-8 text-xs font-semibold"
			aria-label={t("header.language")}
			title={t("header.language")}
			onClick={() => setLocale(locale === "en" ? "pt" : "en")}
		>
			{locale.toUpperCase()}
		</Button>
	);
}
