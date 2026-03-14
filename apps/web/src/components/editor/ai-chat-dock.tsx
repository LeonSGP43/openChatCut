"use client";

import { Button } from "@/components/ui/button";
import { AIView } from "@/components/editor/panels/assets/views/ai";
import { cn } from "@/utils/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAIChatDockStore } from "@/stores/ai-chat-dock-store";
import { useI18n } from "@/components/providers/i18n-provider";

export function AIChatDock() {
	const { isOpen, toggle, setOpen } = useAIChatDockStore();
	const { t } = useI18n();

	return (
		<div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex items-center">
			<Button
				size="icon"
				variant="secondary"
				className="pointer-events-auto mr-2 size-8 rounded-full border shadow-md"
				onClick={toggle}
				aria-label={isOpen ? t("aiDock.close") : t("aiDock.open")}
			>
				{isOpen ? (
					<ChevronRight className="size-4" />
				) : (
					<ChevronLeft className="size-4" />
				)}
			</Button>

			<aside
				className={cn(
					"pointer-events-auto h-full w-[26rem] border-l bg-background shadow-2xl transition-transform duration-200 ease-out",
					isOpen ? "translate-x-0" : "translate-x-[110%] pointer-events-none",
				)}
			>
				<div className="flex h-full min-h-0 flex-col">
					<div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
						<span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
							{t("aiDock.title")}
						</span>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => setOpen(false)}
						>
							{t("common.close")}
						</Button>
					</div>
					<div className="min-h-0 flex-1">
						<AIView embedded />
					</div>
				</div>
			</aside>
		</div>
	);
}
