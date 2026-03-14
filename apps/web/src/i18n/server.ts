import { cookies } from "next/headers";
import { LOCALE_COOKIE_NAME, normalizeLocale, type AppLocale } from "./locales";
import { getMessages } from "./messages";
import { translate } from "./translate";

export async function getServerLocale(): Promise<AppLocale> {
	const cookieStore = await cookies();
	return normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}

export async function getServerI18n() {
	const locale = await getServerLocale();
	const messages = getMessages(locale);

	return {
		locale,
		t: (key: string, values?: Record<string, string | number>) =>
			translate({ messages, key, values }),
	};
}
