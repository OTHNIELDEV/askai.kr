(function initAskaiSelector() {
  if (window.__ASKAI_SELECTOR_READY__) return;
  window.__ASKAI_SELECTOR_READY__ = true;

  const extensionApi = typeof browser !== "undefined" && browser.runtime ? browser : chrome;
  let overlayHost = null;
  let startPoint = null;
  let currentBox = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getRect(start, end) {
    const left = clamp(Math.min(start.x, end.x), 0, window.innerWidth);
    const top = clamp(Math.min(start.y, end.y), 0, window.innerHeight);
    const right = clamp(Math.max(start.x, end.x), 0, window.innerWidth);
    const bottom = clamp(Math.max(start.y, end.y), 0, window.innerHeight);

    return {
      height: bottom - top,
      left,
      top,
      width: right - left
    };
  }

  function sendMessage(message) {
    const result = extensionApi.runtime.sendMessage(message);
    if (result && typeof result.catch === "function") {
      result.catch(() => undefined);
    }
  }

  function cleanup() {
    document.removeEventListener("keydown", handleKeyDown, true);
    if (overlayHost) {
      overlayHost.remove();
      overlayHost = null;
    }
    startPoint = null;
    currentBox = null;
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      cleanup();
      sendMessage({ type: "ASKAI_SELECTION_CANCELLED" });
    }
  }

  function startSelection() {
    cleanup();

    overlayHost = document.createElement("div");
    overlayHost.id = "askai-selection-host";
    overlayHost.style.position = "fixed";
    overlayHost.style.inset = "0";
    overlayHost.style.zIndex = "2147483647";
    overlayHost.style.pointerEvents = "auto";
    document.documentElement.appendChild(overlayHost);

    const root = overlayHost.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .layer {
          background: rgba(17, 19, 24, 0.58);
          cursor: crosshair;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          inset: 0;
          position: fixed;
          user-select: none;
        }

        .hint {
          align-items: center;
          color: #fffef7;
          display: grid;
          gap: 9px;
          justify-items: center;
          left: 50%;
          line-height: 1.3;
          pointer-events: none;
          position: fixed;
          text-align: center;
          text-shadow: 0 2px 18px rgba(0, 0, 0, 0.45);
          top: 50%;
          transform: translate(-50%, -50%);
        }

        .face {
          align-items: center;
          border: 3px solid #fffef7;
          border-radius: 8px;
          display: flex;
          font-size: 32px;
          font-weight: 900;
          height: 64px;
          justify-content: center;
          width: 64px;
        }

        strong {
          font-size: 25px;
          font-weight: 850;
        }

        span {
          font-size: 16px;
          font-weight: 750;
        }

        .box {
          background: rgba(47, 125, 246, 0.15);
          border: 2px solid #2f7df6;
          box-shadow:
            0 0 0 9999px rgba(17, 19, 24, 0.18),
            0 0 0 1px rgba(255, 255, 255, 0.82) inset;
          display: none;
          position: fixed;
        }

        .cancel {
          background: rgba(255, 254, 247, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.74);
          border-radius: 8px;
          color: #fffef7;
          font-size: 14px;
          font-weight: 850;
          left: 50%;
          min-height: 38px;
          padding: 0 16px;
          position: fixed;
          top: calc(50% + 110px);
          transform: translateX(-50%);
        }
      </style>
      <div class="layer">
        <div class="hint">
          <div class="face">+</div>
          <strong>드래그해서 캡처할 영역을 선택하세요.</strong>
          <span>ESC 키를 누르면 취소됩니다.</span>
        </div>
        <div class="box"></div>
        <button class="cancel" type="button">취소</button>
      </div>
    `;

    const layer = root.querySelector(".layer");
    const cancel = root.querySelector(".cancel");
    currentBox = root.querySelector(".box");

    cancel.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cleanup();
    });

    layer.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      layer.setPointerCapture(event.pointerId);
      startPoint = { x: event.clientX, y: event.clientY };
      currentBox.style.display = "block";
      currentBox.style.left = `${startPoint.x}px`;
      currentBox.style.top = `${startPoint.y}px`;
      currentBox.style.width = "0px";
      currentBox.style.height = "0px";
    });

    layer.addEventListener("pointermove", (event) => {
      if (!startPoint || !currentBox) return;
      event.preventDefault();
      const rect = getRect(startPoint, { x: event.clientX, y: event.clientY });
      currentBox.style.left = `${rect.left}px`;
      currentBox.style.top = `${rect.top}px`;
      currentBox.style.width = `${rect.width}px`;
      currentBox.style.height = `${rect.height}px`;
    });

    layer.addEventListener("pointerup", (event) => {
      if (!startPoint) return;
      event.preventDefault();
      const rect = getRect(startPoint, { x: event.clientX, y: event.clientY });
      cleanup();

      if (rect.width < 12 || rect.height < 12) return;

      window.setTimeout(() => {
        sendMessage({
          dpr: window.devicePixelRatio || 1,
          rect,
          type: "ASKAI_SELECTION_DONE",
          viewport: {
            height: window.innerHeight,
            width: window.innerWidth
          }
        });
      }, 90);
    });

    document.addEventListener("keydown", handleKeyDown, true);
  }

  extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "ASKAI_START_SELECTION") {
      startSelection();
      if (sendResponse) sendResponse({ ok: true });
    }
    return true;
  });
})();
