import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BasePage } from "../base-page";
import { Button } from "@/components/ui/button";
import { getServerI18n } from "@/i18n/server";

export const metadata: Metadata = {
	title: "AI Chat",
	description: "Open the in-editor AI assistant entry for OpenChatCut.",
};

export default async function AIChatPage() {
	const { t } = await getServerI18n();

	return (
		<BasePage
			title={t("aichatPage.title")}
			description={t("aichatPage.description")}
		>
			<div className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-xl border p-6">
				<p className="text-muted-foreground text-sm">
					{t("aichatPage.pathHint")}
				</p>
				<Link href="/projects" className="w-fit">
					<Button>
						{t("aichatPage.openProjects")}
						<ArrowRight className="size-4" />
					</Button>
				</Link>
			</div>
		</BasePage>
	);
}
