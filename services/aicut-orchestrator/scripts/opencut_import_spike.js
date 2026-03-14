(function () {
  const PROJECTS_DB = "video-editor-projects";
  const PROJECTS_STORE = "projects";
  const MEDIA_DB_PREFIX = "video-editor-media-";
  const MEDIA_STORE = "media-metadata";
  const OPFS_FALLBACK_DB_PREFIX = "video-editor-opfs-fallback-";
  const OPFS_FALLBACK_STORE = "files";
  const VERSION = 1;
  const PANEL_ID = "aicut-opencut-import-panel";
  const STATUS_ID = "aicut-opencut-import-status";
  const DROPZONE_ID = "aicut-opencut-import-dropzone";
  const ERROR_DETAILS_ID = "aicut-opencut-import-error-details";

  async function ensureJSZip() {
    if (window.JSZip) return window.JSZip;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Failed to load JSZip"));
      document.head.appendChild(script);
    });
    if (!window.JSZip) {
      throw new Error("JSZip was not loaded.");
    }
    return window.JSZip;
  }

  function openDb(dbName, storeName) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      };
    });
  }

  async function putRecord(dbName, storeName, value) {
    const db = await openDb(dbName, storeName);
    await new Promise((resolve, reject) => {
      const tx = db.transaction([storeName], "readwrite");
      const store = tx.objectStore(storeName);
      const request = store.put(value);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async function getOpfsDirectory(directoryName) {
    if (!navigator.storage || !navigator.storage.getDirectory) {
      throw new Error("OPFS is not supported in this browser.");
    }
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(directoryName, { create: true });
  }

  async function writeFileToOpfs(directoryName, key, file) {
    const dir = await getOpfsDirectory(directoryName);
    const handle = await dir.getFileHandle(key, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
  }

  function isOpfsSupported() {
    return !!(navigator.storage && navigator.storage.getDirectory);
  }

  async function writeFileToFallbackStore({ projectId, mediaId, mediaFile }) {
    const fallbackDbName = `${OPFS_FALLBACK_DB_PREFIX}media-files-${projectId}`;
    await putRecord(fallbackDbName, OPFS_FALLBACK_STORE, {
      id: mediaId,
      file: mediaFile,
      name: mediaFile.name,
      type: mediaFile.type,
      lastModified: mediaFile.lastModified,
    });
  }

  async function writeMediaFile({ projectId, mediaId, mediaFile }) {
    if (isOpfsSupported()) {
      const opfsDirectory = `media-files-${projectId}`;
      await writeFileToOpfs(opfsDirectory, mediaId, mediaFile);
      return;
    }
    await writeFileToFallbackStore({ projectId, mediaId, mediaFile });
  }

  function createVideoElement() {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    return video;
  }

  function waitForEvent(target, eventName, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const onSuccess = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Failed while waiting for ${eventName}`));
      };
      const onTimeout = () => {
        cleanup();
        reject(new Error(`Timed out waiting for ${eventName}`));
      };
      const cleanup = () => {
        target.removeEventListener(eventName, onSuccess);
        target.removeEventListener("error", onError);
        clearTimeout(timer);
      };
      const timer = setTimeout(onTimeout, timeoutMs);
      target.addEventListener(eventName, onSuccess, { once: true });
      target.addEventListener("error", onError, { once: true });
    });
  }

  async function readVideoMetadata(file, fallbackDuration) {
    const objectUrl = URL.createObjectURL(file);
    const video = createVideoElement();
    try {
      video.src = objectUrl;
      video.load();
      await waitForEvent(video, "loadedmetadata");

      const duration =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : (typeof fallbackDuration === "number" ? fallbackDuration : undefined);
      const width = Number.isFinite(video.videoWidth) ? video.videoWidth : undefined;
      const height = Number.isFinite(video.videoHeight) ? video.videoHeight : undefined;

      let thumbnailUrl;
      if (width && height) {
        const seekTime =
          duration && duration > 0 ? Math.max(0, Math.min(duration * 0.1, duration - 0.05)) : 0;
        if (seekTime > 0) {
          video.currentTime = seekTime;
          await waitForEvent(video, "seeked", 6000);
        }

        const maxThumbWidth = 512;
        const scale = Math.min(1, maxThumbWidth / width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext("2d");
        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnailUrl = canvas.toDataURL("image/jpeg", 0.82);
        }
      }

      return { duration, width, height, thumbnailUrl };
    } catch (error) {
      console.warn("[aicut] Could not extract video metadata/thumbnail:", error);
      return {
        duration: typeof fallbackDuration === "number" ? fallbackDuration : undefined,
      };
    } finally {
      video.removeAttribute("src");
      video.load();
      video.remove();
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function enrichMediaMetadata({ mediaFile, mediaType, fallbackDuration }) {
    if (mediaType !== "video") {
      return { duration: fallbackDuration };
    }
    return readVideoMetadata(mediaFile, fallbackDuration);
  }

  function guessMediaType(name) {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (["mp4", "mov", "mkv", "webm", "avi", "m4v"].includes(ext)) return "video";
    if (["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(ext)) return "audio";
    if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "image";
    return "video";
  }

  function guessMimeType(name, mediaType) {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (mediaType === "video") {
      if (ext === "mov") return "video/quicktime";
      if (ext === "webm") return "video/webm";
      if (ext === "mkv") return "video/x-matroska";
      if (ext === "avi") return "video/x-msvideo";
      return "video/mp4";
    }
    if (mediaType === "audio") {
      if (ext === "mp3") return "audio/mpeg";
      if (ext === "wav") return "audio/wav";
      if (ext === "m4a") return "audio/mp4";
      if (ext === "aac") return "audio/aac";
      if (ext === "ogg") return "audio/ogg";
      return "audio/*";
    }
    if (mediaType === "image") {
      if (ext === "png") return "image/png";
      if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
      if (ext === "webp") return "image/webp";
      if (ext === "svg") return "image/svg+xml";
      return "image/*";
    }
    return "application/octet-stream";
  }

  async function parseBundle(file) {
    const JSZip = await ensureJSZip();
    const zip = await JSZip.loadAsync(file);
    const projectEntry = zip.file("project.json");
    const manifestEntry = zip.file("manifest.json");
    if (!projectEntry || !manifestEntry) {
      throw new Error("Bundle is missing project.json or manifest.json.");
    }

    const project = JSON.parse(await projectEntry.async("string"));
    const manifest = JSON.parse(await manifestEntry.async("string"));
    return { zip, project, manifest };
  }

  async function importBundle(file) {
    const { zip, project, manifest } = await parseBundle(file);
    const projectId = project?.metadata?.id;
    if (!projectId) {
      throw new Error("project.json is missing metadata.id.");
    }

    const assetEntries = Array.isArray(manifest.assets) ? manifest.assets : [];
    const mediaDbName = `${MEDIA_DB_PREFIX}${projectId}`;
    for (const asset of assetEntries) {
      const bundleFile = asset.bundledFile;
      const mediaId = asset.mediaId;
      if (!bundleFile || !mediaId) {
        throw new Error("Invalid manifest asset entry: missing bundledFile or mediaId.");
      }
      const zipEntry = zip.file(bundleFile);
      if (!zipEntry) {
        throw new Error(`Bundle is missing media file: ${bundleFile}`);
      }
      const blob = await zipEntry.async("blob");
      const fileName = asset.originalName || bundleFile.split("/").pop() || mediaId;
      const mediaType = asset.type || guessMediaType(fileName);
      const mediaFile = new File([blob], fileName, {
        type: blob.type || guessMimeType(fileName, mediaType),
        lastModified: Date.now(),
      });

      const derived = await enrichMediaMetadata({
        mediaFile,
        mediaType,
        fallbackDuration: asset.duration,
      });

      await writeMediaFile({ projectId, mediaId, mediaFile });
      await putRecord(mediaDbName, MEDIA_STORE, {
        id: mediaId,
        name: fileName,
        type: mediaType,
        size: mediaFile.size,
        lastModified: mediaFile.lastModified,
        duration:
          typeof derived.duration === "number" ? derived.duration : asset.duration,
        ...(typeof derived.width === "number" ? { width: derived.width } : {}),
        ...(typeof derived.height === "number" ? { height: derived.height } : {}),
        ...(typeof derived.thumbnailUrl === "string"
          ? { thumbnailUrl: derived.thumbnailUrl }
          : {}),
      });
    }

    await putRecord(PROJECTS_DB, PROJECTS_STORE, {
      id: projectId,
      ...project,
    });

    return {
      projectId,
      importedAssets: assetEntries.length,
      projectName: project.metadata.name,
    };
  }

  async function importAICutOpenCutBundle(file) {
    let bundle = file;
    if (!bundle) {
      bundle = await pickBundleFile();
    }
    if (!bundle) {
      throw new Error("No bundle selected.");
    }
    setErrorDetails(null);
    setStatus(`Importing ${bundle.name} ...`, "busy");
    const result = await importBundle(bundle);
    console.log("[aicut] OpenCut import complete:", result);
    setStatus(
      `Imported ${result.projectName} (${result.importedAssets} assets). Reload if it does not appear immediately.`,
      "success"
    );
    return result;
  }

  async function pickBundleFile() {
    if (window.showOpenFilePicker) {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "OpenCut bundle",
            accept: {
              "application/zip": [".opencut", ".zip"],
            },
          },
        ],
      });
      return handle ? handle.getFile() : null;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".opencut,.zip";
    const selected = await new Promise((resolve) => {
      input.onchange = () => resolve(input.files?.[0] || null);
      input.click();
    });
    return selected;
  }

  function ensurePanelStyles() {
    if (document.getElementById(`${PANEL_ID}-styles`)) {
      return;
    }
    const style = document.createElement("style");
    style.id = `${PANEL_ID}-styles`;
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        width: 320px;
        background: rgba(16, 18, 24, 0.96);
        color: #f5f7fb;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 14px;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
        z-index: 2147483647;
        font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow: hidden;
      }
      #${PANEL_ID} * {
        box-sizing: border-box;
      }
      #${PANEL_ID} .aicut-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      #${PANEL_ID} .aicut-title {
        font-weight: 700;
        letter-spacing: 0.01em;
      }
      #${PANEL_ID} .aicut-close {
        appearance: none;
        border: 0;
        background: transparent;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }
      #${PANEL_ID} .aicut-body {
        padding: 14px;
      }
      #${DROPZONE_ID} {
        border: 1px dashed rgba(255, 255, 255, 0.28);
        border-radius: 12px;
        padding: 18px 14px;
        text-align: center;
        background: rgba(255, 255, 255, 0.04);
        transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
      }
      #${DROPZONE_ID}.dragover {
        border-color: #76e4b3;
        background: rgba(118, 228, 179, 0.12);
        transform: translateY(-1px);
      }
      #${PANEL_ID} .aicut-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }
      #${PANEL_ID} .aicut-button {
        appearance: none;
        border: 0;
        border-radius: 10px;
        padding: 10px 12px;
        font: inherit;
        cursor: pointer;
      }
      #${PANEL_ID} .aicut-button-primary {
        background: #76e4b3;
        color: #102018;
        font-weight: 700;
      }
      #${PANEL_ID} .aicut-button-secondary {
        background: rgba(255, 255, 255, 0.08);
        color: #f5f7fb;
      }
      #${STATUS_ID} {
        margin-top: 12px;
        min-height: 38px;
        border-radius: 10px;
        padding: 9px 10px;
        background: rgba(255, 255, 255, 0.05);
        color: rgba(245, 247, 251, 0.84);
      }
      #${STATUS_ID}[data-state="success"] {
        background: rgba(118, 228, 179, 0.16);
        color: #d7fff0;
      }
      #${STATUS_ID}[data-state="error"] {
        background: rgba(255, 107, 107, 0.14);
        color: #ffd8d8;
      }
      #${STATUS_ID}[data-state="busy"] {
        background: rgba(255, 214, 102, 0.14);
        color: #fff0c2;
      }
    `;
    document.head.appendChild(style);
  }

  function setStatus(message, state = "idle") {
    const statusNode = document.getElementById(STATUS_ID);
    if (!statusNode) {
      return;
    }
    statusNode.textContent = message;
    statusNode.dataset.state = state;
  }

  function setErrorDetails(error, context = "") {
    const node = document.getElementById(ERROR_DETAILS_ID);
    if (!node) {
      return;
    }
    if (!error) {
      node.open = false;
      node.hidden = true;
      const textNode = node.querySelector("pre");
      if (textNode) {
        textNode.textContent = "";
      }
      return;
    }

    const message =
      typeof error?.message === "string" && error.message.trim()
        ? error.message.trim()
        : String(error);
    const stack = typeof error?.stack === "string" ? error.stack.trim() : "";
    const details = [
      context ? `Context: ${context}` : "",
      `Message: ${message}`,
      stack ? `Stack:\n${stack}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const textNode = node.querySelector("pre");
    if (textNode) {
      textNode.textContent = details;
    }
    node.hidden = false;
    node.open = true;
  }

  function ensurePanel() {
    ensurePanelStyles();
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      return existing;
    }

    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="aicut-header">
        <div class="aicut-title">aicut OpenCut Import</div>
        <button class="aicut-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="aicut-body">
        <div id="${DROPZONE_ID}">
          Drop a <strong>.opencut</strong> bundle here
          <div style="margin-top:6px; opacity:0.72;">or use the picker below</div>
        </div>
        <div class="aicut-actions">
          <button class="aicut-button aicut-button-primary" type="button" data-action="pick">Choose Bundle</button>
          <button class="aicut-button aicut-button-secondary" type="button" data-action="reload">Reload</button>
        </div>
        <div id="${STATUS_ID}" data-state="idle">Ready. Drop a bundle or choose a file.</div>
        <details id="${ERROR_DETAILS_ID}" hidden>
          <summary>Show import error details</summary>
          <pre style="white-space: pre-wrap; margin: 8px 0 0; max-height: 180px; overflow: auto;"></pre>
        </details>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector(".aicut-close")?.addEventListener("click", () => {
      panel.remove();
    });
    panel.querySelector('[data-action="reload"]')?.addEventListener("click", () => {
      window.location.reload();
    });
    panel.querySelector('[data-action="pick"]')?.addEventListener("click", async () => {
      try {
        await importAICutOpenCutBundle();
      } catch (error) {
        console.error("[aicut] OpenCut import failed:", error);
        setStatus(error?.message || String(error), "error");
        setErrorDetails(error, "Choose Bundle action");
      }
    });

    const dropzone = panel.querySelector(`#${DROPZONE_ID}`);
    if (dropzone) {
      ["dragenter", "dragover"].forEach((eventName) => {
        dropzone.addEventListener(eventName, (event) => {
          event.preventDefault();
          dropzone.classList.add("dragover");
        });
      });
      ["dragleave", "dragend", "drop"].forEach((eventName) => {
        dropzone.addEventListener(eventName, (event) => {
          event.preventDefault();
          dropzone.classList.remove("dragover");
        });
      });
      dropzone.addEventListener("drop", async (event) => {
        try {
          const file = event.dataTransfer?.files?.[0];
          if (!file) {
            throw new Error("Drop a valid .opencut bundle.");
          }
          await importAICutOpenCutBundle(file);
        } catch (error) {
          console.error("[aicut] OpenCut import failed:", error);
          setStatus(error?.message || String(error), "error");
          setErrorDetails(error, "Drag-and-drop action");
        }
      });
    }

    return panel;
  }

  function installAICutOpenCutOverlay() {
    const panel = ensurePanel();
    setStatus("Ready. Drop a bundle or choose a file.");
    return panel;
  }

  window.importAICutOpenCutBundle = importAICutOpenCutBundle;
  window.installAICutOpenCutOverlay = installAICutOpenCutOverlay;
  installAICutOpenCutOverlay();
  console.log(
    "[aicut] OpenCut import spike loaded. Overlay installed. Run: await importAICutOpenCutBundle()"
  );
})();
