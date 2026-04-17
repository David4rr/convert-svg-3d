"use client";

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import Image from "next/image";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Environment, Float } from "@react-three/drei";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

type Theme = "light" | "dark";
type TraceQuality = "fast" | "high";

type Params = {
  depth: number;
  steps: number;
  curveSegments: number;
  bevelEnabled: boolean;
  bevelThickness: number;
  bevelSize: number;
  bevelSegments: number;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  edgeOpacity: number;
  edgeThreshold: number;
  showEdges: boolean;
  wireframe: boolean;
  color: string;
  useSvgColor: boolean;
};

type MeshBundle = {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  edges: THREE.LineSegments[];
};

const FIT = 3.5;
const EMPTY = "Waiting for SVG upload or image conversion...";
const TRACE_PRESETS = {
  fast: {
    ltres: 1,
    qtres: 1,
    pathomit: 8,
    rightangleenhance: true,
    layering: 0,
    colorsampling: 2,
    numberofcolors: 12,
    mincolorratio: 0,
    colorquantcycles: 2,
    roundcoords: 1,
    linefilter: true,
    scale: 1,
    strokewidth: 1,
    viewbox: true,
    desc: false,
  },
  high: {
    ltres: 0.25,
    qtres: 0.25,
    pathomit: 1,
    rightangleenhance: true,
    layering: 0,
    colorsampling: 2,
    numberofcolors: 24,
    mincolorratio: 0,
    colorquantcycles: 5,
    roundcoords: 2,
    linefilter: false,
    scale: 1,
    strokewidth: 1,
    viewbox: true,
    desc: false,
  },
} as const;

type TraceOptions = (typeof TRACE_PRESETS)["fast"];

const DEFAULT_TRACE_OPTIONS: TraceOptions = {
  ltres: 0.1,
  qtres: 0.1,
  pathomit: 0,
  rightangleenhance: true,
  layering: 0,
  colorsampling: 2,
  numberofcolors: 32,
  mincolorratio: 0,
  colorquantcycles: 6,
  roundcoords: 2,
  linefilter: false,
  scale: 1,
  strokewidth: 1,
  viewbox: true,
  desc: false,
} as const;

const dispose = (b: MeshBundle | null) => {
  if (!b) return;
  b.geometries.forEach((g) => g.dispose());
  b.materials.forEach((m) => m.dispose());
  b.edges.forEach((e) => {
    e.geometry.dispose();
    (e.material as THREE.Material).dispose();
  });
  b.group.clear();
};

