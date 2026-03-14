import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BasePage } from "../base-page";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
	title: "AI Chat",
	description: "Open the in-editor AI assistant entry for OpenChatCut.",
};

export default function AIChatPage() {
	return (
		<BasePage
			title="AI Chat"
			description="AI chat lives inside the editor as a global sidebar. Create or open a project first."
		>
			<div className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-xl border p-6">
				<p className="text-muted-foreground text-sm">
					Path: <span className="font-mono">/projects</span> - create project -
					open editor - use AI Chat button in the top bar.
				</p>
				<Link href="/projects" className="w-fit">
					<Button>
						Open Projects
						<ArrowRight className="size-4" />
					</Button>
				</Link>
			</div>
		</BasePage>
	);
}
