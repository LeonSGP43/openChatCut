"use client";

import { Separator } from "@/components/ui/separator";
import { type Tab, useAssetsPanelStore } from "@/stores/assets-panel-store";
import { TabBar } from "./tabbar";
import { Captions } from "./views/captions";
import { MediaView } from "./views/assets";
import { SettingsView } from "./views/settings";
import { SoundsView } from "./views/sounds";
import { StickersView } from "./views/stickers";
import { TextView } from "./views/text";
import { EffectsView } from "./views/effects";
import { AIView } from "./views/ai";
import { useI18n } from "@/components/providers/i18n-provider";

export function AssetsPanel() {
	const { t } = useI18n();
	const { activeTab } = useAssetsPanelStore();

	const viewMap: Record<Tab, React.ReactNode> = {
		media: <MediaView />,
		ai: <AIView />,
		sounds: <SoundsView />,
		text: <TextView />,
		stickers: <StickersView />,
		effects: <EffectsView />,
		transitions: (
			<div className="text-muted-foreground p-4">
				{t("assetsTabs.comingSoonTransitions")}
			</div>
		),
		captions: <Captions />,
		filters: (
			<div className="text-muted-foreground p-4">
				{t("assetsTabs.comingSoonFilters")}
			</div>
		),
		adjustment: (
			<div className="text-muted-foreground p-4">
				{t("assetsTabs.comingSoonAdjustment")}
			</div>
		),
		settings: <SettingsView />,
	};

	return (
		<div className="panel bg-background flex h-full rounded-sm border overflow-hidden">
			<TabBar />
			<Separator orientation="vertical" />
			<div className="flex-1 overflow-hidden">{viewMap[activeTab]}</div>
		</div>
	);
}