function buildMesh(svgText: string, p: Params): MeshBundle {
  const data = new SVGLoader().parse(svgText);
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const edges: THREE.LineSegments[] = [];

  const parseOpacity = (value: unknown, fallback = 1) => {
    if (typeof value !== "string" && typeof value !== "number") return fallback;
    const n = Number.parseFloat(String(value));
    return Number.isFinite(n) ? n : fallback;
  };

  const isPathVisible = (path: { userData?: { style?: Record<string, unknown> } }) => {
    const style = path.userData?.style ?? {};
    const opacity = parseOpacity(style.opacity, 1);
    const fillOpacity = parseOpacity(style.fillOpacity, 1);
    const strokeOpacity = parseOpacity(style.strokeOpacity, 1);
    const fill = String(style.fill ?? "").toLowerCase();
    const stroke = String(style.stroke ?? "").toLowerCase();

    const hasVisibleFill = fill !== "none" && fill !== "transparent" && fillOpacity * opacity > 0.01;
    const hasVisibleStroke = stroke !== "none" && stroke !== "transparent" && strokeOpacity * opacity > 0.01;
    return hasVisibleFill || hasVisibleStroke;
  };

  const bounds = new THREE.Box2(
    new THREE.Vector2(Infinity, Infinity),
    new THREE.Vector2(-Infinity, -Infinity)
  );

  data.paths.forEach((path) => {
    if (!isPathVisible(path)) return;
    SVGLoader.createShapes(path).forEach((s) => {
      s.extractPoints(8).shape.forEach((v) => {
        bounds.expandByPoint(new THREE.Vector2(v.x, v.y));
      });
    });
  });

  const size = bounds.getSize(new THREE.Vector2());
  const maxXY = Math.max(size.x, size.y, 1);
  const fitScale = FIT / maxXY;
  const worldDepth = (p.depth / 10) / fitScale;

  data.paths.forEach((path) => {
    if (!isPathVisible(path)) return;

    const style = path.userData?.style ?? {};
    const opacity = parseOpacity(style.opacity, 1);
    const fillOpacity = parseOpacity(style.fillOpacity, 1);
    const strokeOpacity = parseOpacity(style.strokeOpacity, 1);

    let fill = path.userData?.style?.fill;
    if (!fill || fill === "none" || fill === "transparent") {
      const stroke = path.userData?.style?.stroke;
      fill =
        stroke &&
        stroke !== "none" &&
        stroke !== "transparent" &&
        strokeOpacity * opacity > 0.01
          ? stroke
          : "#f1f5f9";
    } else if (fillOpacity * opacity <= 0.01) {
      const stroke = path.userData?.style?.stroke;
      fill =
        stroke &&
        stroke !== "none" &&
        stroke !== "transparent" &&
        strokeOpacity * opacity > 0.01
          ? stroke
          : "#f1f5f9";
    }

    SVGLoader.createShapes(path).forEach((shape) => {
      const g = new THREE.ExtrudeGeometry(shape, {
        depth: worldDepth,
        steps: p.steps,
        curveSegments: p.curveSegments,
        bevelEnabled: p.bevelEnabled,
        bevelThickness: (p.bevelThickness / 40) / fitScale,
        bevelSize: (p.bevelSize / 40) / fitScale,
        bevelSegments: p.bevelSegments,
      });

      g.computeVertexNormals();

      const m = new THREE.MeshPhysicalMaterial({
        color: p.useSvgColor ? new THREE.Color(fill) : new THREE.Color(p.color),
        metalness: p.metalness,
        roughness: p.roughness,
        clearcoat: p.clearcoat,
        clearcoatRoughness: p.clearcoatRoughness,
        wireframe: p.wireframe,
      });

      const mesh = new THREE.Mesh(g, m);

      if (p.showEdges) {
        const e = new THREE.LineSegments(
          new THREE.EdgesGeometry(g, p.edgeThreshold),
          new THREE.LineBasicMaterial({
            color: "#0f172a",
            transparent: true,
            opacity: p.edgeOpacity,
          })
        );
        mesh.add(e);
        edges.push(e);
      }

      group.add(mesh);
      geometries.push(g);
      materials.push(m);
    });
  });

  const box = new THREE.Box3().setFromObject(group);
  if (!box.isEmpty()) {
    const c = new THREE.Vector3();
    box.getCenter(c);
    group.position.sub(c);
    group.scale.set(fitScale, -fitScale, fitScale);
  }

  return { group, geometries, materials, edges };
}

function Scene({ group, theme }: { group: THREE.Group | null; theme: Theme }) {
  const cloned = useMemo(() => {
    if (!group) return null;
    const g = group.clone(true);
    const box = new THREE.Box3().setFromObject(g);
    const center = new THREE.Vector3();
    box.getCenter(center);

    g.position.x -= center.x;
    g.position.z -= center.z;
    g.position.y -= box.min.y;
    g.position.y += -1.5; 
    
    return g;
  }, [group]);

  return (
    <>
      <ambientLight intensity={theme === "light" ? 0.7 : 0.4} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />
      <directionalLight 
        position={[5, 5, 5]} 
        intensity={theme === "light" ? 1.5 : 1} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
      />
      
      {cloned && (
        <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
          <primitive object={cloned} />
        </Float>
      )}

      <ContactShadows
        position={[0, -1.5, 0]}
        opacity={theme === "light" ? 0.4 : 0.6}
        scale={10}
        blur={2.5}
        far={4}
      />
      
      <Environment preset="city" />

      <gridHelper
        args={[20, 40, theme === "light" ? "#e2e8f0" : "#1e293b", theme === "light" ? "#f1f5f9" : "#0f172a"]}
        position={[0, -1.51, 0]}
      />
      
      <OrbitControls 
        enableDamping 
        dampingFactor={0.08} 
        minDistance={2} 
        maxDistance={15} 
        makeDefault 
        target={[0, -0.5, 0]}
      />
    </>
  );
}

const readAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("File read failed."));
    reader.readAsText(file);
  });

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("File read failed."));
    reader.readAsDataURL(file);
  });

