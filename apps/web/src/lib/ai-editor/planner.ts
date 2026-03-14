export const PLANNED_ACTION_ORDER = [
	"toggle-play",
	"stop-playback",
	"goto-start",
	"goto-end",
	"select-all",
	"deselect-all",
	"copy-selected",
	"paste-copied",
	"duplicate-selected",
	"undo",
	"redo",
	"split-at-playhead",
	"add-bookmark",
	"delete-selected",
	"toggle-elements-muted-selected",
	"toggle-elements-visibility-selected",
	"toggle-snapping",
	"toggle-ripple-editing",
] as const;

export type PlannedActionType = (typeof PLANNED_ACTION_ORDER)[number];

export interface PlannedAction {
	type: PlannedActionType;
	source: "keyword-match" | "grok";
	matchedKeywords: string[];
}

const ACTION_KEYWORDS: Record<PlannedActionType, string[]> = {
	"toggle-play": ["请播放", "开始播放", "继续播放", "暂停", "play", "pause", "resume"],
	"stop-playback": ["stop playback", "停止播放", "停止回放", "停播"],
	"goto-start": [
		"goto start",
		"go to start",
		"jump to start",
		"timeline start",
		"回到开头",
		"跳到开头",
		"时间线开头",
	],
	"goto-end": [
		"goto end",
		"go to end",
		"jump to end",
		"timeline end",
		"回到结尾",
		"跳到结尾",
		"时间线结尾",
	],
	"select-all": ["select all", "全选", "选中全部", "选择全部"],
	"deselect-all": [
		"deselect all",
		"unselect all",
		"clear selection",
		"取消全选",
		"取消选择",
		"清空选择",
	],
	"copy-selected": [
		"copy selected",
		"copy selection",
		"拷贝选中",
		"拷贝所选",
		"复制到剪贴板",
	],
	"paste-copied": ["paste copied", "paste", "粘贴", "粘贴已复制", "粘贴到播放头"],
	"duplicate-selected": [
		"duplicate selected",
		"duplicate selection",
		"duplicate",
		"克隆选中",
		"创建副本",
		"复制副本",
	],
	undo: ["undo", "撤销", "撤回", "回退"],
	redo: ["redo", "重做", "恢复"],
	"split-at-playhead": ["split", "分割", "切分", "切开", "剪开"],
	"add-bookmark": ["bookmark", "书签", "标记", "打点"],
	"delete-selected": [
		"delete selected",
		"remove selected",
		"删除所选",
		"删除选中",
		"删掉选中",
	],
	"toggle-elements-muted-selected": [
		"mute selected",
		"unmute selected",
		"toggle mute selected",
		"静音选中",
		"取消静音选中",
		"切换静音",
	],
	"toggle-elements-visibility-selected": [
		"hide selected",
		"show selected",
		"toggle visibility selected",
		"隐藏选中",
		"显示选中",
		"切换可见性",
	],
	"toggle-snapping": ["snap", "snapping", "吸附", "磁吸", "对齐吸附"],
	"toggle-ripple-editing": [
		"toggle ripple editing",
		"ripple editing",
		"波纹编辑",
		"切换波纹编辑",
	],
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesKeyword({
	normalizedInput,
	keyword,
}: {
	normalizedInput: string;
	keyword: string;
}): boolean {
	const normalizedKeyword = keyword.toLowerCase();
	if (/^[a-z0-9 -]+$/.test(normalizedKeyword)) {
		const pattern = new RegExp(
			`(^|\\W)${escapeRegExp(normalizedKeyword)}(?=$|\\W)`,
		);
		return pattern.test(normalizedInput);
	}

	return normalizedInput.includes(normalizedKeyword);
}

export function planEditorActions({ input }: { input: string }): PlannedAction[] {
	const normalizedInput = input.trim().toLowerCase();
	if (!normalizedInput) {
		return [];
	}

	const plans: PlannedAction[] = [];

	// Keep output deterministic by following a fixed action order.
	for (const type of PLANNED_ACTION_ORDER) {
		const matchedKeywords = ACTION_KEYWORDS[type].filter((keyword) =>
			matchesKeyword({ normalizedInput, keyword }),
		);

		if (matchedKeywords.length === 0) {
			continue;
		}

		plans.push({
			type,
			source: "keyword-match",
			matchedKeywords: [...new Set(matchedKeywords)],
		});
	}

	return plans;
}
