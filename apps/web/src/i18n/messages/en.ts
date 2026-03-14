export const enMessages = {
	common: {
		localeSwitcherLabel: "Switch language",
		language: {
			en: "English",
			zhCN: "简体中文",
		},
		cancel: "Cancel",
		close: "Close",
		save: "Save",
		done: "Done",
		confirm: "Confirm",
		delete: "Delete",
		rename: "Rename",
		duplicate: "Duplicate",
		info: "Info",
	},
	themeToggle: {
		light: "Light",
		dark: "Dark",
		toggle: "Toggle theme",
	},
	header: {
		roadmap: "Roadmap",
		sponsors: "Sponsors",
		blog: "Blog",
		copySvg: "Copy SVG",
		downloadSvg: "Download SVG",
		brandAssets: "Brand assets",
		projects: "Projects",
		closeMenu: "Close menu",
	},
	footer: {
		tagline: "The privacy-first video editor that feels simple to use.",
		resources: "Resources",
		company: "Company",
		roadmap: "Roadmap",
		changelog: "Changelog",
		blog: "Blog",
		privacy: "Privacy",
		terms: "Terms of use",
		sponsors: "Sponsors",
		brand: "Brand",
		about: "About",
		copyright: "© {year} OpenCut, All Rights Reserved",
	},
	aichatPage: {
		title: "AI Chat",
		description:
			"AI chat lives inside the editor as a global sidebar. Create or open a project first.",
		pathHint:
			"Path: /projects - create project - open editor - use AI Chat button in the top bar.",
		openProjects: "Open Projects",
	},
	editorHeader: {
		aiChat: "AI Chat",
		exitProject: "Exit project",
		shortcuts: "Shortcuts",
		discord: "Discord",
		renameProjectFailed: "Failed to rename project",
		deleteProjectFailed: "Failed to delete project",
		tryAgain: "Please try again",
		projectThumbnail: "Project thumbnail",
	},
	aiDock: {
		open: "Open AI chat sidebar",
		close: "Close AI chat sidebar",
		title: "AI Chat",
	},
	dialogs: {
		deleteProject: {
			title: "Delete '{name}'",
			warning: "Warning",
			confirmHint: 'Type "DELETE" to confirm',
			placeholder: "DELETE",
			description:
				"This action cannot be undone. The project and all of its local media references will be removed.",
		},
		migration: {
			updatingProject: "Updating project",
			updatingProjects: "Updating projects",
			descriptionSingle:
				'Upgrading "{name}" from v{fromVersion} to v{toVersion}',
			descriptionMultiple:
				"Upgrading projects from v{fromVersion} to v{toVersion}",
		},
		projectInfo: {
			duration: "Duration",
			created: "Created",
			modified: "Modified",
			projectId: "Project ID",
		},
		renameProject: {
			title: "Rename project",
			newName: "New name",
			placeholder: "Enter a new name",
			action: "Rename",
		},
		shortcuts: {
			title: "Keyboard shortcuts",
			reset: "Reset to defaults",
			clickToEdit: "Click to edit shortcut",
			recording: "Press any key combination...",
			or: "or",
			keyBound: 'Key "{key}" is already bound to "{action}"',
		},
	},
	projects: {
		home: "Home",
		allProjects: "All projects",
		view: {
			grid: "Grid view",
			list: "List view",
		},
		sort: {
			createdAt: "Created",
			updatedAt: "Modified",
			name: "Name",
			duration: "Duration",
			aria: "Sort {order}",
			asc: "ascending",
			desc: "descending",
		},
		selectAll: "Select all",
		searchPlaceholder: "Search...",
		newProject: "New project",
		newShort: "New",
		createdOn: "Created {date}",
		projectMenu: "Project menu",
		noResults: "No results found",
		noResultsDescription:
			'Your search for "{query}" did not return any results.',
		clearSearch: "Clear search",
		noProjects: "No projects yet",
		noProjectsDescription:
			"Start creating your first project. Import media, edit, and export your videos. All privately.",
		createFirstProject: "Create your first project",
		createProjectFailed: "Failed to create project",
		tryAgain: "Please try again",
		newProjectDefaultName: "New project",
	},
	aiView: {
		panelTitle: "AI",
		initial:
			"AI edit assistant is ready (Grok-backed). Follow Prompt -> Assets -> Analysis -> Confirm before planning and execution.",
		role: {
			system: "System",
			user: "You",
			assistant: "AI",
		},
		strategy: {
			replace: "Replace",
			append: "Append",
			dedupe: "Dedupe",
		},
		projectPromptLabel: "Project Prompt",
		projectPromptPlaceholder:
			"Describe your editing objective, audience, style, pacing, and constraints...",
		analysisConcurrencyLabel: "Analysis concurrency",
		analysisPromptPlaceholder:
			"Optional custom prompt for asset understanding (leave empty to use best-practice default).",
		savePrompt: "Save Prompt",
		analyzePromptAssets: "Analyze Prompt + Assets",
		confirmAnalysis: "Confirm Analysis",
		analysisConfirmed: "Analysis Confirmed",
		workflowStatus: "Workflow status",
		statusDone: "done",
		statusPending: "pending",
		assetsLoaded: "{count} loaded",
		planSummary: "Planned actions ({count}, risk: {risk})",
		highRiskNeedsConfirm:
			"High-risk actions require explicit confirmation before execution.",
		confirmed: "Confirmed",
		pendingActionConfirm: "Pending action confirmations: {count}",
		importAudit: "Import Audit",
		exportAudit: "Export Audit",
		clearAudit: "Clear Audit",
		clearChat: "Clear Chat",
		run: "Run",
		execute: "Execute",
		executing: "Executing...",
		runHint:
			"Press Cmd/Ctrl + Enter to run quickly. Execute applies planned actions to the timeline.",
		draftPlaceholder: "Describe the edit task you want to plan...",
		msg: {
			noAssistantMessage: "No assistant message returned.",
			projectPromptEmpty:
				"Project prompt is empty. Add your editing goal first.",
			projectPromptSaved:
				"Project prompt saved. Next step: add media assets, then click Analyze Prompt + Assets.",
			savePromptBeforeAnalysis:
				"Save a project prompt first, then run context analysis.",
			noAssetsBeforeAnalysis:
				"No assets found. Add video/audio/image assets first, then analyze.",
			analysisUserInput:
				"Analyze current project prompt and media/timeline context. Provide understanding, editing strategy, and concise clarification questions for confirmation.",
			unknownError: "unknown error",
			analysisFailed:
				"Grok analysis failed: {error}. Please fix Grok configuration/network and retry.",
			runAnalysisFirst:
				"Run Analyze Prompt + Assets first. Confirmation is enabled after analysis output is generated.",
			analysisConfirmed:
				"Analysis confirmed. You can now run multi-round edit instructions and execute the planned actions.",
			captionSkipped:
				"Caption generation skipped: timeline has no usable media/audio content.",
			generatingCaptions: "Generating captions from timeline audio...",
			noCaptionSegments: "No caption segments generated",
			captionsGenerated:
				"Generated captions on a new text track ({count} clips).",
			captionFailed: "Caption generation failed.",
			promptRequiredBeforePlan:
				"Project prompt is required before planning. Fill in Project Prompt and click Save Prompt.",
			assetsRequiredBeforePlan:
				"No media assets detected. Add assets first, then run Analyze Prompt + Assets.",
			analysisNotConfirmed:
				"Analysis is not confirmed yet. Run Analyze Prompt + Assets, review with user, then click Confirm Analysis.",
			planRequestFailed:
				"Grok plan request failed ({error}). Please fix Grok configuration/network and retry.",
			noSafeActionMatched:
				"No safe action matched. Try play/stop, go to start/end, select/copy/paste/duplicate, split, bookmark, delete selected, mute/visibility, snapping, or ripple editing.",
			clickExecuteToApply: "Click Execute to apply.",
			workflowNotReady:
				"Workflow is not ready for execution. Complete Prompt + Assets + Analysis confirmation first.",
			highRiskMissing:
				"High-risk confirmations missing: {actions}. Confirm each required action before execute.",
			auditExported: "Audit exported ({count} entries).",
			auditExportFailed: "Audit export failed.",
			invalidAuditPayload: "Invalid audit payload",
			auditImportFailed: "Audit import failed.",
			newProjectWorkflow:
				"New project workflow: Prompt - Assets - Analysis - Confirm - Plan - Execute",
			dedupeWillRemove: "Dedupe will remove {count} duplicate entry(ies).",
			applyImport: "Apply Import",
			cancelImport: "Cancel Import",
			auditEntries: "Audit entries: {count}",
		},
	},
} as const;

type DeepStringRecord<T> = {
	[K in keyof T]: T[K] extends string ? string : DeepStringRecord<T[K]>;
};

export type AppMessages = DeepStringRecord<typeof enMessages>;