type ImageTracerApi = {
  imageToSVG: (
    src: string,
    callback: (svg: string) => void,
    options: TraceOptions
  ) => void;
};

const traceRasterToSvg = (dataUrl: string, tracer: ImageTracerApi, options: TraceOptions) =>
  new Promise<string>((resolve, reject) => {
    tracer.imageToSVG(
      dataUrl,
      (svg) => {
        if (!svg) {
          reject(new Error("Trace returned empty SVG."));
          return;
        }
        resolve(svg);
      },
      options
    );
  });

const loadImageElement = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image."));
    img.src = src;
  });

const colorDistance = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) =>
  Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);

const edgeAverageColor = (pixels: Uint8ClampedArray, w: number, h: number) => {
  let r = 0;
  let g = 0;
  let b = 0;
  let c = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 120));

  for (let x = 0; x < w; x += step) {
    const top = (x * 4);
    const bottom = ((h - 1) * w + x) * 4;
    if (pixels[top + 3] > 0) {
      r += pixels[top]; g += pixels[top + 1]; b += pixels[top + 2]; c += 1;
    }
    if (pixels[bottom + 3] > 0) {
      r += pixels[bottom]; g += pixels[bottom + 1]; b += pixels[bottom + 2]; c += 1;
    }
  }

  for (let y = 0; y < h; y += step) {
    const left = (y * w) * 4;
    const right = (y * w + (w - 1)) * 4;
    if (pixels[left + 3] > 0) {
      r += pixels[left]; g += pixels[left + 1]; b += pixels[left + 2]; c += 1;
    }
    if (pixels[right + 3] > 0) {
      r += pixels[right]; g += pixels[right + 1]; b += pixels[right + 2]; c += 1;
    }
  }

  if (c === 0) return { r: 255, g: 255, b: 255 };
  return { r: r / c, g: g / c, b: b / c };
};

const floodClearEdgeBackground = (
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  bg: { r: number; g: number; b: number },
  tolerance: number
) => {
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const maybePush = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    const p = idx * 4;
    if (pixels[p + 3] === 0) {
      visited[idx] = 1;
      return;
    }
    const d = colorDistance(pixels[p], pixels[p + 1], pixels[p + 2], bg.r, bg.g, bg.b);
    if (d > tolerance) return;
    visited[idx] = 1;
    queue[tail++] = idx;
  };

  for (let x = 0; x < w; x++) {
    maybePush(x, 0);
    maybePush(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    maybePush(0, y);
    maybePush(w - 1, y);
  }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % w;
    const y = Math.floor(idx / w);
    const p = idx * 4;
    pixels[p + 3] = 0;

    maybePush(x + 1, y);
    maybePush(x - 1, y);
    maybePush(x, y + 1);
    maybePush(x, y - 1);
  }
};

const preprocessRasterForTrace = async (
  file: File,
  removeBg: boolean,
  maxDimension: number
) => {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImageElement(dataUrl);

  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas context unavailable.");

  ctx.drawImage(img, 0, 0, w, h);

  if (removeBg) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const px = imageData.data;
    const bg = edgeAverageColor(px, w, h);
    const threshold = 65;
    floodClearEdgeBackground(px, w, h, bg, threshold);

    ctx.putImageData(imageData, 0, 0);
  }

  return canvas.toDataURL("image/png");
};

const parseColorToRgb = (value: string | null) => {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (!v || v === "none" || v === "transparent") return null;

  if (v.startsWith("#")) {
    const hex = v.slice(1);
    if (hex.length === 3) {
      const r = Number.parseInt(hex[0] + hex[0], 16);
      const g = Number.parseInt(hex[1] + hex[1], 16);
      const b = Number.parseInt(hex[2] + hex[2], 16);
      return Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) ? null : { r, g, b };
    }
    if (hex.length >= 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      return Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) ? null : { r, g, b };
    }
    return null;
  }

  const rgbMatch = v.match(/^rgba?\(([^)]+)\)$/);
  if (rgbMatch) {
    const nums = rgbMatch[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (nums.length < 3 || nums.slice(0, 3).some((n) => Number.isNaN(n))) return null;
    return {
      r: Math.max(0, Math.min(255, nums[0])),
      g: Math.max(0, Math.min(255, nums[1])),
      b: Math.max(0, Math.min(255, nums[2])),
    };
  }

  return null;
};

