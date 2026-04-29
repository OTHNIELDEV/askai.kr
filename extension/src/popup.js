const extensionApi = typeof browser !== "undefined" && browser.runtime ? browser : chrome;
const isPromiseApi = typeof browser !== "undefined" && Boolean(browser.runtime && browser.runtime.getBrowserInfo);
const statusElement = document.querySelector("#status");
const askaiUrlInput = document.querySelector("#askai-url");

function sendMessage(message) {
  if (isPromiseApi) {
    return extensionApi.runtime.sendMessage(message);
  }

  return new Promise((resolve) => {
    extensionApi.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }
      resolve(response);
    });
  });
}

async function saveAskaiUrl() {
  const askaiUrl = askaiUrlInput.value.trim();
  if (!askaiUrl) return;
  await sendMessage({ askaiUrl, type: "ASKAI_SAVE_SETTINGS" });
}

async function loadSettings() {
  const response = await sendMessage({ type: "ASKAI_GET_SETTINGS" });
  askaiUrlInput.value = response.askaiUrl || "http://localhost:3001/";
}

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", async () => {
    const command = button.dataset.command;
    statusElement.textContent = "ASKAI가 처리 중입니다...";
    await saveAskaiUrl();
    const response = await sendMessage({ command, type: "ASKAI_COMMAND" });

    if (!response || !response.ok) {
      statusElement.textContent = response?.error || "작업을 처리하지 못했어요.";
      return;
    }

    statusElement.textContent = "완료되었습니다.";
    if (command !== "open-app") {
      window.close();
    }
  });
});

askaiUrlInput.addEventListener("change", () => {
  saveAskaiUrl().catch(() => undefined);
});

loadSettings().catch(() => {
  askaiUrlInput.value = "http://localhost:3001/";
});
