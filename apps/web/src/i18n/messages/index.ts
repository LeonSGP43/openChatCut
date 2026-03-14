import type { AppLocale } from "../locales";
import { enMessages } from "./en";
import { zhCNMessages } from "./zh-cn";

const messages = {
	en: enMessages,
	"zh-CN": zhCNMessages,
} as const;

export function getMessages(locale: AppLocale) {
	return messages[locale];
}

export { enMessages };

