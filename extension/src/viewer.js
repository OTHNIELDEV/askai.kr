const extensionApi = typeof browser !== "undefined" && browser.runtime ? browser : chrome;
const isPromiseApi = typeof browser !== "undefined" && Boolean(browser.runtime && browser.runtime.getBrowserInfo);

const canvas = document.querySelector("#capture-canvas");
const ctx = canvas.getContext("2d");
const statusElement = document.querySelector("#status");
const titleElement = document.querySelector("#capture-title");
const sourceTitleElement = document.querySelector("#source-title");
const sizeElement = document.querySelector("#capture-size");
const askaiUrlInput = document.querySelector("#askai-url");
const MAX_CANVAS_DIMENSION = 32767;
const MAX_OUTPUT_PIXELS = 80_000_000;

let payload = null;

function callApi(namespace, method, ...args) {
  if (isPromiseApi) {
    return namespace[method](...args);
  }

  return new Promise((resolve, reject) => {
    namespace[method](...args, (...result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result.length > 1 ? result : result[0]);
    });
  });
}

function setStatus(message) {
  statusElement.textContent = message;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했어요."));
    image.src = src;
  });
}

function canvasToBlob() {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function drawSingleCapture() {
  const image = await loadImage(payload.dataUrl);
  const crop = payload.crop || {
    height: image.naturalHeight,
    width: image.naturalWidth,
    x: 0,
    y: 0
  };

  const sourceX = clamp(crop.x, 0, image.naturalWidth - 1);
  const sourceY = clamp(crop.y, 0, image.naturalHeight - 1);
  const sourceWidth = clamp(crop.width, 1, image.naturalWidth - sourceX);
  const sourceHeight = clamp(crop.height, 1, image.naturalHeight - sourceY);

  canvas.width = Math.round(sourceWidth);
  canvas.height = Math.round(sourceHeight);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

  titleElement.textContent = payload.title || "캡처 미리보기";
  sourceTitleElement.textContent = payload.sourceTitle || "현재 탭";
  sizeElement.textContent = `${canvas.width} x ${canvas.height}`;
  askaiUrlInput.value = payload.askaiUrl || "http://localhost:3001/";
  setStatus(payload.note || "복사하거나 PNG로 저장할 수 있어요.");
}

async function drawFullPageCapture() {
  const fullPage = payload.fullPage;
  const dpr = fullPage.dpr || payload.frames[0]?.dpr || 1;
  const pixelWidth = Math.max(1, Math.round(fullPage.width * dpr));
  const pixelHeight = Math.max(1, Math.round(fullPage.height * dpr));
  const renderScale = Math.min(
    1,
    MAX_CANVAS_DIMENSION / pixelWidth,
    MAX_CANVAS_DIMENSION / pixelHeight,
    Math.sqrt(MAX_OUTPUT_PIXELS / (pixelWidth * pixelHeight))
  );

  canvas.width = Math.max(1, Math.round(pixelWidth * renderScale));
  canvas.height = Math.max(1, Math.round(pixelHeight * renderScale));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  titleElement.textContent = payload.title || "전체 페이지 캡처";
  sourceTitleElement.textContent = payload.sourceTitle || "현재 탭";
  sizeElement.textContent =
    renderScale < 1
      ? `${canvas.width} x ${canvas.height} (${Math.round(renderScale * 100)}%)`
      : `${canvas.width} x ${canvas.height}`;
  askaiUrlInput.value = payload.askaiUrl || "http://localhost:3001/";

  for (let index = 0; index < payload.frames.length; index += 1) {
    const frame = payload.frames[index];
    setStatus(`전체 페이지 조합 중 ${index + 1} / ${payload.frames.length}`);
    const image = await loadImage(frame.dataUrl);
    const frameDpr = frame.dpr || dpr;
    const dprRatio = dpr / frameDpr;
    const destX = Math.round(frame.x * dpr * renderScale);
    const destY = Math.round(frame.y * dpr * renderScale);
    const destWidth = Math.round(image.naturalWidth * dprRatio * renderScale);
    const destHeight = Math.round(image.naturalHeight * dprRatio * renderScale);

    ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, destX, destY, destWidth, destHeight);
  }

  const scaleNote = renderScale < 1 ? ` 큰 페이지라 ${Math.round(renderScale * 100)}% 크기로 조합했어요.` : "";
  setStatus(`${payload.note || "전체 페이지 캡처가 준비되었습니다."}${scaleNote}`);
}

async function drawCapture() {
  if (payload.frames && payload.fullPage) {
    await drawFullPageCapture();
    return;
  }

  await drawSingleCapture();
}

async function readPayload() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) throw new Error("캡처 ID가 없습니다.");

  const result = await callApi(extensionApi.storage.local, "get", id);
  const nextPayload = result[id];
  if (!nextPayload) throw new Error("캡처 데이터를 찾을 수 없습니다.");
  return nextPayload;
}

async function saveAskaiUrl() {
  const askaiUrl = askaiUrlInput.value.trim();
  if (!askaiUrl) return;
  await callApi(extensionApi.storage.local, "set", { askaiAppUrl: askaiUrl });
}

async function copyPng(silent = false) {
  const blob = await canvasToBlob();
  if (!blob) throw new Error("PNG를 만들지 못했어요.");

  if (navigator.clipboard && window.ClipboardItem) {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    if (!silent) setStatus("PNG가 클립보드에 복사되었습니다.");
    return;
  }

  if (extensionApi.clipboard && extensionApi.clipboard.setImageData) {
    const arrayBuffer = await blob.arrayBuffer();
    const result = extensionApi.clipboard.setImageData(arrayBuffer, "png");
    if (result && typeof result.then === "function") {
      await result;
    }
    if (!silent) setStatus("PNG가 클립보드에 복사되었습니다.");
    return;
  }

  throw new Error("이 브라우저에서는 이미지 클립보드 복사가 지원되지 않아요.");
}

async function savePng() {
  const filename = `askai-capture-${Date.now()}.png`;
  await callApi(extensionApi.downloads, "download", {
    filename,
    saveAs: true,
    url: canvas.toDataURL("image/png")
  });
  setStatus("PNG 저장을 시작했습니다.");
}

async function copyAndOpenAskai() {
  await saveAskaiUrl();
  await copyPng(true);
  const url = askaiUrlInput.value.trim() || "http://localhost:3001/";
  await callApi(extensionApi.tabs, "create", { url });
  setStatus("복사 후 ASKAI를 열었습니다. 새 탭에서 붙여넣기 하면 됩니다.");
}

document.querySelector("#copy").addEventListener("click", () => {
  copyPng().catch((error) => setStatus(error.message));
});

document.querySelector("#save").addEventListener("click", () => {
  savePng().catch((error) => setStatus(error.message));
});

document.querySelector("#copy-open").addEventListener("click", () => {
  copyAndOpenAskai().catch((error) => setStatus(error.message));
});

askaiUrlInput.addEventListener("change", () => {
  saveAskaiUrl()
    .then(() => setStatus("ASKAI 주소가 저장되었습니다."))
    .catch((error) => setStatus(error.message));
});

readPayload()
  .then((nextPayload) => {
    payload = nextPayload;
    return drawCapture();
  })
  .catch((error) => setStatus(error.message));
