"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	type KeyboardShortcut,
	useKeyboardShortcutsHelp,
} from "@/hooks/use-keyboard-shortcuts-help";
import { useKeybindingsStore } from "@/stores/keybindings-store";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/providers/i18n-provider";

export function ShortcutsDialog({
	isOpen,
	onOpenChange,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useI18n();
	const [recordingShortcut, setRecordingShortcut] =
		useState<KeyboardShortcut | null>(null);

	const {
		updateKeybinding,
		removeKeybinding,
		getKeybindingString,
		validateKeybinding,
		getKeybindingsForAction,
		setIsRecording,
		resetToDefaults,
		isRecording,
	} = useKeybindingsStore();

	const { shortcuts } = useKeyboardShortcutsHelp();

	const categories = Array.from(new Set(shortcuts.map((s) => s.category)));
	const recordingTitle = t("dialogs.shortcuts.recording");
	const idleTitle = t("dialogs.shortcuts.clickToEdit");
	const orLabel = t("dialogs.shortcuts.or");

	useEffect(() => {
		if (!isRecording || !recordingShortcut) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const keyString = getKeybindingString(e);
			if (keyString) {
				const conflict = validateKeybinding(
					keyString,
					recordingShortcut.action,
				);
				if (conflict) {
					toast.error(
						t("dialogs.shortcuts.keyBound", {
							key: keyString,
							action: conflict.existingAction,
						}),
					);
					setRecordingShortcut(null);
					return;
				}

				const oldKeys = getKeybindingsForAction(recordingShortcut.action);
				for (const key of oldKeys) {
					removeKeybinding(key);
				}

				updateKeybinding(keyString, recordingShortcut.action);

				setIsRecording(false);
				setRecordingShortcut(null);
			}
		};

		const handleClickOutside = () => {
			setRecordingShortcut(null);
			setIsRecording(false);
		};

		document.addEventListener("keydown", handleKeyDown);
		document.addEventListener("click", handleClickOutside);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.removeEventListener("click", handleClickOutside);
		};
	}, [
		recordingShortcut,
		getKeybindingString,
		updateKeybinding,
		removeKeybinding,
		validateKeybinding,
		getKeybindingsForAction,
		setIsRecording,
		isRecording,
		t,
	]);

	const handleStartRecording = (shortcut: KeyboardShortcut) => {
		setRecordingShortcut(shortcut);
		setIsRecording(true);
	};

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[80vh] max-w-2xl flex-col p-0">
				<DialogHeader>
					<DialogTitle>{t("dialogs.shortcuts.title")}</DialogTitle>
				</DialogHeader>

				<DialogBody className="scrollbar-thin flex-grow overflow-y-auto">
					<div className="flex flex-col gap-6">
						{categories.map((category) => (
							<div key={category} className="flex flex-col gap-1">
								<h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
									{category}
								</h3>
								<div className="flex flex-col gap-1">
									{shortcuts
										.filter((shortcut) => shortcut.category === category)
										.map((shortcut) => (
											<ShortcutItem
												key={shortcut.action}
												shortcut={shortcut}
												isRecording={
													shortcut.action === recordingShortcut?.action
												}
												onStartRecording={() => handleStartRecording(shortcut)}
												orLabel={orLabel}
												recordingTitle={recordingTitle}
												idleTitle={idleTitle}
											/>
										))}
								</div>
							</div>
						))}
					</div>
				</DialogBody>
				<DialogFooter>
					<Button variant="destructive" onClick={resetToDefaults}>
						{t("dialogs.shortcuts.reset")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ShortcutItem({
	shortcut,
	isRecording,
	onStartRecording,
	orLabel,
	recordingTitle,
	idleTitle,
}: {
	shortcut: KeyboardShortcut;
	isRecording: boolean;
	onStartRecording: (params: { shortcut: KeyboardShortcut }) => void;
	orLabel: string;
	recordingTitle: string;
	idleTitle: string;
}) {
	const displayKeys = shortcut.keys.filter((key: string) => {
		if (
			key.includes("Cmd") &&
			shortcut.keys.includes(key.replace("Cmd", "Ctrl"))
		)
			return false;

		return true;
	});

	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-3">
				{shortcut.icon && (
					<div className="text-muted-foreground">{shortcut.icon}</div>
				)}
				<span className="text-sm">{shortcut.description}</span>
			</div>
			<div className="flex items-center gap-2">
				{displayKeys.map((key: string, index: number) => (
					<div key={key} className="flex items-center gap-2">
						<div className="flex items-center gap-1">
							{key.split("+").map((keyPart: string, partIndex: number) => {
								const keyId = `${shortcut.id}-${index}-${partIndex}`;
								return (
									<EditableShortcutKey
										key={keyId}
										isRecording={isRecording}
										onStartRecording={() => onStartRecording({ shortcut })}
										recordingTitle={recordingTitle}
										idleTitle={idleTitle}
									>
										{keyPart}
									</EditableShortcutKey>
								);
							})}
						</div>
						{index < displayKeys.length - 1 && (
							<span className="text-muted-foreground text-xs">{orLabel}</span>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

function EditableShortcutKey({
	children,
	isRecording,
	onStartRecording,
	recordingTitle,
	idleTitle,
}: {
	children: React.ReactNode;
	isRecording: boolean;
	onStartRecording: () => void;
	recordingTitle: string;
	idleTitle: string;
}) {
	const handleClick = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onStartRecording();
	};

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={handleClick}
			title={isRecording ? recordingTitle : idleTitle}
		>
			{children}
		</Button>
	);
}
