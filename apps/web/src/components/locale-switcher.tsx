"use client";

import { LanguagesIcon } from "lucide-react";
import { Button } from "./ui/button";
import { useI18n } from "./providers/i18n-provider";
import { cn } from "@/utils/ui";

export function LocaleSwitcher({ className }: { className?: string }) {
	const { locale, setLocale, t } = useI18n();
	const isChinese = locale === "zh-CN";

	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			className={cn("h-8 gap-1.5 px-2.5", className)}
			aria-label={t("common.localeSwitcherLabel")}
			onClick={() => setLocale(isChinese ? "en" : "zh-CN")}
		>
			<LanguagesIcon className="size-3.5" />
			<span>
				{isChinese ? t("common.language.zhCN") : t("common.language.en")}
			</span>
		</Button>
	);
}
