"use client";

import {
  ArrowDownToLine,
  ArrowUpRight,
  Circle,
  Clipboard,
  ClipboardCheck,
  Eraser,
  Highlighter,
  ImagePlus,
  Minus,
  Move,
  MousePointer2,
  PenLine,
  Plus,
  RectangleHorizontal,
  RotateCcw,
  Sparkles,
  Trash2,
  Type,
  Undo2
} from "lucide-react";
import { PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 780;
const TEXT_FONT = "700 32px 'IBM Plex Sans KR', 'Avenir Next', sans-serif";
const TEXT_PADDING_X = 16;
const TEXT_PADDING_Y = 11;
const TEXT_BOX_HEIGHT = 50;

type Tool = "select" | "pen" | "marker" | "arrow" | "rect" | "ellipse" | "text" | "erase";

type Point = {
  x: number;
  y: number;
};

type DrawAction = {
  id: string;
  tool: Exclude<Tool, "select">;
  points: Point[];
  color: string;
  width: number;
  label?: string;
};

type ClipboardItemConstructor = typeof ClipboardItem;

declare global {
  interface Window {
    ClipboardItem?: ClipboardItemConstructor;
  }
}

const tools: Array<{ id: Tool; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: "select", label: "선택", icon: MousePointer2 },
  { id: "pen", label: "펜", icon: PenLine },
  { id: "marker", label: "형광", icon: Highlighter },
  { id: "arrow", label: "화살표", icon: ArrowUpRight },
  { id: "rect", label: "박스", icon: RectangleHorizontal },
  { id: "ellipse", label: "원", icon: Circle },
  { id: "text", label: "이름표", icon: Type },
  { id: "erase", label: "지우개", icon: Eraser }
];

const swatches = ["#ff4d4d", "#f6c945", "#2ac36a", "#2f7df6", "#111318", "#ffffff"];

function getTextLabel(action: DrawAction) {
  return action.label?.trim() || "이름표";
}

function getTextBounds(ctx: CanvasRenderingContext2D, action: DrawAction) {
  const start = action.points[0];
  const label = getTextLabel(action);

  ctx.save();
  ctx.font = TEXT_FONT;
  const metrics = ctx.measureText(label);
  ctx.restore();

  return {
    label,
    x: start.x,
    y: start.y - TEXT_BOX_HEIGHT + 10,
    width: metrics.width + TEXT_PADDING_X * 2,
    height: TEXT_BOX_HEIGHT
  };
}

function findTextActionAtPoint(ctx: CanvasRenderingContext2D, actions: DrawAction[], point: Point) {
  const hitPadding = 8;

  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index];
    if (action.tool !== "text") continue;

    const bounds = getTextBounds(ctx, action);
    const isInside =
      point.x >= bounds.x - hitPadding &&
      point.x <= bounds.x + bounds.width + hitPadding &&
      point.y >= bounds.y - hitPadding &&
      point.y <= bounds.y + bounds.height + hitPadding;

    if (isInside) return action;
  }

  return null;
}

function drawArrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, width: number) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const headLength = Math.max(16, width * 5);

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLength * Math.cos(angle - Math.PI / 6),
    to.y - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLength * Math.cos(angle + Math.PI / 6),
    to.y - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

