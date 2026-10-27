"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { BookIcon, PlusIcon } from "./icons";

// An open book drawn as points: two arched pages with a block of pages
// underneath, plus one page that keeps turning. The pages are the way in:
// the left page (what's already written) opens the library, the right page
// (the next one) starts a new study guide. Their labels are real links
// that ride on the pages, so keyboard, screen readers and new-tab still work.

const PAGE_W = 2;
const PAGE_H = 2.7;
const POINTS_PER_PAGE = 5200;
const BLOCK_LAYERS = 5;
const TURN_SECONDS = 3.2;
const PAUSE_SECONDS = 1.6;
const PUSH_RADIUS = 0.55;
const CAMERA_Z = 10;
const LEAVE_MS = 650;
const CLICK_SLOP_PX = 5;

type Side = "left" | "right";

const arch = (u: number) => 0.22 * Math.sin((Math.PI * u) / PAGE_W);
const smooth = (p: number) => p * p * (3 - 2 * p);
const progress = (elapsed: number, duration: number) =>
  smooth(Math.min(1, Math.max(0, elapsed / duration)));
const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

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

export function ParticleBook({
  libraryCount,
}: {
  libraryCount: number | null;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);
  const leftLink = useRef<HTMLAnchorElement>(null);
  const rightLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = host.current;
    const links = { left: leftLink.current, right: rightLink.current };
    if (!el || !stage.current || !nav.current || !links.left || !links.right)
      return;
    const stageEl = stage.current;
    const navEl = nav.current;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dark = matchMedia("(prefers-color-scheme: dark)");

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      // No WebGL: the links stay as plain buttons.
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    navEl.classList.add("on-book");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    let cameraZ = CAMERA_Z;
    camera.position.set(0, 0, cameraZ);
    const book = new THREE.Group();
    scene.add(book);
    // Sit above the title.
    book.position.y = 0.75;

    // Static pages: left and right, each with a block of pages beneath.
    const staticUv = samplePage(POINTS_PER_PAGE);
    const layers = 2 * (1 + BLOCK_LAYERS);
    const max = POINTS_PER_PAGE * layers + POINTS_PER_PAGE;
    const base = new Float32Array(max * 3);
    const shade = new Float32Array(max);
    // -1 left page, 1 right page, 0 the turning page.
    const sideOf = new Int8Array(max);
    let n = 0;
    for (let side = -1; side <= 1; side += 2)
      for (let layer = 0; layer <= BLOCK_LAYERS; layer++)
        for (let i = 0; i < POINTS_PER_PAGE; i++) {
          // Lower layers only draw the outer edge, so they read as page edges.
          const u = staticUv[i * 2];
          if (
            layer > 0 &&
            u < PAGE_W - 0.18 &&
            Math.abs(staticUv[i * 2 + 1]) < (PAGE_H - 0.4) / 2 - 0.06
          )
            continue;
          base[n * 3] = side * (u + layer * 0.012);
          base[n * 3 + 1] = staticUv[i * 2 + 1];
          base[n * 3 + 2] = arch(u) - layer * 0.035;
          shade[n] = layer === 0 ? 1 : 0.55 - layer * 0.06;
          sideOf[n] = side;
          n++;
        }
    const staticCount = n;
    const turnUv = samplePage(POINTS_PER_PAGE);
    const total = staticCount + POINTS_PER_PAGE;
    shade.fill(0.85, staticCount, total);

    const offset = new Float32Array(total * 3);
    const positions = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    const geometry = new THREE.BufferGeometry();
    const positionAttr = new THREE.BufferAttribute(positions, 3);
    const colorAttr = new THREE.BufferAttribute(colors, 3);
    geometry.setAttribute("position", positionAttr);
    geometry.setAttribute("color", colorAttr);
    const material = new THREE.PointsMaterial({
      size: 0.022,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    book.add(new THREE.Points(geometry, material));

    // Hover emphasis, eased each frame: the other page dims.
    const weight = { left: 1, right: 1 };
    let turnOnRight = true;
    let colorsDirty = true;
    function paintColors() {
      // Paper matches the page background exactly (#121113 / #faf9fb).
      const ink = dark.matches ? 1 : 0.07;
      const paper = dark.matches ? 0.071 : 0.98;
      for (let i = 0; i < total; i++) {
        const s = sideOf[i] || (turnOnRight ? 1 : -1);
        const w = s < 0 ? weight.left : weight.right;
        // Three.js expects linear colours, so convert from sRGB, or "paper"
        // would show as visible grey.
        const c = toLinear(paper + (ink - paper) * shade[i] * w);
        colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = c;
      }
      colorAttr.needsUpdate = true;
    }
    const onTheme = () => {
      colorsDirty = true;
    };
    dark.addEventListener("change", onTheme);

    function placeTurningPage(angle: number, curl: number) {
      turnOnRight = angle < Math.PI / 2;
      for (let i = 0; i < POINTS_PER_PAGE; i++) {
        const u = turnUv[i * 2];
        // The free edge lags behind the spine, which makes the page curl.
        const a = angle + curl * (u / PAGE_W) ** 1.5;
        const k = (staticCount + i) * 3;
        base[k] = Math.cos(a) * u;
        base[k + 1] = turnUv[i * 2 + 1];
        base[k + 2] = Math.sin(a) * u + arch(u) * Math.abs(Math.cos(a)) + 0.01;
      }
    }

    // Pointer state.
    const pointer = new THREE.Vector2(9, 9);
    const ray = new THREE.Raycaster();
    // The pages arch upward, so meet the cursor at their average height.
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.14);
    const worldPlane = new THREE.Plane();
    const inverse = new THREE.Matrix4();
    const hit = new THREE.Vector3();
    const local = new THREE.Vector3(99, 99, 0);
    let hasHit = false;
    let pointerSide: Side | null = null;
    let focusSide: Side | null = null;
    let dragging = false;
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;
    let spinY = 0;
    let tiltX = 0;
    let velocity = 0;
    let leaving: {
      side: Side;
      href: string;
      start: number;
      navigated: boolean;
    } | null = null;

    const hovered = (): Side | null =>
      leaving?.side ?? focusSide ?? pointerSide;

    // Opening a page: turn it, push the camera in, then navigate. The
    // destination page fades in as it arrives.
    function open(side: Side) {
      const href = links[side]?.getAttribute("href");
      if (!href || leaving) return;
      if (reduced) {
        location.href = href;
        return;
      }
      leaving = { side, href, start: performance.now(), navigated: false };
      stageEl.classList.add("leaving");
    }

    // Link listeners go when the effect cleans up (React mounts twice in dev).
    const listeners = new AbortController();
    const { signal } = listeners;
    for (const side of ["left", "right"] as const) {
      const link = links[side];
      if (!link) continue;
      link.addEventListener(
        "mouseenter",
        () => {
          focusSide = side;
        },
        { signal },
      );
      link.addEventListener(
        "mouseleave",
        () => {
          focusSide = null;
        },
        { signal },
      );
      link.addEventListener(
        "focus",
        () => {
          focusSide = side;
        },
        { signal },
      );
      link.addEventListener(
        "blur",
        () => {
          focusSide = null;
        },
        { signal },
      );
      link.addEventListener(
        "click",
        (e) => {
          // Let modified clicks open a new tab as usual.
          if (
            e.button !== 0 ||
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey
          )
            return;
          e.preventDefault();
          open(side);
        },
        { signal },
      );
    }

    const toPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
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
      toPointer(e);
      dragging = true;
      downX = lastX = e.clientX;
      downY = lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      // A press that barely moved is a click on whichever page is under it.
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (e.type === "pointerup" && moved < CLICK_SLOP_PX && pointerSide)
        open(pointerSide);
    };
    const onLeave = () => {
      pointer.set(9, 9);
      pointerSide = null;
    };
    // Coming back to this page with the back button restores it from cache.
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      leaving = null;
      stageEl.classList.remove("leaving");
      camera.position.z = cameraZ;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const canvas = renderer.domElement;
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    window.addEventListener("pageshow", onPageShow);

    let width = 1;
    let height = 1;
    const resize = () => {
      width = el.clientWidth;
      height = el.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Keep the whole book in view on narrow screens.
      cameraZ =
        width / height < 1 ? CAMERA_Z / (width / height) ** 0.8 : CAMERA_Z;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    // Each label sits on its page, and fades when the book turns away.
    const anchor = new THREE.Vector3();
    function placeLabels(facing: number) {
      for (const side of ["left", "right"] as const) {
        const link = links[side];
        if (!link) continue;
        anchor.set(side === "left" ? -1 : 1, -0.25, arch(1) + 0.08);
        book.localToWorld(anchor).project(camera);
        const x = ((anchor.x + 1) / 2) * width;
        const y = ((1 - anchor.y) / 2) * height;
        link.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        link.style.opacity = String(facing);
        link.style.visibility = facing < 0.05 ? "hidden" : "visible";
        link.dataset.active = String(hovered() === side);
      }
    }

    const clock = new THREE.Clock();
    let turnTime = 0;
    let frame = 0;
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const now = performance.now();
      const side = hovered();

      // The page turn: the slow loop pauses while a page is hovered; opening
      // a page plays one quick turn towards it.
      let angle: number;
      let curl: number;
      if (leaving) {
        const p = progress(now - leaving.start, LEAVE_MS * 0.85);
        angle = leaving.side === "right" ? p * Math.PI : (1 - p) * Math.PI;
        curl = Math.sin(p * Math.PI) * 0.6;
        if (!leaving.navigated && now - leaving.start > LEAVE_MS) {
          leaving.navigated = true;
          location.href = leaving.href;
        }
      } else {
        if (!side && !reduced) turnTime += dt;
        const cycle = TURN_SECONDS + PAUSE_SECONDS;
        const p = smooth(Math.min(1, (turnTime % cycle) / TURN_SECONDS));
        angle = reduced ? 0 : p * Math.PI;
        curl = Math.sin(p * Math.PI) * 0.55;
      }
      const wasOnRight = turnOnRight;
      placeTurningPage(angle, curl);
      if (wasOnRight !== turnOnRight) colorsDirty = true;

      // Ease the hover emphasis.
      const target = {
        left: side === "right" ? 0.35 : 1,
        right: side === "left" ? 0.35 : 1,
      };
      for (const key of ["left", "right"] as const) {
        const d = target[key] - weight[key];
        if (Math.abs(d) > 0.002) {
          weight[key] += d * 0.12;
          colorsDirty = true;
        }
      }
      if (colorsDirty) {
        paintColors();
        colorsDirty = false;
      }

      if (!dragging) {
        velocity *= 0.92;
        spinY += velocity;
        // Once the flick dies down, ease back to face the reader (the
        // nearest whole turn) with a gentle sway, and level the tilt.
        if (Math.abs(velocity) < 0.004) {
          const facing = Math.round(spinY / (2 * Math.PI)) * 2 * Math.PI;
          const sway =
            reduced || side ? 0 : Math.sin(clock.elapsedTime * 0.25) * 0.35;
          spinY += (facing + sway - spinY) * 0.03;
          tiltX += (0 - tiltX) * 0.03;
        }
      }
      book.rotation.set(-0.85 + tiltX, spinY, 0);
      book.updateMatrixWorld();

      // Push the camera in while leaving.
      const push = leaving ? progress(now - leaving.start, LEAVE_MS) : 0;
      camera.position.z +=
        (cameraZ * (1 - 0.3 * push) - camera.position.z) * 0.25;

      ray.setFromCamera(pointer, camera);
      worldPlane.copy(plane).applyMatrix4(book.matrixWorld);
      hasHit = ray.ray.intersectPlane(worldPlane, hit) !== null;
      if (hasHit)
        local.copy(hit).applyMatrix4(inverse.copy(book.matrixWorld).invert());
      const onPage =
        hasHit &&
        Math.abs(local.x) <= PAGE_W + 0.05 &&
        Math.abs(local.y) <= PAGE_H / 2;
      pointerSide = onPage ? (local.x < 0 ? "left" : "right") : null;
      if (!dragging) canvas.style.cursor = pointerSide ? "pointer" : "grab";

      for (let i = 0; i < total; i++) {
        const k = i * 3;
        let tx = 0;
        let ty = 0;
        let tz = 0;
        if (hasHit && !leaving) {
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

      const facing = THREE.MathUtils.clamp(
        (Math.cos(spinY) - 0.55) / 0.35,
        0,
        1,
      );
      placeLabels(leaving ? 0 : facing);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      dark.removeEventListener("change", onTheme);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pageshow", onPageShow);
      listeners.abort();
      navEl.classList.remove("on-book");
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return (
    <div ref={stage} className="book-stage">
      <div ref={host} className="particle-book" aria-hidden="true" />
      <nav ref={nav} className="book-links" aria-label="Get started">
        <a ref={leftLink} href="/library" className="page-link">
          <BookIcon />
          Library
          {libraryCount ? <span className="count">{libraryCount}</span> : null}
        </a>
        <a ref={rightLink} href="/create" className="page-link">
          <PlusIcon />
          New study guide
        </a>
      </nav>
    </div>
  );
}
