const isFirefoxPromiseApi =
  typeof browser !== "undefined" && Boolean(browser.runtime && browser.runtime.getBrowserInfo);
const extensionApi = isFirefoxPromiseApi ? browser : chrome;
const menuApi = extensionApi.menus || extensionApi.contextMenus;
const DEFAULT_ASKAI_URL = "http://localhost:3001/";
const CAPTURE_KEY_PREFIX = "askai-capture-";
const CAPTURE_INTERVAL_MS = 620;
const MAX_FULL_PAGE_TILES = 90;

const MENU_IDS = {
  fullPage: "askai-capture-full-page",
  parent: "askai-root",
  visible: "askai-capture-visible",
  selection: "askai-capture-selection",
  openApp: "askai-open-app"
};

function lastError() {
  if (typeof chrome === "undefined" || !chrome.runtime) return null;
  return chrome.runtime.lastError;
}

function callApi(namespace, method, ...args) {
  if (isFirefoxPromiseApi) {
    return namespace[method](...args);
  }

  return new Promise((resolve, reject) => {
    namespace[method](...args, (...result) => {
      const error = lastError();
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result.length > 1 ? result : result[0]);
    });
  });
}

function createContextMenus() {
  if (!menuApi) return;

  callApi(menuApi, "removeAll")
    .catch(() => undefined)
    .then(() => {
      menuApi.create({
        contexts: ["all"],
        id: MENU_IDS.parent,
        title: "ASKAI"
      });
      menuApi.create({
        contexts: ["all"],
        id: MENU_IDS.fullPage,
        parentId: MENU_IDS.parent,
        title: "전체 페이지 캡처"
      });
      menuApi.create({
        contexts: ["all"],
        id: MENU_IDS.visible,
        parentId: MENU_IDS.parent,
        title: "보이는 화면 캡처"
      });
      menuApi.create({
        contexts: ["all"],
        id: MENU_IDS.selection,
        parentId: MENU_IDS.parent,
        title: "영역 선택 캡처"
      });
      menuApi.create({
        contexts: ["all"],
        id: MENU_IDS.openApp,
        parentId: MENU_IDS.parent,
        title: "ASKAI 열기"
      });
    });
}