function drawAction(ctx: CanvasRenderingContext2D, action: DrawAction) {
  if (action.points.length === 0) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = action.color;
  ctx.fillStyle = action.color;
  ctx.lineWidth = action.width;

  if (action.tool === "marker") {
    ctx.globalAlpha = 0.36;
    ctx.lineWidth = action.width * 3.2;
    ctx.beginPath();
    action.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (action.tool === "pen" || action.tool === "erase") {
    if (action.tool === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = action.width;
    }

    ctx.beginPath();
    action.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
    return;
  }

  const start = action.points[0];
  const end = action.points[action.points.length - 1];

  if (action.tool === "arrow") {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    drawArrowHead(ctx, start, end, action.width);
  }

  if (action.tool === "rect") {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    ctx.strokeRect(x, y, width, height);
  }

  if (action.tool === "ellipse") {
    const radiusX = Math.abs(end.x - start.x) / 2;
    const radiusY = Math.abs(end.y - start.y) / 2;
    const centerX = Math.min(start.x, end.x) + radiusX;
    const centerY = Math.min(start.y, end.y) + radiusY;

    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (action.tool === "text") {
    const bounds = getTextBounds(ctx, action);

    ctx.fillStyle = action.color;
    ctx.beginPath();
    ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 8);
    ctx.fill();
    ctx.font = TEXT_FONT;
    ctx.fillStyle = action.color === "#ffffff" ? "#111318" : "#fffef7";
    ctx.fillText(bounds.label, start.x + TEXT_PADDING_X, start.y - TEXT_PADDING_Y);
  }

  ctx.restore();
}

function fitImage(
  image: HTMLImageElement,
  boxWidth: number,
  boxHeight: number
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
    width,
    height
  };
}

