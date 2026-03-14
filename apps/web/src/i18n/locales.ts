export const SUPPORTED_LOCALES = ["en", "zh-CN"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";
export const LOCALE_COOKIE_NAME = "opencut-locale";
export const LOCALE_STORAGE_KEY = "opencut-locale";

export function normalizeLocale(input?: string | null): AppLocale {
	const value = input?.trim().toLowerCase() ?? "";
	if (value.startsWith("zh")) {
		return "zh-CN";
	}
	return DEFAULT_LOCALE;
}