function getActiveTab() {
  return callApi(extensionApi.tabs, "query", { active: true, currentWindow: true }).then((tabs) => tabs && tabs[0]);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAskaiUrl() {
  const result = await callApi(extensionApi.storage.local, "get", "askaiAppUrl").catch(() => ({}));
  return result.askaiAppUrl || DEFAULT_ASKAI_URL;
}

async function cleanupOldCaptures() {
  const values = await callApi(extensionApi.storage.local, "get", null).catch(() => ({}));
  const captureKeys = Object.keys(values)
    .filter((key) => key.startsWith(CAPTURE_KEY_PREFIX))
    .sort()
    .reverse();
  const staleKeys = captureKeys.slice(8);

  if (staleKeys.length > 0) {
    await callApi(extensionApi.storage.local, "remove", staleKeys).catch(() => undefined);
  }
}

async function openViewer(payload) {
  await cleanupOldCaptures();
  const id = `${CAPTURE_KEY_PREFIX}${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await callApi(extensionApi.storage.local, "set", { [id]: payload });
  await callApi(extensionApi.tabs, "create", {
    url: extensionApi.runtime.getURL(`viewer.html?id=${encodeURIComponent(id)}`)
  });
}

async function captureVisibleTab(tab, options = {}) {
  const dataUrl = await callApi(extensionApi.tabs, "captureVisibleTab", tab.windowId, { format: "png" });
  const askaiUrl = await getAskaiUrl();

  await openViewer({
    askaiUrl,
    capturedAt: new Date().toISOString(),
    crop: options.crop || null,
    dataUrl,
    note: options.note || "",
    sourceTitle: tab.title || "현재 탭",
    sourceUrl: tab.url || "",
    title: options.title || "보이는 화면 캡처",
    version: 1
  });
}

async function ensureContentScript(tab) {
  await callApi(extensionApi.scripting, "executeScript", {
    files: ["content/selector.js"],
    target: { tabId: tab.id }
  });
}

function buildCapturePositions(maxScroll, viewportSize) {
  if (maxScroll <= 0 || viewportSize <= 0) return [0];

  const positions = [];
  for (let position = 0; position < maxScroll; position += viewportSize) {
    positions.push(Math.round(position));
  }

  const last = Math.round(maxScroll);
  if (positions[positions.length - 1] !== last) {
    positions.push(last);
  }

  return positions;
}

async function captureFullPage(tab) {
  try {
    await ensureContentScript(tab);
  } catch (error) {
    await captureVisibleTab(tab, {
      note: "이 페이지에서는 전체 페이지 스크립트를 삽입할 수 없어 보이는 화면으로 캡처했어요.",
      title: "보이는 화면 캡처"
    });
    return;
  }

  const frames = [];
  let captureError = null;
  let metrics = null;

  try {
    metrics = await callApi(extensionApi.tabs, "sendMessage", tab.id, { type: "ASKAI_FULL_PAGE_PREPARE" });
    if (!metrics || !metrics.ok) throw new Error(metrics?.error || "페이지 크기를 읽지 못했어요.");

    const xPositions = buildCapturePositions(metrics.maxScrollX, metrics.viewportWidth);
    const yPositions = buildCapturePositions(metrics.maxScrollY, metrics.viewportHeight);
    const total = xPositions.length * yPositions.length;

    if (total > MAX_FULL_PAGE_TILES) {
      throw new Error(`페이지가 너무 커서 ${total}장으로 나뉩니다. 먼저 영역 선택 캡처를 사용해줘요.`);
    }

    let index = 0;
    for (const y of yPositions) {
      for (const x of xPositions) {
        index += 1;
        const frameMetrics = await callApi(extensionApi.tabs, "sendMessage", tab.id, {
          index,
          total,
          type: "ASKAI_FULL_PAGE_SCROLL",
          x,
          y
        });
        await delay(CAPTURE_INTERVAL_MS);
        const dataUrl = await callApi(extensionApi.tabs, "captureVisibleTab", tab.windowId, { format: "png" });

        frames.push({
          dataUrl,
          dpr: frameMetrics.dpr || metrics.dpr || 1,
          height: frameMetrics.viewportHeight || metrics.viewportHeight,
          width: frameMetrics.viewportWidth || metrics.viewportWidth,
          x: frameMetrics.scrollX || 0,
          y: frameMetrics.scrollY || 0
        });
      }
    }
  } catch (error) {
    captureError = error;
  } finally {
    await callApi(extensionApi.tabs, "sendMessage", tab.id, { type: "ASKAI_FULL_PAGE_FINISH" }).catch(() => undefined);
  }

  if (captureError) {
    const message = captureError.message || "캡처 중 문제가 발생했습니다.";
    await captureVisibleTab(tab, {
      note: `전체 페이지 캡처 대신 보이는 화면만 캡처했어요. ${message}`,
      title: "보이는 화면 캡처"
    });
    return;
  }

  if (frames.length === 0 || !metrics) {
    throw new Error("전체 페이지 캡처를 만들지 못했어요.");
  }

  await openViewer({
    askaiUrl: await getAskaiUrl(),
    capturedAt: new Date().toISOString(),
    frames,
    fullPage: {
      dpr: metrics.dpr || frames[0].dpr || 1,
      height: metrics.fullHeight,
      tileCount: frames.length,
      width: metrics.fullWidth
    },
    note: `${frames.length}장의 화면을 이어붙였어요.`,
    sourceTitle: tab.title || "현재 탭",
    sourceUrl: tab.url || "",
    title: "전체 페이지 캡처",
    version: 2
  });
}

async function beginSelection(tab) {
  try {
    await ensureContentScript(tab);
    await callApi(extensionApi.tabs, "sendMessage", tab.id, { type: "ASKAI_START_SELECTION" });
  } catch (error) {
    await captureVisibleTab(tab, {
      note: "이 페이지에서는 영역 선택을 삽입할 수 없어 보이는 화면으로 캡처했어요.",
      title: "보이는 화면 캡처"
    });
  }
}

async function handleCommand(command, tabFromEvent) {
  const tab = tabFromEvent && tabFromEvent.id ? tabFromEvent : await getActiveTab();
  if (!tab || !tab.id) return { ok: false, error: "현재 탭을 찾을 수 없어요." };

  if (command === MENU_IDS.fullPage || command === "capture-full-page") {
    await captureFullPage(tab);
    return { ok: true };
  }

  if (command === MENU_IDS.visible || command === "capture-visible") {
    await captureVisibleTab(tab);
    return { ok: true };
  }

  if (command === MENU_IDS.selection || command === "capture-selection") {
    await beginSelection(tab);
    return { ok: true };
  }

  if (command === MENU_IDS.openApp || command === "open-app") {
    await callApi(extensionApi.tabs, "create", { url: await getAskaiUrl() });
    return { ok: true };
  }

  return { ok: false, error: "알 수 없는 명령입니다." };
}

async function handleSelectionDone(message, sender) {
  const tab = sender.tab;
  if (!tab || !tab.id) return { ok: false, error: "선택한 탭을 찾을 수 없어요." };

  const dpr = message.dpr || 1;
  const rect = message.rect;
  await captureVisibleTab(tab, {
    crop: {
      height: Math.round(rect.height * dpr),
      width: Math.round(rect.width * dpr),
      x: Math.round(rect.left * dpr),
      y: Math.round(rect.top * dpr)
    },
    title: "영역 선택 캡처"
  });
  return { ok: true };
}

if (extensionApi.runtime.onInstalled) {
  extensionApi.runtime.onInstalled.addListener(createContextMenus);
}

if (extensionApi.runtime.onStartup) {
  extensionApi.runtime.onStartup.addListener(createContextMenus);
}

if (menuApi) {
  menuApi.onClicked.addListener((info, tab) => {
    handleCommand(info.menuItemId, tab).catch((error) => console.error(error));
  });
}

extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const work = async () => {
    if (message.type === "ASKAI_COMMAND") {
      return handleCommand(message.command);
    }

    if (message.type === "ASKAI_SELECTION_DONE") {
      return handleSelectionDone(message, sender);
    }

    if (message.type === "ASKAI_GET_SETTINGS") {
      return { askaiUrl: await getAskaiUrl(), ok: true };
    }

    if (message.type === "ASKAI_SAVE_SETTINGS") {
      const askaiUrl = message.askaiUrl || DEFAULT_ASKAI_URL;
      await callApi(extensionApi.storage.local, "set", { askaiAppUrl: askaiUrl });
      return { askaiUrl, ok: true };
    }

    return { ok: false, error: "처리할 수 없는 메시지입니다." };
  };

  work()
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

createContextMenus();
