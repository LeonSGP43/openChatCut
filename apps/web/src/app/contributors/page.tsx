import type { Metadata } from "next";
import Link from "next/link";
import { GitHubContributeSection } from "@/components/gitHub-contribute-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { EXTERNAL_TOOLS } from "@/constants/site-constants";
import { BasePage } from "../base-page";

export const metadata: Metadata = {
	title: "Core Team - openChatCut",
	description:
		"Meet the core maintainers of openChatCut.",
	openGraph: {
		title: "Core Team - openChatCut",
		description: "Meet the core maintainers of openChatCut.",
		type: "website",
	},
};

interface Maintainer {
	id: number;
	login: string;
	avatar_url: string;
	html_url: string;
	role: string;
}

const CORE_MAINTAINERS: Maintainer[] = [
	{
		id: 154585401,
		login: "LeonSGP43",
		avatar_url: "https://avatars.githubusercontent.com/u/154585401?v=4",
		html_url: "https://github.com/LeonSGP43",
		role: "Project Lead",
	},
];

export default function ContributorsPage() {

	return (
		<BasePage
			title="Core Team"
			description="openChatCut uses a curated maintainer list. Historical OpenCut contributors are intentionally not shown here."
		>
			<div className="-mt-4 flex items-center justify-center gap-8 text-sm">
				<StatItem value={CORE_MAINTAINERS.length} label="maintainers" />
			</div>

			<div className="mx-auto flex max-w-6xl flex-col gap-20">
				<MaintainersSection maintainers={CORE_MAINTAINERS} />
				<ExternalToolsSection />
				<GitHubContributeSection
					title="Join the community"
					description="openChatCut is built by developers like you. Every contribution helps make conversational editing faster and more practical."
				/>
			</div>
		</BasePage>
	);
}

function StatItem({ value, label }: { value: number; label: string }) {
	return (
		<div className="flex items-center gap-2">
			<div className="bg-foreground size-2 rounded-full" />
			<span className="font-medium">{value}</span>
			<span className="text-muted-foreground">{label}</span>
		</div>
	);
}

function MaintainersSection({
	maintainers,
}: {
	maintainers: Maintainer[];
}) {
	return (
		<div className="flex flex-col gap-10">
			<div className="flex flex-col gap-2 text-center">
				<h2 className="text-2xl font-semibold">Maintainers</h2>
				<p className="text-muted-foreground">
					Curated openChatCut core team
				</p>
			</div>

			<div className="mx-auto flex w-full max-w-xl flex-col justify-center gap-6 md:flex-row">
				{maintainers.map((maintainer) => (
					<MaintainerCard key={maintainer.id} maintainer={maintainer} />
				))}
			</div>
		</div>
	);
}

function MaintainerCard({ maintainer }: { maintainer: Maintainer }) {
	return (
		<Link
			href={maintainer.html_url}
			target="_blank"
			rel="noopener noreferrer"
			className="w-full"
		>
			<Card>
				<CardContent className="flex flex-col gap-6 p-8 text-center">
					<Avatar className="mx-auto size-28">
						<AvatarImage
							src={maintainer.avatar_url}
							alt={`${maintainer.login}'s avatar`}
						/>
						<AvatarFallback className="text-lg font-semibold">
							{maintainer.login.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<div className="flex flex-col gap-2">
						<h3 className="text-xl font-semibold">{maintainer.login}</h3>
						<div className="flex items-center justify-center gap-2">
							<span className="text-muted-foreground">{maintainer.role}</span>
						</div>
					</div>
				</CardContent>
			</Card>
		</Link>
	);
}

function ExternalToolsSection() {
	return (
		<div className="flex flex-col gap-10">
			<div className="flex flex-col gap-2 text-center">
				<h2 className="text-2xl font-semibold">External tools</h2>
				<p className="text-muted-foreground">Tools we use to build openChatCut</p>
			</div>

			<div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2">
				{EXTERNAL_TOOLS.map((tool, index) => (
					<Link
						key={tool.url}
						href={tool.url}
						target="_blank"
						className="block"
						style={{ animationDelay: `${index * 100}ms` }}
					>
						<Card className="h-full">
							<CardContent className="flex items-center justify-center h-full flex-col gap-4 p-6 text-center">
								<tool.icon className="size-8" />
								<div className="flex flex-1 flex-col gap-2">
									<h3 className="text-lg font-semibold">{tool.name}</h3>
									<p className="text-muted-foreground text-sm">
										{tool.description}
									</p>
								</div>
							</CardContent>
						</Card>
					</Link>
				))}
			</div>
		</div>
	);
}
