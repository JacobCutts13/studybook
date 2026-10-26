"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// An open book drawn as points: two arched pages with a block of pages
// underneath, plus one page that keeps turning. Points scatter away from the
// cursor and spring back; dragging tilts and turns the book.

const PAGE_W = 2;
const PAGE_H = 2.7;
const POINTS_PER_PAGE = 5200;
const BLOCK_LAYERS = 5;
const TURN_SECONDS = 3.2;
const PAUSE_SECONDS = 1.6;
const PUSH_RADIUS = 0.55;
const CAMERA_Z = 10;

const arch = (u: number) => 0.22 * Math.sin((Math.PI * u) / PAGE_W);

// Rows of points read as lines of text; the rest are scattered.
function samplePage(count: number) {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const u = 0.04 + Math.random() * (PAGE_W - 0.14);
    let v = (Math.random() - 0.5) * (PAGE_H - 0.4);
    if (Math.random() < 0.72)
      v = Math.round(v / 0.11) * 0.11 + (Math.random() - 0.5) * 0.012;
    out[i * 2] = u;
    out[i * 2 + 1] = v;
  }
  return out;
}

export function ParticleBook() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dark = matchMedia("(prefers-color-scheme: dark)");

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      // No WebGL: the landing still has its title and buttons.
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, CAMERA_Z);
    const book = new THREE.Group();
    scene.add(book);
    // Sit above the title and buttons.
    book.position.y = 0.75;

    // Static pages: left and right, each with a block of pages beneath.
    const staticUv = samplePage(POINTS_PER_PAGE);
    const layers = 2 * (1 + BLOCK_LAYERS);
    const staticBase = new Float32Array(POINTS_PER_PAGE * layers * 3);
    const staticShade = new Float32Array(POINTS_PER_PAGE * layers);
    let n = 0;
    for (let side = -1; side <= 1; side += 2)
      for (let layer = 0; layer <= BLOCK_LAYERS; layer++)
        for (let i = 0; i < POINTS_PER_PAGE; i++) {
          // Lower layers only draw the outer edge, so they read as page edges.
          const u = staticUv[i * 2];
          if (
            layer > 0 &&
            u < PAGE_W - 0.25 &&
            Math.abs(staticUv[i * 2 + 1]) < PAGE_H / 2 - 0.35
          )
            continue;
          staticBase[n * 3] = side * (u + layer * 0.012);
          staticBase[n * 3 + 1] = staticUv[i * 2 + 1];
          staticBase[n * 3 + 2] = arch(u) - layer * 0.035;
          staticShade[n] = layer === 0 ? 1 : 0.55 - layer * 0.06;
          n++;
        }
    const staticCount = n;

    // The turning page.
    const turnUv = samplePage(POINTS_PER_PAGE);
    const total = staticCount + POINTS_PER_PAGE;
    const base = new Float32Array(total * 3);
    base.set(staticBase.subarray(0, staticCount * 3));
    const offset = new Float32Array(total * 3);
    const positions = new Float32Array(total * 3);
    const shade = new Float32Array(total);
    shade.set(staticShade.subarray(0, staticCount));
    shade.fill(0.85, staticCount);

    const geometry = new THREE.BufferGeometry();
    const positionAttr = new THREE.BufferAttribute(positions, 3);
    geometry.setAttribute("position", positionAttr);
    const colors = new Float32Array(total * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.022,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    book.add(new THREE.Points(geometry, material));

    function paintColors() {
      // White points on black, or black on white, following the system theme.
      const ink = dark.matches ? 1 : 0.07;
      const paper = dark.matches ? 0.07 : 1;
      for (let i = 0; i < total; i++) {
        const c = paper + (ink - paper) * shade[i];
        colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = c;
      }
      geometry.attributes.color.needsUpdate = true;
    }
    paintColors();
    dark.addEventListener("change", paintColors);

    function placeTurningPage(t: number) {
      const cycle = TURN_SECONDS + PAUSE_SECONDS;
      const p = Math.min(1, (t % cycle) / TURN_SECONDS);
      const eased = p * p * (3 - 2 * p);
      const angle = eased * Math.PI;
      // The free edge lags behind the spine, which makes the page curl.
      const curl = Math.sin(eased * Math.PI) * 0.55;
      for (let i = 0; i < POINTS_PER_PAGE; i++) {
        const u = turnUv[i * 2];
        const a = angle + curl * (u / PAGE_W) ** 1.5;
        const k = (staticCount + i) * 3;
        base[k] = Math.cos(a) * u;
        base[k + 1] = turnUv[i * 2 + 1];
        base[k + 2] = Math.sin(a) * u + arch(u) * Math.abs(Math.cos(a)) + 0.01;
      }
    }

    // Pointer: repel points near the cursor, drag to rotate.
    const pointer = new THREE.Vector2(9, 9);
    const ray = new THREE.Raycaster();
    // The pages arch upward, so meet the cursor at their average height.
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.14);
    const hit = new THREE.Vector3();
    const local = new THREE.Vector3(99, 99, 0);
    let hasHit = false;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let spinY = 0;
    let tiltX = 0;
    let velocity = 0;

    const toPointer = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
    };
    const onMove = (e: PointerEvent) => {
      toPointer(e);
      if (!dragging) return;
      velocity = THREE.MathUtils.clamp(
        (e.clientX - lastX) * 0.006,
        -0.08,
        0.08,
      );
      spinY += velocity;
      tiltX = THREE.MathUtils.clamp(
        tiltX + (e.clientY - lastY) * 0.004,
        -0.5,
        0.5,
      );
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onUp = () => {
      dragging = false;
    };
    const onLeave = () => pointer.set(9, 9);
    const canvas = renderer.domElement;
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Keep the whole book in view on narrow screens.
      camera.position.z = w / h < 1 ? CAMERA_Z / (w / h) ** 0.8 : CAMERA_Z;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    const clock = new THREE.Clock();
    let frame = 0;
    const tick = () => {
      const t = reduced ? 1.2 : clock.getElapsedTime();
      placeTurningPage(t);

      if (!dragging) {
        velocity *= 0.92;
        spinY += velocity;
        // Once the flick dies down, ease back to face the reader (the
        // nearest whole turn) with a gentle sway, and level the tilt.
        if (Math.abs(velocity) < 0.004) {
          const facing = Math.round(spinY / (2 * Math.PI)) * 2 * Math.PI;
          const sway = reduced ? 0 : Math.sin(t * 0.25) * 0.35;
          spinY += (facing + sway - spinY) * 0.03;
          tiltX += (0 - tiltX) * 0.03;
        }
      }
      book.rotation.set(-0.85 + tiltX, spinY, 0);
      book.updateMatrixWorld();

      ray.setFromCamera(pointer, camera);
      hasHit =
        ray.ray.intersectPlane(
          plane.clone().applyMatrix4(book.matrixWorld),
          hit,
        ) !== null;
      if (hasHit)
        local.copy(hit).applyMatrix4(book.matrixWorld.clone().invert());

      for (let i = 0; i < total; i++) {
        const k = i * 3;
        let tx = 0;
        let ty = 0;
        let tz = 0;
        if (hasHit) {
          const dx = base[k] - local.x;
          const dy = base[k + 1] - local.y;
          const d = Math.hypot(dx, dy);
          if (d < PUSH_RADIUS) {
            const f = (1 - d / PUSH_RADIUS) ** 2 * 0.45;
            tx = (dx / (d || 1)) * f;
            ty = (dy / (d || 1)) * f;
            tz = f * 0.9;
          }
        }
        offset[k] += (tx - offset[k]) * 0.12;
        offset[k + 1] += (ty - offset[k + 1]) * 0.12;
        offset[k + 2] += (tz - offset[k + 2]) * 0.12;
        positions[k] = base[k] + offset[k];
        positions[k + 1] = base[k + 1] + offset[k + 1];
        positions[k + 2] = base[k + 2] + offset[k + 2];
      }
      positionAttr.needsUpdate = true;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      dark.removeEventListener("change", paintColors);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return (
    <div
      ref={host}
      className="particle-book"
      role="img"
      aria-label="An open book drawn in points, turning its pages"
    />
  );
}
