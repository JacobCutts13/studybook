"use client";

import { useEffect, useRef } from "react";

// The drop target is a blank page drawn in dots, like the landing book.
// Empty, the dots trace its edge and drift faintly inside; dragging a file
// over draws them towards the cursor; a chosen book fills the page with
// lines of text, top to bottom; making the guide binds the page into a
// spine, the shape it takes on the library shelf.

export type PageState = "blank" | "over" | "filled" | "binding";

const DOTS = 1100;
const EDGE_SHARE = 0.45;
const PUSH_RADIUS = 36;

export function PageDrop({ state }: { state: PageState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Positions are 0..1 across the page, so resizing needs no re-layout.
    const x = new Float32Array(DOTS);
    const y = new Float32Array(DOTS);
    const blank = new Float32Array(DOTS * 2);
    const text = new Float32Array(DOTS * 2);
    const spine = new Float32Array(DOTS * 2);
    const ease = new Float32Array(DOTS);
    const edge = new Uint8Array(DOTS);
    for (let i = 0; i < DOTS; i++) {
      // Blank: the page's edge, or a faint dot loose inside it.
      edge[i] = i < DOTS * EDGE_SHARE ? 1 : 0;
      if (edge[i]) {
        const side = Math.floor(Math.random() * 4);
        const along = Math.random();
        blank[i * 2] =
          side === 0 ? along : side === 1 ? 1 : side === 2 ? along : 0;
        blank[i * 2 + 1] =
          side === 0 ? 0 : side === 1 ? along : side === 2 ? 1 : along;
      } else {
        blank[i * 2] = 0.08 + Math.random() * 0.84;
        blank[i * 2 + 1] = 0.06 + Math.random() * 0.88;
      }
      // Filled: rows of dots read as lines of text, with a ragged right edge.
      const row = Math.floor(Math.random() * 24);
      const lineEnd = row % 6 === 5 ? 0.55 : 0.9 - ((row * 7) % 5) * 0.03;
      text[i * 2] = 0.1 + Math.random() * (lineEnd - 0.1);
      text[i * 2 + 1] = 0.1 + row * 0.034 + (Math.random() - 0.5) * 0.006;
      // Binding: a narrow upright spine in the middle.
      spine[i * 2] = 0.46 + Math.random() * 0.08;
      spine[i * 2 + 1] = 0.08 + Math.random() * 0.84;
      x[i] = blank[i * 2];
      y[i] = blank[i * 2 + 1];
      ease[i] = 0.05 + Math.random() * 0.09;
    }

    const pointer = { x: -1, y: -1 };
    const onMove = (e: PointerEvent | DragEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = (e.clientX - r.left) / r.width;
      pointer.y = (e.clientY - r.top) / r.height;
    };
    const onLeave = () => {
      pointer.x = pointer.y = -1;
    };
    // Listen on the page itself, which sits above the canvas.
    const page = canvas.parentElement;
    page?.addEventListener("pointermove", onMove);
    page?.addEventListener("dragover", onMove);
    page?.addEventListener("pointerleave", onLeave);
    page?.addEventListener("dragleave", onLeave);

    let width = 0;
    let height = 0;
    const resize = () => {
      const ratio = Math.min(devicePixelRatio, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let last = stateRef.current;
    let changedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const current = stateRef.current;
      if (current !== last) {
        last = current;
        changedAt = now;
      }
      const since = (now - changedAt) / 1000;
      const ink = getComputedStyle(canvas).color;
      context.clearRect(0, 0, width, height);
      context.fillStyle = ink;

      for (let i = 0; i < DOTS; i++) {
        let tx: number;
        let ty: number;
        let alpha: number;
        let k = ease[i];
        if (current === "filled") {
          tx = text[i * 2];
          ty = text[i * 2 + 1];
          alpha = 0.75;
          // Lines fill from the top, like writing.
          if (!reduced && since < ty * 0.9) {
            tx = blank[i * 2];
            ty = blank[i * 2 + 1];
            alpha = edge[i] ? 0.5 : 0.12;
          }
        } else if (current === "binding") {
          tx = spine[i * 2];
          ty = spine[i * 2 + 1];
          alpha = 0.95;
          k *= 1.6;
        } else {
          tx = blank[i * 2];
          ty = blank[i * 2 + 1];
          alpha = edge[i] ? 0.5 : 0.12;
          if (current === "over" && pointer.x >= 0) {
            // A file over the page pulls the dots in to meet it.
            tx += (pointer.x - tx) * 0.35;
            ty += (pointer.y - ty) * 0.35;
            alpha = edge[i] ? 0.75 : 0.35;
          } else if (!reduced && !edge[i]) {
            tx += Math.sin(now / 1400 + i) * 0.006;
            ty += Math.cos(now / 1700 + i * 1.3) * 0.006;
          }
        }
        // The cursor pushes dots aside, as on the landing book.
        if (current !== "binding" && current !== "over" && pointer.x >= 0) {
          const dx = (tx - pointer.x) * width;
          const dy = (ty - pointer.y) * height;
          const d = Math.hypot(dx, dy);
          if (d < PUSH_RADIUS) {
            const f = (1 - d / PUSH_RADIUS) ** 2 * 14;
            tx += (dx / (d || 1)) * (f / width);
            ty += (dy / (d || 1)) * (f / height);
          }
        }
        if (reduced) k = 1;
        x[i] += (tx - x[i]) * k;
        y[i] += (ty - y[i]) * k;
        context.globalAlpha = alpha;
        context.fillRect(
          x[i] * (width - 2) + 0.5,
          y[i] * (height - 2) + 0.5,
          1.4,
          1.4,
        );
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      page?.removeEventListener("pointermove", onMove);
      page?.removeEventListener("dragover", onMove);
      page?.removeEventListener("pointerleave", onLeave);
      page?.removeEventListener("dragleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="page-dots" />;
}
