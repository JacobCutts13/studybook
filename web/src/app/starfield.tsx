"use client";

import { useEffect, useRef } from "react";

// The space the library floats in: a sparse field of dots, in three depths
// that drift slowly and shift a little with the cursor. Behind every page
// except the reader, where nothing should sit behind the text.

const STARS_PER_PIXEL = 1 / 9000;
const DEPTHS = [0.3, 0.6, 1];
const PARALLAX_PX = 10;

export function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let stars: {
      x: number;
      y: number;
      depth: number;
      size: number;
      phase: number;
    }[] = [];
    let width = 0;
    let height = 0;
    const resize = () => {
      const ratio = Math.min(devicePixelRatio, 2);
      width = innerWidth;
      height = innerHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      stars = Array.from(
        { length: Math.round(width * height * STARS_PER_PIXEL) },
        () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          depth: DEPTHS[Math.floor(Math.random() * DEPTHS.length)],
          size: 0.6 + Math.random() * 0.9,
          phase: Math.random() * Math.PI * 2,
        }),
      );
    };
    const pointer = { x: 0, y: 0 };
    const eased = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX / width - 0.5;
      pointer.y = e.clientY / height - 0.5;
    };
    addEventListener("pointermove", onMove);

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 50) / 1000;
      last = now;
      eased.x += (pointer.x - eased.x) * 0.04;
      eased.y += (pointer.y - eased.y) * 0.04;
      context.clearRect(0, 0, width, height);
      context.fillStyle = getComputedStyle(canvas).color;
      for (const star of stars) {
        if (!reduced) {
          // Nearer stars drift faster, so the field has depth.
          star.x = (star.x + star.depth * 4 * dt + width) % width;
          star.y = (star.y - star.depth * 2 * dt + height) % height;
        }
        const twinkle = reduced
          ? 1
          : 0.75 + 0.25 * Math.sin(now / 1600 + star.phase);
        context.globalAlpha = (0.12 + star.depth * 0.33) * twinkle;
        context.fillRect(
          star.x - eased.x * PARALLAX_PX * star.depth,
          star.y - eased.y * PARALLAX_PX * star.depth,
          star.size,
          star.size,
        );
      }
      if (!reduced) frame = requestAnimationFrame(tick);
    };
    const onResize = () => {
      resize();
      // Still stars are drawn once per size.
      if (reduced) frame = requestAnimationFrame(tick);
    };
    resize();
    addEventListener("resize", onResize);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("resize", onResize);
      removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="starfield" />;
}
