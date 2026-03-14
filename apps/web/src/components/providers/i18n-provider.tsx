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
	LOCALE_COOKIE_NAME,
	LOCALE_STORAGE_KEY,
	normalizeLocale,
	type AppLocale,
} from "@/i18n/locales";
import { getMessages } from "@/i18n/messages";
import { translate } from "@/i18n/translate";

interface I18nContextValue {
	locale: AppLocale;
	setLocale: (locale: AppLocale) => void;
	t: (key: string, values?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
	initialLocale,
	children,
}: {
	initialLocale: AppLocale;
	children: React.ReactNode;
}) {
	const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

	useEffect(() => {
		const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
		if (!storedLocale) {
			return;
		}
		setLocaleState(normalizeLocale(storedLocale));
	}, []);

	useEffect(() => {
		window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
		const cookieStore = (
			window as Window & {
				cookieStore?: {
					set: (options: {
						name: string;
						value: string;
						path: string;
						expires: number;
						sameSite: "lax" | "strict" | "none";
					}) => Promise<void> | void;
				};
			}
		).cookieStore;
		if (cookieStore && typeof cookieStore.set === "function") {
			void cookieStore.set({
				name: LOCALE_COOKIE_NAME,
				value: encodeURIComponent(locale),
				path: "/",
				expires: Date.now() + 31_536_000_000,
				sameSite: "lax",
			});
		}
		document.documentElement.lang = locale;
	}, [locale]);

	const messages = useMemo(() => getMessages(locale), [locale]);

	const setLocale = useCallback((nextLocale: AppLocale) => {
		setLocaleState(normalizeLocale(nextLocale));
	}, []);

	const t = useCallback(
		(key: string, values?: Record<string, string | number>) =>
			translate({ messages, key, values }),
		[messages],
	);

	const value = useMemo(
		() => ({
			locale,
			setLocale,
			t,
		}),
		[locale, setLocale, t],
	);

	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
	const context = useContext(I18nContext);
	if (!context) {
		throw new Error("useI18n must be used within I18nProvider");
	}
	return context;
}
