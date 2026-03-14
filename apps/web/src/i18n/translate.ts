import { enMessages } from "./messages";

type MessageTree = Record<string, unknown>;

function resolveByPath({
	tree,
	path,
}: {
	tree: MessageTree;
	path: string;
}): unknown {
	return path.split(".").reduce<unknown>((current, segment) => {
		if (!current || typeof current !== "object") {
			return undefined;
		}
		return (current as Record<string, unknown>)[segment];
	}, tree);
}

function interpolate({
	template,
	values,
}: {
	template: string;
	values?: Record<string, string | number>;
}): string {
	if (!values) {
		return template;
	}

	return template.replace(/\{(\w+)\}/g, (_, token) => {
		const replacement = values[token];
		return replacement === undefined ? `{${token}}` : String(replacement);
	});
}

export function translate({
	messages,
	key,
	values,
}: {
	messages: MessageTree;
	key: string;
	values?: Record<string, string | number>;
}): string {
	const primary = resolveByPath({ tree: messages, path: key });
	const fallback = resolveByPath({ tree: enMessages, path: key });
	const text =
		typeof primary === "string"
			? primary
			: typeof fallback === "string"
				? fallback
				: key;

	return interpolate({ template: text, values });
}
