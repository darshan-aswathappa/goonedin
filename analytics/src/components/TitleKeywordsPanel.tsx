"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { TOOLTIP_STYLE } from "@/lib/tokens";

interface Props {
  data: { word: string; count: number }[];
}

interface PlacedWord {
  word: string;
  count: number;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  width: number;
  height: number;
}

/** Map count percentile to CSS variable color values */
function getColor(pct: number): string {
  if (pct > 0.8) return "#cc33cc";   // var(--purple)
  if (pct > 0.6) return "#ff8c00";   // var(--teal)
  if (pct > 0.4) return "#00bfff";   // var(--blue)
  if (pct > 0.2) return "#aaaaaa";   // var(--text-dim)
  return "#555555";                    // var(--muted)
}

function layoutWords(
  words: { word: string; count: number }[],
  canvasW: number,
  canvasH: number
): PlacedWord[] {
  const max = words[0]?.count ?? 1;
  const min = words[words.length - 1]?.count ?? 1;
  const placed: PlacedWord[] = [];

  const offscreen = document.createElement("canvas");
  const ctx = offscreen.getContext("2d")!;

  for (const item of words) {
    const pct = max === min ? 1 : (item.count - min) / (max - min);
    const fontSize = Math.round(11 + pct * 22);
    const color = getColor(pct);

    ctx.font = `${pct > 0.6 ? 700 : 400} ${fontSize}px "JetBrains Mono", "Fira Code", monospace`;
    const metrics = ctx.measureText(item.word.toUpperCase());
    const w = metrics.width + 12;
    const h = fontSize + 8;

    const cx = canvasW / 2;
    const cy = canvasH / 2;
    let angle = 0;
    let radius = 0;
    let x = cx - w / 2;
    let y = cy - h / 2;
    let found = false;

    for (let step = 0; step < 800; step++) {
      x = cx + radius * Math.cos(angle) - w / 2;
      y = cy + radius * Math.sin(angle) - h / 2;

      if (x < 2 || y < 2 || x + w > canvasW - 2 || y + h > canvasH - 2) {
        angle += 0.3;
        radius += 0.4;
        continue;
      }

      let overlaps = false;
      for (const p of placed) {
        if (
          x < p.x + p.width + 4 &&
          x + w + 4 > p.x &&
          y < p.y + p.height + 2 &&
          y + h + 2 > p.y
        ) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        found = true;
        break;
      }

      angle += 0.3;
      radius += 0.4;
    }

    if (found) {
      placed.push({ word: item.word, count: item.count, x, y, fontSize, color, width: w, height: h });
    }
  }

  return placed;
}

export default function TitleKeywordsPanel({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [placed, setPlaced] = useState<PlacedWord[]>([]);
  const [hovered, setHovered] = useState<PlacedWord | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; origX: number; origY: number }>({
    dragging: false, startX: 0, startY: 0, origX: 0, origY: 0,
  });

  const top = data.slice(0, 25);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !top.length) return;

    const doLayout = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const result = layoutWords(top, w, h);
      setPlaced(result);
      setOffset({ x: 0, y: 0 });
      setZoom(1);
    };

    doLayout();

    const observer = new ResizeObserver(doLayout);
    observer.observe(container);
    return () => observer.disconnect();
  }, [data]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    for (const p of placed) {
      const isHovered = hovered === p;
      ctx.font = `${p.fontSize > 22 ? 700 : 400} ${p.fontSize}px "JetBrains Mono", "Fira Code", monospace`;
      ctx.textBaseline = "top";

      if (isHovered) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 1;
      } else {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.85;
      }

      ctx.fillText(p.word.toUpperCase(), p.x + 6, p.y + 4);

      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      const badgeText = String(p.count);
      const badgeFont = `600 ${Math.max(7, Math.round(p.fontSize * 0.38))}px "JetBrains Mono", monospace`;
      ctx.font = badgeFont;
      const badgeW = ctx.measureText(badgeText).width + 6;
      const badgeH = Math.max(10, Math.round(p.fontSize * 0.42));
      const bx = p.x + p.width - badgeW + 2;
      const by = p.y - badgeH / 2 + 1;

      ctx.fillStyle = p.color;
      ctx.globalAlpha = isHovered ? 0.9 : 0.25;
      ctx.beginPath();
      const r = badgeH / 2;
      ctx.moveTo(bx + r, by);
      ctx.lineTo(bx + badgeW - r, by);
      ctx.arc(bx + badgeW - r, by + r, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(bx + r, by + badgeH);
      ctx.arc(bx + r, by + r, r, Math.PI / 2, -Math.PI / 2);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.fillStyle = isHovered ? "#000000" : p.color;
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, bx + 3, by + badgeH / 2);
    }

    ctx.restore();
  }, [placed, hovered, offset, zoom]);

  useEffect(() => {
    draw();
  }, [draw]);

  const hitTest = useCallback(
    (clientX: number, clientY: number): PlacedWord | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const mx = (clientX - rect.left - offset.x) / zoom;
      const my = (clientY - rect.top - offset.y) / zoom;

      for (const p of placed) {
        if (mx >= p.x && mx <= p.x + p.width && my >= p.y && my <= p.y + p.height) {
          return p;
        }
      }
      return null;
    },
    [placed, offset, zoom]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const drag = dragRef.current;
      if (drag.dragging) {
        setOffset({
          x: drag.origX + (e.clientX - drag.startX),
          y: drag.origY + (e.clientY - drag.startY),
        });
        return;
      }

      const hit = hitTest(e.clientX, e.clientY);
      setHovered(hit);
      setMousePos({ x: e.clientX, y: e.clientY });
    },
    [hitTest]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragRef.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        origX: offset.x,
        origY: offset.y,
      };
    },
    [offset]
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    dragRef.current.dragging = false;
    setHovered(null);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const direction = e.deltaY < 0 ? 1 : -1;
      const factor = 1 + direction * 0.1;

      setZoom((prev) => {
        const next = Math.min(Math.max(prev * factor, 0.3), 5);
        setOffset((off) => ({
          x: mx - (mx - off.x) * (next / prev),
          y: my - (my - off.y) * (next / prev),
        }));
        return next;
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div className="panel chart-enter" style={{ height: "100%" }}>
      <div className="panel-header">Top Job Titles</div>
      <div
        ref={containerRef}
        data-testid="title-keywords-canvas-container"
        style={{
          height: "calc(100% - 37px)",
          position: "relative",
          cursor: dragRef.current.dragging ? "grabbing" : "grab",
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          style={{ display: "block", width: "100%", height: "100%" }}
        />

        {hovered && !dragRef.current.dragging && (
          <div
            style={{
              ...TOOLTIP_STYLE,
              position: "fixed",
              left: mousePos.x + 12,
              top: mousePos.y - 8,
              pointerEvents: "none",
              zIndex: 100,
            }}
          >
            <div style={{ color: hovered.color, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {hovered.word}
            </div>
            <div style={{ color: "var(--text)", marginTop: "2px", fontWeight: 700 }}>
              {hovered.count.toLocaleString()} postings
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