function getImageFrame(image: HTMLImageElement, scale: number, offset: Point) {
  const baseFrame = fitImage(image, CANVAS_WIDTH - 72, CANVAS_HEIGHT - 72);
  const width = baseFrame.width * scale;
  const height = baseFrame.height * scale;

  return {
    x: CANVAS_WIDTH / 2 - width / 2 + offset.x,
    y: CANVAS_HEIGHT / 2 - height / 2 + offset.y,
    width,
    height
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampImageOffset(offset: Point, image: HTMLImageElement | null, scale: number): Point {
  if (!image) return offset;

  const baseFrame = fitImage(image, CANVAS_WIDTH - 72, CANVAS_HEIGHT - 72);
  const width = baseFrame.width * scale;
  const height = baseFrame.height * scale;
  const minVisible = 96;
  const maxX = (CANVAS_WIDTH + width) / 2 - minVisible;
  const maxY = (CANVAS_HEIGHT + height) / 2 - minVisible;

  return {
    x: clamp(offset.x, -maxX, maxX),
    y: clamp(offset.y, -maxY, maxY)
  };
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#ff4d4d");
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [eraserWidth, setEraserWidth] = useState(28);
  const [labelText, setLabelText] = useState("이름표");
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [draftAction, setDraftAction] = useState<DrawAction | null>(null);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [imageScale, setImageScale] = useState(1);
  const [imageOffset, setImageOffset] = useState<Point>({ x: 0, y: 0 });
  const [imageDrag, setImageDrag] = useState<{ start: Point; offset: Point } | null>(null);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [status, setStatus] = useState("대기 중");
  const [hasCopied, setHasCopied] = useState(false);
  const [snapshots, setSnapshots] = useState<string[]>([]);

  const selectedTool = useMemo(() => tools.find((tool) => tool.id === activeTool), [activeTool]);
  const selectedTextAction = useMemo(
    () => actions.find((action) => action.id === selectedTextId && action.tool === "text"),
    [actions, selectedTextId]
  );

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = "#fffef7";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();
    ctx.strokeStyle = "rgba(17, 19, 24, 0.055)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= CANVAS_WIDTH; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= CANVAS_HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();

    if (baseImage) {
      const frame = getImageFrame(baseImage, imageScale, imageOffset);
      ctx.save();
      ctx.shadowColor = "rgba(17, 19, 24, 0.22)";
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 14;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(frame.x - 10, frame.y - 10, frame.width + 20, frame.height + 20);
      ctx.drawImage(baseImage, frame.x, frame.y, frame.width, frame.height);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = "#111318";
      ctx.globalAlpha = 0.9;
      ctx.font = "800 58px 'Avenir Next', 'IBM Plex Sans KR', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ASKAI", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 26);
      ctx.font = "600 24px 'IBM Plex Sans KR', 'Avenir Next', sans-serif";
      ctx.globalAlpha = 0.52;
      ctx.fillText("아스카이 · ⌘V / Ctrl+V", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
      ctx.restore();
    }

    actions.forEach((action) => drawAction(ctx, action));
    if (draftAction) drawAction(ctx, draftAction);
  }, [actions, baseImage, draftAction, imageOffset, imageScale]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  useEffect(() => {
    if (selectedTextId && !selectedTextAction) {
      setSelectedTextId(null);
    }
  }, [selectedTextAction, selectedTextId]);

  const setImageFromFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setBaseImage(image);
      setActions([]);
      setSelectedTextId(null);
      setDraftAction(null);
      setImageDrag(null);
      setImageScale(1);
      setImageOffset({ x: 0, y: 0 });
      setStatus("이미지 붙여넣음");
      URL.revokeObjectURL(url);
    };
    image.src = url;
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;
      event.preventDefault();
      setImageFromFile(file);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [setImageFromFile]);

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT
    };
  };

  const updateImageScale = useCallback(
    (nextScale: number) => {
      if (!baseImage) return;

      const clampedScale = clamp(nextScale, 0.45, 2.4);
      setImageScale(clampedScale);
      setImageOffset((current) => clampImageOffset(current, baseImage, clampedScale));
      setStatus(`이미지 ${Math.round(clampedScale * 100)}%`);
    },
    [baseImage]
  );

  const resetImageTransform = () => {
    setImageScale(1);
    setImageOffset({ x: 0, y: 0 });
    setImageDrag(null);
    setStatus("이미지 맞춤");
  };

  const updateLabelText = (value: string) => {
    setLabelText(value);

    if (!selectedTextId) return;

    setActions((current) =>
      current.map((action) =>
        action.id === selectedTextId && action.tool === "text" ? { ...action, label: value } : action
      )
    );
    setStatus("이름표 수정됨");
  };

  const updateActiveWidth = (nextWidth: number) => {
    if (activeTool === "erase") {
      setEraserWidth(nextWidth);
      setStatus(`지우개 ${nextWidth}`);
      return;
    }

    setStrokeWidth(nextWidth);
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event);

    if (activeTool === "select") {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const textHit = ctx ? findTextActionAtPoint(ctx, actions, point) : null;

      if (textHit) {
        setSelectedTextId(textHit.id);
        setLabelText(getTextLabel(textHit));
        setStatus("이름표 선택됨");
        return;
      }

      setSelectedTextId(null);
      if (!baseImage) {
        setStatus("선택 해제됨");
        return;
      }

      setImageDrag({ start: point, offset: imageOffset });
      setStatus("이미지 이동 중");
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }

    const nextAction: DrawAction = {
      id: makeId(),
      tool: activeTool,
      points: activeTool === "text" ? [point] : [point, point],
      color,
      width: activeTool === "erase" ? eraserWidth : strokeWidth,
      label: activeTool === "text" ? labelText : undefined
    };

    if (activeTool === "text") {
      setActions((current) => [...current, nextAction]);
      setSelectedTextId(nextAction.id);
      setStatus("이름표 추가됨");
      return;
    }

    setSelectedTextId(null);
    setIsPointerDown(true);
    setDraftAction(nextAction);
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (imageDrag) {
      const point = getCanvasPoint(event);
      const nextOffset = {
        x: imageDrag.offset.x + point.x - imageDrag.start.x,
        y: imageDrag.offset.y + point.y - imageDrag.start.y
      };
      setImageOffset(clampImageOffset(nextOffset, baseImage, imageScale));
      return;
    }

    if (!isPointerDown || !draftAction) return;

    const point = getCanvasPoint(event);

    setDraftAction((current) => {
      if (!current) return current;

      if (current.tool === "pen" || current.tool === "marker" || current.tool === "erase") {
        return { ...current, points: [...current.points, point] };
      }

      return { ...current, points: [current.points[0], point] };
    });
  };

  const finishDraft = (event: PointerEvent<HTMLCanvasElement>) => {
    if (imageDrag) {
      setImageDrag(null);
      setStatus("이미지 위치 조정됨");
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }

    if (!isPointerDown || !draftAction) return;

    setIsPointerDown(false);
    setActions((current) => [...current, draftAction]);
    setDraftAction(null);
    setStatus("마크업 추가됨");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const copyCanvas = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;

    const previewUrl = URL.createObjectURL(blob);
    setSnapshots((current) => {
      current.slice(2).forEach((snapshot) => URL.revokeObjectURL(snapshot));
      return [previewUrl, ...current.slice(0, 2)];
    });

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
        setHasCopied(true);
        setStatus("PNG 클립보드 복사됨");
        window.setTimeout(() => setHasCopied(false), 1800);
      } else {
        setStatus("브라우저 클립보드 권한 필요");
      }
    } catch {
      setStatus("복사 권한을 확인해줘");
    }
  };

  const removeSnapshot = (snapshotUrl: string) => {
    setSnapshots((current) => current.filter((snapshot) => snapshot !== snapshotUrl));
    URL.revokeObjectURL(snapshotUrl);
    setStatus("미리보기 삭제됨");
  };

  const clearSnapshots = () => {
    snapshots.forEach((snapshot) => URL.revokeObjectURL(snapshot));
    setSnapshots([]);
    setStatus("미리보기 비움");
  };

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = `askai-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    setStatus("PNG 저장됨");
  };

  const loadDemo = () => {
    const demo = document.createElement("canvas");
    demo.width = 1100;
    demo.height = 660;
    const ctx = demo.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#f4f1e7";
    ctx.fillRect(0, 0, demo.width, demo.height);
    ctx.fillStyle = "#111318";
    ctx.font = "800 38px Avenir Next, sans-serif";
    ctx.fillText("Chat Context Draft", 52, 78);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(52, 122, 996, 420);
    ctx.strokeStyle = "#d6d1c3";
    ctx.lineWidth = 2;
    ctx.strokeRect(52, 122, 996, 420);
    ctx.fillStyle = "#253041";
    ctx.font = "700 26px Avenir Next, sans-serif";
    ctx.fillText("Upload screenshot", 98, 190);
    ctx.fillStyle = "#717171";
    ctx.font = "500 22px Avenir Next, sans-serif";
    ctx.fillText("The assistant keeps missing this button state.", 98, 238);
    ctx.fillStyle = "#eef3ff";
    ctx.fillRect(98, 300, 410, 112);
    ctx.fillStyle = "#2f7df6";
    ctx.fillRect(128, 332, 182, 48);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 20px Avenir Next, sans-serif";
    ctx.fillText("Copy result", 158, 364);
    ctx.fillStyle = "#fffbeb";
    ctx.fillRect(560, 300, 382, 112);
    ctx.fillStyle = "#111318";
    ctx.font = "700 18px Avenir Next, sans-serif";
    ctx.fillText("Expected: preview stays attached", 594, 346);
    ctx.fillText("Actual: input loses focus", 594, 382);
    ctx.strokeStyle = "#111318";
    ctx.setLineDash([12, 12]);
    ctx.strokeRect(82, 282, 894, 154);

    const image = new Image();
    image.onload = () => {
      setBaseImage(image);
      setActions([]);
      setSelectedTextId(null);
      setDraftAction(null);
      setImageDrag(null);
      setImageScale(1);
      setImageOffset({ x: 0, y: 0 });
      setStatus("샘플 로드됨");
    };
    image.src = demo.toDataURL("image/png");
  };

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="ASKAI top controls">
        <div className="brand-block">
          <div className="brand-mark">
            <Sparkles size={19} />
          </div>
          <div>
            <p className="eyebrow">AI visual clipboard</p>
            <h1>
              <span>ASKAI</span>
              <small>아스카이</small>
            </h1>
          </div>
        </div>

        <div className="status-pill" aria-live="polite">
          {hasCopied ? <ClipboardCheck size={18} /> : <Clipboard size={18} />}
          <span>{status}</span>
        </div>

        <div className="top-actions">
          <button className="ghost-button" type="button" onClick={loadDemo}>
            <ImagePlus size={18} />
            샘플
          </button>
          <button className="primary-button" type="button" onClick={copyCanvas}>
            <ClipboardCheck size={18} />
            복사
          </button>
        </div>
      </section>

      <section className="workspace">
        <aside className="tool-rail" aria-label="Drawing tools">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                aria-label={tool.label}
                className={tool.id === activeTool ? "tool-button active" : "tool-button"}
                key={tool.id}
                onClick={() => {
                  setActiveTool(tool.id);
                  if (tool.id !== "select") {
                    setSelectedTextId(null);
                  }
                }}
                title={tool.label}
                type="button"
              >
                <Icon size={21} />
              </button>
            );
          })}
        </aside>

        <section className="canvas-stage" aria-label="Markup canvas">
          <div className="canvas-head">
            <div>
              <p>{selectedTool?.label ?? "도구"}</p>
              <strong>1280 x 780</strong>
            </div>
            <div className="canvas-actions">
              <input
                accept="image/*"
                className="visually-hidden"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) setImageFromFile(file);
                }}
                ref={fileRef}
                type="file"
              />
              <button className="icon-text-button" onClick={() => fileRef.current?.click()} type="button">
                <ImagePlus size={17} />
                이미지
              </button>
              <button
                className="icon-button"
                disabled={actions.length === 0}
                onClick={() => setActions((current) => current.slice(0, -1))}
                title="되돌리기"
                type="button"
              >
                <Undo2 size={18} />
              </button>
              <button
                className="icon-button"
                disabled={actions.length === 0 && !baseImage}
                onClick={() => {
                  setActions([]);
                  setSelectedTextId(null);
                  setDraftAction(null);
                  setBaseImage(null);
                  setImageDrag(null);
                  setImageScale(1);
                  setImageOffset({ x: 0, y: 0 });
                  setStatus("캔버스 초기화됨");
                }}
                title="초기화"
                type="button"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          <canvas
            aria-label="ASKAI canvas"
            className={`draw-canvas${activeTool === "select" && baseImage ? " is-pannable" : ""}${
              imageDrag ? " is-panning" : ""
            }`}
            height={CANVAS_HEIGHT}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) setImageFromFile(file);
            }}
            onPointerCancel={finishDraft}
            onPointerDown={handlePointerDown}
            onPointerLeave={finishDraft}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDraft}
            ref={canvasRef}
            width={CANVAS_WIDTH}
          />

          <div className="canvas-foot">
            <span>⌘V / Ctrl+V</span>
            <span>Drag image</span>
            <span>Copy PNG</span>
          </div>
        </section>

        <aside className="inspector" aria-label="Canvas inspector">
          <section className="panel image-panel">
            <div className="panel-title">
              <span>이미지</span>
              <button
                className="mini-button"
                disabled={!baseImage}
                onClick={resetImageTransform}
                title="이미지 맞춤"
                type="button"
              >
                <RotateCcw size={15} />
              </button>
            </div>

            <label className="range-row zoom-row">
              <span>줌</span>
              <input
                disabled={!baseImage}
                max={240}
                min={45}
                onChange={(event) => updateImageScale(Number(event.target.value) / 100)}
                type="range"
                value={Math.round(imageScale * 100)}
              />
              <strong>{Math.round(imageScale * 100)}%</strong>
            </label>

            <div className="zoom-buttons">
              <button
                className="step-button"
                disabled={!baseImage}
                onClick={() => updateImageScale(imageScale - 0.1)}
                title="축소"
                type="button"
              >
                <Minus size={17} />
              </button>
              <button
                className="step-button move-button"
                disabled={!baseImage}
                onClick={() => {
                  setActiveTool("select");
                  setSelectedTextId(null);
                  setStatus("선택 도구로 이미지 이동");
                }}
                type="button"
              >
                <Move size={16} />
                <span>이동</span>
              </button>
              <button
                className="step-button"
                disabled={!baseImage}
                onClick={() => updateImageScale(imageScale + 0.1)}
                title="확대"
                type="button"
              >
                <Plus size={17} />
              </button>
            </div>

            <label className="range-row offset-row">
              <span>X</span>
              <input
                disabled={!baseImage}
                max={640}
                min={-640}
                onChange={(event) =>
                  setImageOffset((current) =>
                    clampImageOffset({ ...current, x: Number(event.target.value) }, baseImage, imageScale)
                  )
                }
                type="range"
                value={Math.round(imageOffset.x)}
              />
              <strong>{Math.round(imageOffset.x)}</strong>
            </label>

            <label className="range-row offset-row">
              <span>Y</span>
              <input
                disabled={!baseImage}
                max={390}
                min={-390}
                onChange={(event) =>
                  setImageOffset((current) =>
                    clampImageOffset({ ...current, y: Number(event.target.value) }, baseImage, imageScale)
                  )
                }
                type="range"
                value={Math.round(imageOffset.y)}
              />
              <strong>{Math.round(imageOffset.y)}</strong>
            </label>
          </section>

          <section className="panel">
            <div className="panel-title">
              <span>잉크</span>
              <button className="mini-button" onClick={() => setColor("#ff4d4d")} type="button">
                <RotateCcw size={15} />
              </button>
            </div>

            <div className="swatches">
              {swatches.map((swatch) => (
                <button
                  aria-label={`색상 ${swatch}`}
                  className={swatch === color ? "swatch active" : "swatch"}
                  key={swatch}
                  onClick={() => setColor(swatch)}
                  style={{ backgroundColor: swatch }}
                  type="button"
                />
              ))}
            </div>

            <label className="range-row">
              <span>{activeTool === "erase" ? "지우개" : "굵기"}</span>
              <input
                aria-label={activeTool === "erase" ? "지우개 크기" : "굵기"}
                max={activeTool === "erase" ? 72 : 18}
                min={activeTool === "erase" ? 8 : 2}
                onChange={(event) => updateActiveWidth(Number(event.currentTarget.value))}
                onInput={(event) => updateActiveWidth(Number(event.currentTarget.value))}
                type="range"
                value={activeTool === "erase" ? eraserWidth : strokeWidth}
              />
              <strong>{activeTool === "erase" ? eraserWidth : strokeWidth}</strong>
            </label>

            <label className={`label-field${selectedTextAction ? " is-editing" : ""}`}>
              <span>{selectedTextAction ? "선택 이름표" : "새 이름표"}</span>
              <input
                maxLength={24}
                onChange={(event) => updateLabelText(event.target.value)}
                value={labelText}
              />
            </label>
          </section>

          <section className="panel output-panel">
            <div className="panel-title">
              <span>출력</span>
              <div className="panel-actions">
                <button
                  className="mini-button"
                  disabled={snapshots.length === 0}
                  onClick={clearSnapshots}
                  type="button"
                  title="미리보기 모두 삭제"
                >
                  <Trash2 size={15} />
                </button>
                <button className="mini-button" onClick={downloadPng} type="button" title="PNG 저장">
                  <ArrowDownToLine size={15} />
                </button>
              </div>
            </div>

            <button className="copy-block" onClick={copyCanvas} type="button">
              {hasCopied ? <ClipboardCheck size={26} /> : <Clipboard size={26} />}
              <span>{hasCopied ? "복사 완료" : "클립보드로 복사"}</span>
            </button>

            <div className="snapshot-strip">
              {snapshots.length === 0 ? (
                <div className="empty-snapshot">Preview</div>
              ) : (
                snapshots.map((snapshot) => (
                  <div className="snapshot-item" key={snapshot}>
                    <img alt="Copied snapshot preview" src={snapshot} />
                    <button
                      aria-label="미리보기 삭제"
                      className="snapshot-delete"
                      onClick={() => removeSnapshot(snapshot)}
                      title="미리보기 삭제"
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
