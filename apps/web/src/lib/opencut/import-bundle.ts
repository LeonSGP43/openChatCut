import { storageService } from "@/services/storage/service";
import type { MediaAsset, MediaType } from "@/types/assets";
import type { TProject } from "@/types/project";
import type { Bookmark } from "@/types/timeline";
import type { SerializedProject } from "@/services/storage/types";
import { generateUUID } from "@/utils/id";
import { getVideoInfo } from "@/lib/media/mediabunny";
import { generateThumbnail } from "@/lib/media/processing";

interface ImportedAssetManifestEntry {
	mediaId: string;
	bundledFile: string;
	originalName?: string;
	type?: MediaType;
	duration?: number;
}

interface ImportedBundleManifest {
	projectFile?: string;
	assets?: ImportedAssetManifestEntry[];
}

function normalizeBookmarks({ raw }: { raw: unknown }): Bookmark[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item): Bookmark | null => {
			if (typeof item === "number") return { time: item };
			if (typeof item !== "object" || item === null) return null;
			const value = item as Record<string, unknown>;
			if (typeof value.time !== "number") return null;
			return {
				time: value.time,
				...(typeof value.note === "string" ? { note: value.note } : {}),
				...(typeof value.color === "string" ? { color: value.color } : {}),
				...(typeof value.duration === "number"
					? { duration: value.duration }
					: {}),
			};
		})
		.filter((item): item is Bookmark => item !== null);
}

function guessMimeType({ name, type }: { name: string; type?: MediaType }): string {
	const extension = name.split(".").pop()?.toLowerCase() || "";
	if (type === "audio") {
		if (extension === "mp3") return "audio/mpeg";
		if (extension === "wav") return "audio/wav";
		if (extension === "m4a") return "audio/mp4";
		return "audio/*";
	}
	if (type === "image") {
		if (extension === "png") return "image/png";
		if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
		if (extension === "webp") return "image/webp";
		if (extension === "svg") return "image/svg+xml";
		return "image/*";
	}
	if (extension === "mov") return "video/quicktime";
	if (extension === "webm") return "video/webm";
	return "video/mp4";
}

function deserializeProject({
	serializedProject,
	projectId,
	importedAt,
}: {
	serializedProject: SerializedProject;
	projectId: string;
	importedAt: Date;
}): TProject {
	const scenes =
		serializedProject.scenes?.map((scene) => ({
			id: scene.id,
			name: scene.name,
			isMain: scene.isMain,
			tracks: (scene.tracks ?? []).map((track) =>
				track.type === "video"
					? { ...track, isMain: track.isMain ?? false }
					: track,
			),
			bookmarks: normalizeBookmarks({ raw: scene.bookmarks }),
			createdAt: new Date(scene.createdAt),
			updatedAt: new Date(scene.updatedAt),
		})) ?? [];

	return {
		metadata: {
			id: projectId,
			name: serializedProject.metadata.name,
			thumbnail: serializedProject.metadata.thumbnail,
			duration: serializedProject.metadata.duration,
			createdAt: importedAt,
			updatedAt: importedAt,
		},
		scenes,
		currentSceneId: serializedProject.currentSceneId,
		settings: serializedProject.settings,
		version: serializedProject.version,
		timelineViewState: serializedProject.timelineViewState,
	};
}

async function buildMediaAsset({
	asset,
	blob,
}: {
	asset: ImportedAssetManifestEntry;
	blob: Blob;
}): Promise<MediaAsset> {
	const name = asset.originalName || asset.bundledFile.split("/").pop() || asset.mediaId;
	const type = asset.type || "video";
	const file = new File([blob], name, {
		type: blob.type || guessMimeType({ name, type }),
		lastModified: Date.now(),
	});

	const mediaAsset: MediaAsset = {
		id: asset.mediaId,
		name,
		type,
		file,
		duration: asset.duration,
	};

	if (type === "video") {
		try {
			const videoInfo = await getVideoInfo({ videoFile: file });
			mediaAsset.duration = videoInfo.duration;
			mediaAsset.width = videoInfo.width;
			mediaAsset.height = videoInfo.height;
			mediaAsset.fps = Number.isFinite(videoInfo.fps)
				? Math.round(videoInfo.fps)
				: undefined;

			const safeDuration = Math.max(0, videoInfo.duration || 0);
			const thumbnailTime =
				safeDuration > 0 ? Math.min(1, Math.max(0, safeDuration * 0.1)) : 0;
			mediaAsset.thumbnailUrl = await generateThumbnail({
				videoFile: file,
				timeInSeconds: thumbnailTime,
			});
		} catch (error) {
			console.warn("Failed to derive imported video metadata:", error);
		}
	}

	return mediaAsset;
}

export async function importOpenCutBundle({
	file,
}: {
	file: File;
}): Promise<{ projectId: string; projectName: string; importedAssets: number }> {
	const { default: JSZip } = await import("jszip");
	const archive = await JSZip.loadAsync(file);
	const projectEntry = archive.file("project.json");
	const manifestEntry = archive.file("manifest.json");

	if (!projectEntry || !manifestEntry) {
		throw new Error("Bundle is missing project.json or manifest.json.");
	}

	const serializedProject = JSON.parse(
		await projectEntry.async("string"),
	) as SerializedProject;
	const manifest = JSON.parse(
		await manifestEntry.async("string"),
	) as ImportedBundleManifest;

	if (!serializedProject.metadata?.name) {
		throw new Error("Bundle project.json is missing metadata.");
	}

	const importedAt = new Date();
	const projectId = generateUUID();
	const project = deserializeProject({
		serializedProject,
		projectId,
		importedAt,
	});

	await storageService.saveProject({ project });

	const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
	try {
		for (const asset of assets) {
			if (!asset.mediaId || !asset.bundledFile) {
				throw new Error("Bundle manifest contains an invalid asset entry.");
			}

			const mediaEntry = archive.file(asset.bundledFile);
			if (!mediaEntry) {
				throw new Error(`Bundle is missing media file: ${asset.bundledFile}`);
			}

			const blob = await mediaEntry.async("blob");
			const mediaAsset = await buildMediaAsset({ asset, blob });
			await storageService.saveMediaAsset({
				projectId,
				mediaAsset,
			});
		}
	} catch (error) {
		await storageService.deleteProjectMedia({ projectId });
		await storageService.deleteProject({ id: projectId });
		throw error;
	}

	return {
		projectId,
		projectName: project.metadata.name,
		importedAssets: assets.length,
	};
}