const readStyleProp = (el: Element, prop: string) => {
  const style = el.getAttribute("style");
  if (!style) return null;
  const pattern = new RegExp(`${prop}\\s*:\\s*([^;]+)`, "i");
  const match = style.match(pattern);
  return match?.[1]?.trim() ?? null;
};

const getSvgProp = (el: Element, name: string, fallback = "") =>
  el.getAttribute(name) ?? readStyleProp(el, name) ?? fallback;

const getNumericSvgProp = (el: Element, name: string, fallback = 0) => {
  const value = getSvgProp(el, name, String(fallback));
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const approxPathBounds = (d: string) => {
  const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map((n) => Number.parseFloat(n)) ?? [];
  if (nums.length < 2) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
};

const getElementBounds = (el: Element) => {
  const tag = el.tagName.toLowerCase();

  if (tag === "rect") {
    const x = getNumericSvgProp(el, "x", 0);
    const y = getNumericSvgProp(el, "y", 0);
    const w = getNumericSvgProp(el, "width", 0);
    const h = getNumericSvgProp(el, "height", 0);
    return { minX: x, minY: y, maxX: x + w, maxY: y + h };
  }

  if (tag === "circle") {
    const cx = getNumericSvgProp(el, "cx", 0);
    const cy = getNumericSvgProp(el, "cy", 0);
    const r = getNumericSvgProp(el, "r", 0);
    return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
  }

  if (tag === "ellipse") {
    const cx = getNumericSvgProp(el, "cx", 0);
    const cy = getNumericSvgProp(el, "cy", 0);
    const rx = getNumericSvgProp(el, "rx", 0);
    const ry = getNumericSvgProp(el, "ry", 0);
    return { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry };
  }

  if (tag === "path") {
    const d = el.getAttribute("d") ?? "";
    return approxPathBounds(d);
  }

  if (tag === "polygon" || tag === "polyline") {
    const points = el.getAttribute("points") ?? "";
    return approxPathBounds(points);
  }

  return null;
};

const measureSvgBounds = (svgRoot: Element, selector: string) => {
  if (typeof document === "undefined") return [] as Array<{ minX: number; minY: number; maxX: number; maxY: number }>;

  const holder = document.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-10000px";
  holder.style.top = "-10000px";
  holder.style.width = "0";
  holder.style.height = "0";
  holder.style.opacity = "0";
  holder.style.pointerEvents = "none";

  const clone = svgRoot.cloneNode(true) as Element;
  holder.appendChild(clone);
  document.body.appendChild(holder);

  try {
    const measured = Array.from(clone.querySelectorAll(selector));
    return measured.map((el) => {
      try {
        const g = (el as unknown as SVGGraphicsElement).getBBox?.();
        if (!g) return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        return {
          minX: g.x,
          minY: g.y,
          maxX: g.x + g.width,
          maxY: g.y + g.height,
        };
      } catch {
        return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      }
    });
  } finally {
    holder.remove();
  }
};

const isDarkFill = (fill: string | null) => {
  const rgb = parseColorToRgb(fill);
  if (!rgb) return false;
  const luma = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  return luma <= 48;
};

const sameColor = (a: string | null, b: string | null) => {
  const ca = parseColorToRgb(a);
  const cb = parseColorToRgb(b);
  if (!ca || !cb) return false;
  return (
    Math.abs(ca.r - cb.r) <= 2 &&
    Math.abs(ca.g - cb.g) <= 2 &&
    Math.abs(ca.b - cb.b) <= 2
  );
};

const stripBackgroundRect = (svg: string, aggressive = false) => {
  if (typeof window === "undefined") return svg;
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  const viewBox = root.getAttribute("viewBox")?.trim().split(/\s+/).map(Number);
  if (!viewBox || viewBox.length !== 4 || viewBox.some((n) => Number.isNaN(n))) return svg;

  const [vx, vy, vw, vh] = viewBox;
  const maxX = vx + vw;
  const maxY = vy + vh;
  const candidateSelector = "path,polygon,polyline,rect,circle,ellipse";
  const measuredBounds = measureSvgBounds(root, candidateSelector);
  const rects = Array.from(root.querySelectorAll("rect"));
  rects.forEach((rect) => {
    const x = Number(rect.getAttribute("x") ?? 0);
    const y = Number(rect.getAttribute("y") ?? 0);
    const rw = Number(rect.getAttribute("width") ?? 0);
    const rh = Number(rect.getAttribute("height") ?? 0);
    const fill = getSvgProp(rect, "fill");
    const stroke = getSvgProp(rect, "stroke", "none");
    const hasMeaningfulStroke = !!(
      stroke &&
      stroke !== "none" &&
      stroke !== "transparent" &&
      !sameColor(stroke, fill)
    );
    const coversAll =
      Math.abs(x - vx) <= 1 &&
      Math.abs(y - vy) <= 1 &&
      rw >= vw * 0.98 &&
      rh >= vh * 0.98;
    if (!hasMeaningfulStroke && coversAll) rect.remove();
  });

  const candidates = Array.from(root.querySelectorAll(candidateSelector));
  const evaluated = candidates.map((el, idx) => {
    const fill = getSvgProp(el, "fill");
    const stroke = getSvgProp(el, "stroke", "none");
    const opacity = getNumericSvgProp(el, "fill-opacity", 1) * getNumericSvgProp(el, "opacity", 1);
    const fallbackBounds = getElementBounds(el);
    const measured = measuredBounds[idx];
    const bounds =
      measured && Number.isFinite(measured.minX) && Number.isFinite(measured.minY)
        ? measured
        : fallbackBounds;

    if (!bounds) {
      return { el, fill, stroke, opacity, bounds: null, coverage: 0, touchesX: false, touchesY: false };
    }

    const bw = Math.max(0, bounds.maxX - bounds.minX);
    const bh = Math.max(0, bounds.maxY - bounds.minY);
    const coverage = (bw * bh) / Math.max(1, vw * vh);
    const touchesX = bounds.minX <= vx + 1 && bounds.maxX >= maxX - 1;
    const touchesY = bounds.minY <= vy + 1 && bounds.maxY >= maxY - 1;

    return { el, fill, stroke, opacity, bounds, coverage, touchesX, touchesY };
  });

  evaluated.forEach((item) => {
    const { el, fill, stroke, opacity, coverage, touchesX, touchesY } = item;

    const hasMeaningfulStroke = !!(
      stroke &&
      stroke !== "none" &&
      stroke !== "transparent" &&
      !sameColor(stroke, fill)
    );

    if (!isDarkFill(fill) || opacity < 0.65) return;
    if (hasMeaningfulStroke) return;

    if (coverage >= 0.92 && touchesX && touchesY) {
      el.remove();
    }
  });

  if (aggressive) {
    const removable = evaluated
      .filter(({ el, stroke, opacity, coverage, touchesX, touchesY }) => {
        const tag = el.tagName.toLowerCase();
        const fill = getSvgProp(el, "fill");
        if (!(tag === "path" || tag === "polygon" || tag === "polyline" || tag === "rect")) return false;
        const hasMeaningfulStroke = !!(
          stroke &&
          stroke !== "none" &&
          stroke !== "transparent" &&
          !sameColor(stroke, fill)
        );
        if (hasMeaningfulStroke) return false;
        if (opacity < 0.4) return false;
        if (coverage < 0.7) return false;
        return touchesX && touchesY;
      })
      .sort((a, b) => b.coverage - a.coverage);

    if (removable.length > 0 && removable[0].coverage >= 0.82) {
      removable.slice(0, 3).forEach((item, idx) => {
        if (idx === 0 || item.coverage >= 0.88) item.el.remove();
      });
    }
  }

  return new XMLSerializer().serializeToString(doc);
};

const saveTextFile = (filename: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export default function Home() {
  const ref = useRef<MeshBundle | null>(null);
  const [group, setGroup] = useState<THREE.Group | null>(null);
  const [svgText, setSvgText] = useState("");
  const [filename, setFilename] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageName, setImageName] = useState("");
  const [convertedSvg, setConvertedSvg] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [traceQuality, setTraceQuality] = useState<TraceQuality>("fast");
  const [removeBackground, setRemoveBackground] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [status, setStatus] = useState(EMPTY);
  const imagePickerRef = useRef<HTMLInputElement | null>(null);

  const [p, setP] = useState<Params>({
    depth: 10,
    steps: 1,
    curveSegments: 12,
    bevelEnabled: true,
    bevelThickness: 1,
    bevelSize: 1,
    bevelSegments: 3,
    metalness: 0.1,
    roughness: 0.2,
    clearcoat: 0.3,
    clearcoatRoughness: 0.1,
    edgeOpacity: 0.15,
    edgeThreshold: 25,
    showEdges: true,
    wireframe: false,
    color: "#f1f5f9",
    useSvgColor: true,
  });

  const setNum = (k: keyof Params) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setP((v) => ({ ...v, [k]: Number(e.target.value) }));


  const setStr = (k: keyof Params) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setP((v) => ({ ...v, [k]: e.target.value }));

  const onSvgFile = useCallback(async (file?: File) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    const isSvg = name.endsWith(".svg");

    if (!isSvg) {
      setStatus("Invalid 3D source. SVG only.");
      return;
    }

    const baseName = file.name.replace(/\.svg$/i, "");
    setFilename(baseName);

    try {
      const text = await readAsText(file);
      if (!text) {
        setStatus("SVG read failed.");
        return;
      }
      setSvgText(text);
      setStatus(`Loaded SVG: ${file.name}`);
    } catch (error) {
      console.error(error);
      setSvgText("");
      setStatus("SVG load failed.");
    }
  }, []);

  const onImageFile = useCallback((file?: File) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".png") && !name.endsWith(".jpg") && !name.endsWith(".jpeg")) {
      setStatus("Invalid image type. PNG/JPG/JPEG only.");
      return;
    }

    setImageFile(file);
    setImageName(file.name.replace(/\.(png|jpg|jpeg)$/i, ""));
    setConvertedSvg("");
    setStatus(`Selected image: ${file.name}`);
  }, []);

  const convertImageToSvg = useCallback(async () => {
    if (!imageFile) return;
    setIsConverting(true);
    setStatus(`Converting ${imageFile.name} to SVG...`);

    try {
      const maxDimension = traceQuality === "fast" ? 1024 : 1536;
      const imageDataUrl = await preprocessRasterForTrace(imageFile, removeBackground, maxDimension);
      const tracerModule = await import("imagetracerjs");
      const tracer = (tracerModule.default ?? tracerModule) as ImageTracerApi;
      const options = TRACE_PRESETS[traceQuality] ?? DEFAULT_TRACE_OPTIONS;
      const tracedSvg = await traceRasterToSvg(imageDataUrl, tracer, options);
      const cleanedSvg = stripBackgroundRect(tracedSvg, removeBackground);
      setConvertedSvg(cleanedSvg);
      setStatus(`Ready: ${imageName || "image"}.svg`);
    } catch (error) {
      console.error(error);
      setConvertedSvg("");
      setStatus("Image conversion failed.");
    } finally {
      setIsConverting(false);
    }
  }, [imageFile, imageName, removeBackground, traceQuality]);

  useEffect(() => {
    if (!svgText) return;
    try {
      const b = buildMesh(svgText, p);
      const ok = b.group.children.length > 0;
      dispose(ref.current);
      ref.current = b;
      startTransition(() => setGroup(ok ? b.group : null));
      startTransition(() =>
        setStatus(ok ? `Ready: ${filename || "model"}.svg` : "No paths found in SVG.")
      );
    } catch (e) {
      console.error(e);
      dispose(ref.current);
      ref.current = null;
      startTransition(() => setGroup(null));
      startTransition(() => setStatus("Parse Error."));
    }
  }, [svgText, p, filename]);

  useEffect(() => {
    return () => {
      dispose(ref.current);
      ref.current = null;
    };
  }, []);

  const exportGlb = useCallback(() => {
    if (!group) return;
    new GLTFExporter().parse(
      group,
      (r) => {
        const blob = r instanceof ArrayBuffer ? new Blob([r], { type: "model/gltf-binary" }) : new Blob([JSON.stringify(r)], { type: "model/gltf+json" });
        const u = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = u;
        a.download = `${filename || "model"}.glb`;
        a.click();
        URL.revokeObjectURL(u);
      },
      (err) => console.error(err),
      { binary: true }
    );
  }, [group, filename]);

  const exportStl = useCallback(() => {
    if (!group) return;
    const r = new STLExporter().parse(group, { binary: true });
    const u = URL.createObjectURL(new Blob([r], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = u;
    a.download = `${filename || "model"}.stl`;
    a.click();
    URL.revokeObjectURL(u);
  }, [group, filename]);

  const exportSvg = useCallback(() => {
    if (!convertedSvg) return;
    saveTextFile(`${imageName || "image"}.svg`, convertedSvg, "image/svg+xml;charset=utf-8");
  }, [convertedSvg, imageName]);

  const convertedSvgPreviewSrc = useMemo(() => {
    if (!convertedSvg) return "";
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(convertedSvg)}`;
  }, [convertedSvg]);

  const cls = (l: string, d: string) => (theme === "light" ? l : d);
  

  if (!mounted) return null;
  return (
    <main className={`h-screen w-screen overflow-hidden ${cls("bg-[#f8fafc] text-slate-900", "bg-slate-950 text-slate-100")}`}>
      <div className="grid h-full w-full md:grid-cols-[380px_1fr]">
        <section className={`flex flex-col h-full overflow-y-auto p-8 shadow-2xl z-10 ${cls("bg-white/90 border-r border-slate-200 backdrop-blur-xl", "bg-slate-900/90 border-r border-slate-800 backdrop-blur-xl")}`}>
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-black tracking-tighter uppercase">SVG <span className="text-blue-600">3D</span></h1>
            <button
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className={`p-2.5 rounded-2xl transition-all duration-300 ${cls("bg-slate-100 hover:bg-slate-200 shadow-inner", "bg-slate-800 hover:bg-slate-700 shadow-xl")}`}
            >
              {theme === "light" ? "🌙" : "☀️"}
            </button>
          </div>

          <div className="space-y-8">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">3D Source (SVG)</label>
              <div className={`relative group transition-all duration-300 rounded-2xl border-2 border-dashed p-1 ${cls("border-slate-200 hover:border-blue-400 bg-slate-50/50", "border-slate-800 hover:border-blue-500 bg-slate-800/30")}`}>
                <input
                  type="file"
                  accept=".svg,image/svg+xml"
                  onChange={(e) => onSvgFile(e.target.files?.[0])}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="py-4 text-center">
                  <span className="text-sm font-medium opacity-60 group-hover:opacity-100 transition-opacity">
                    {filename ? `${filename}.svg` : "Drag or Click SVG"}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Convert PNG/JPG to SVG</h2>
              <input
                ref={imagePickerRef}
                type="file"
                accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                onChange={(e) => onImageFile(e.target.files?.[0])}
                className="hidden"
              />
              <button
                onClick={() => imagePickerRef.current?.click()}
                className={`w-full font-bold py-3 rounded-2xl transition-all border-2 ${cls("border-slate-200 bg-white text-slate-900", "border-slate-700 bg-slate-900 text-white")}`}
              >
                Select PNG/JPG
              </button>
              <button
                onClick={convertImageToSvg}
                disabled={!!(!imageFile || isConverting)}
                className={`w-full font-bold py-3 rounded-2xl disabled:opacity-30 transition-all border-2 ${cls("border-blue-200 bg-blue-50 text-blue-700", "border-blue-800 bg-blue-950/40 text-blue-200")}`}
              >
                {isConverting ? "Converting..." : "Convert PNG/JPG to SVG"}
              </button>
              <div className={`rounded-2xl border p-3 ${cls("border-slate-200 bg-slate-50", "border-slate-700 bg-slate-800/60")}`}>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-3">Conversion Options</div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-semibold opacity-80" htmlFor="trace-quality">Quality</label>
                  <select
                    id="trace-quality"
                    value={traceQuality}
                    onChange={(e) => setTraceQuality(e.target.value as TraceQuality)}
                    className={`text-xs rounded-lg px-3 py-2 border ${cls("bg-white border-slate-200", "bg-slate-900 border-slate-700")}`}
                  >
                    <option value="fast">Fast</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 mt-3 text-xs font-semibold opacity-80">
                  <input
                    type="checkbox"
                    checked={removeBackground}
                    onChange={(e) => setRemoveBackground(e.target.checked)}
                    className="accent-blue-600"
                  />
                  Remove flat background
                </label>
              </div>
              <button
                onClick={exportSvg}
                disabled={!!(!convertedSvg)}
                className={`w-full font-bold py-3 rounded-2xl disabled:opacity-30 transition-all border-2 ${cls("border-emerald-200 bg-emerald-50 text-emerald-700", "border-emerald-800 bg-emerald-950/40 text-emerald-200")}`}
              >
                Export SVG
              </button>

              <div className={`rounded-2xl border p-3 ${cls("border-slate-200 bg-white", "border-slate-700 bg-slate-900")}`}>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-2">SVG Output Preview</div>
                <div className={`h-36 rounded-xl overflow-hidden flex items-center justify-center relative ${cls("bg-slate-50", "bg-slate-800")}`}>
                  {convertedSvgPreviewSrc ? (
                    <Image
                      src={convertedSvgPreviewSrc}
                      alt="Converted SVG preview"
                      fill
                      unoptimized
                      className="object-contain"
                    />
                  ) : (
                    <span className="text-xs opacity-50">No converted SVG yet</span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Dimensions</h2>
              
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider opacity-60"><span>Thickness</span><span>{p.depth}</span></div>
                  <input type="range" min="1" max="100" value={p.depth} onChange={setNum("depth")} className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Bevel Edges</span>
                  <button 
                    onClick={() => setP(v => ({...v, bevelEnabled: !v.bevelEnabled}))}
                    className={`w-10 h-5 rounded-full transition-colors relative ${p.bevelEnabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${p.bevelEnabled ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>

                {p.bevelEnabled && (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold uppercase opacity-50">Thickness</span>
                      <input type="range" min="0" max="10" step="0.1" value={p.bevelThickness} onChange={setNum("bevelThickness")} className="w-full accent-blue-600" />
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold uppercase opacity-50">Size</span>
                      <input type="range" min="0" max="10" step="0.1" value={p.bevelSize} onChange={setNum("bevelSize")} className="w-full accent-blue-600" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6 pt-6 border-t border-slate-100 dark:border-slate-800">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Appearance</h2>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">SVG Original Colors</span>
                <button 
                  onClick={() => setP(v => ({...v, useSvgColor: !v.useSvgColor}))}
                  className={`w-10 h-5 rounded-full transition-colors relative ${p.useSvgColor ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${p.useSvgColor ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              {!p.useSvgColor && (
                <div className="flex items-center justify-between animate-in fade-in duration-300">
                  <span className="text-sm font-medium opacity-60">Color Overlay</span>
                  <input type="color" value={p.color} onChange={setStr("color")} className="w-10 h-10 rounded-xl border-none bg-transparent cursor-pointer shadow-lg" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase opacity-50"><span>Metal</span><span>{p.metalness}</span></div>
                  <input type="range" min="0" max="1" step="0.01" value={p.metalness} onChange={setNum("metalness")} className="w-full accent-blue-600" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase opacity-50"><span>Rough</span><span>{p.roughness}</span></div>
                  <input type="range" min="0" max="1" step="0.01" value={p.roughness} onChange={setNum("roughness")} className="w-full accent-blue-600" />
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 gap-3">
              <button
                onClick={exportGlb} disabled={!!(!group)}
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-4 rounded-2xl disabled:opacity-30 transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-blue-500/10"
              >
                Export GLB (3D)
              </button>
              <button
                onClick={exportStl} disabled={!!(!group)}
                className={`w-full font-bold py-3 rounded-2xl disabled:opacity-30 transition-all border-2 ${cls("border-slate-200 bg-white text-slate-900", "border-slate-800 bg-slate-900 text-white")}`}
              >
                Export STL (Print)
              </button>
            </div>
          </div>

          <div className="mt-auto pt-8">
            <div className={`p-4 rounded-2xl text-[10px] font-medium leading-relaxed tracking-wide ${cls("bg-slate-50 text-slate-400", "bg-slate-800/50 text-slate-500")}`}>
              STATUS: {status.toUpperCase()}
            </div>
          </div>
        </section>

        <section className={`relative h-full overflow-hidden ${cls("bg-linear-to-br from-slate-50 to-slate-200", "bg-linear-to-br from-slate-900 to-black")}`}>
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.05),transparent_70%)]" />
          <Canvas shadows camera={{ position: [5, 4, 5], fov: 35 }}>
            <Scene group={group} theme={theme} />
          </Canvas>
          {!group && (
            <div className="absolute inset-0 flex flex-col items-center justify-center animate-pulse">
              <div className="w-24 h-24 rounded-full bg-blue-500/10 flex items-center justify-center mb-6">
                <div className="text-5xl">🧊</div>
              </div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] opacity-30">Waiting for SVG</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
