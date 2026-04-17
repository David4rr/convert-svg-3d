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
    return approxPathBounds(el.getAttribute("d") ?? "");
  }

  if (tag === "polygon" || tag === "polyline") {
    return approxPathBounds(el.getAttribute("points") ?? "");
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
        return { minX: g.x, minY: g.y, maxX: g.x + g.width, maxY: g.y + g.height };
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
  return Math.abs(ca.r - cb.r) <= 2 && Math.abs(ca.g - cb.g) <= 2 && Math.abs(ca.b - cb.b) <= 2;
};

export const stripBackgroundRect = (svg: string, aggressive = false) => {
  if (typeof window === "undefined") return svg;
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  const viewBox = root.getAttribute("viewBox")?.trim().split(/\s+/).map(Number);
  if (!viewBox || viewBox.length !== 4 || viewBox.some((n) => Number.isNaN(n))) return svg;

  const [vx, vy, vw, vh] = viewBox;
  const maxX = vx + vw;
  const maxY = vy + vh;
  const selector = "path,polygon,polyline,rect,circle,ellipse";
  const measuredBounds = measureSvgBounds(root, selector);

  Array.from(root.querySelectorAll("rect")).forEach((rect) => {
    const x = Number(rect.getAttribute("x") ?? 0);
    const y = Number(rect.getAttribute("y") ?? 0);
    const rw = Number(rect.getAttribute("width") ?? 0);
    const rh = Number(rect.getAttribute("height") ?? 0);
    const fill = getSvgProp(rect, "fill");
    const stroke = getSvgProp(rect, "stroke", "none");
    const hasMeaningfulStroke = !!(stroke && stroke !== "none" && stroke !== "transparent" && !sameColor(stroke, fill));
    const coversAll = Math.abs(x - vx) <= 1 && Math.abs(y - vy) <= 1 && rw >= vw * 0.98 && rh >= vh * 0.98;
    if (!hasMeaningfulStroke && coversAll) rect.remove();
  });

  const evaluated = Array.from(root.querySelectorAll(selector)).map((el, idx) => {
    const fill = getSvgProp(el, "fill");
    const stroke = getSvgProp(el, "stroke", "none");
    const opacity = getNumericSvgProp(el, "fill-opacity", 1) * getNumericSvgProp(el, "opacity", 1);
    const measured = measuredBounds[idx];
    const bounds = measured && Number.isFinite(measured.minX) ? measured : getElementBounds(el);

    if (!bounds) {
      return { el, fill, stroke, opacity, coverage: 0, touchesX: false, touchesY: false };
    }

    const bw = Math.max(0, bounds.maxX - bounds.minX);
    const bh = Math.max(0, bounds.maxY - bounds.minY);
    const coverage = (bw * bh) / Math.max(1, vw * vh);
    const touchesX = bounds.minX <= vx + 1 && bounds.maxX >= maxX - 1;
    const touchesY = bounds.minY <= vy + 1 && bounds.maxY >= maxY - 1;

    return { el, fill, stroke, opacity, coverage, touchesX, touchesY };
  });

  evaluated.forEach(({ el, fill, stroke, opacity, coverage, touchesX, touchesY }) => {
    const hasMeaningfulStroke = !!(stroke && stroke !== "none" && stroke !== "transparent" && !sameColor(stroke, fill));
    if (!isDarkFill(fill) || opacity < 0.65 || hasMeaningfulStroke) return;
    if (coverage >= 0.92 && touchesX && touchesY) el.remove();
  });

  if (aggressive) {
    const removable = evaluated
      .filter(({ el, stroke, opacity, coverage, touchesX, touchesY }) => {
        const tag = el.tagName.toLowerCase();
        const fill = getSvgProp(el, "fill");
        if (!(tag === "path" || tag === "polygon" || tag === "polyline" || tag === "rect")) return false;
        const hasMeaningfulStroke = !!(stroke && stroke !== "none" && stroke !== "transparent" && !sameColor(stroke, fill));
        if (hasMeaningfulStroke || opacity < 0.4 || coverage < 0.7) return false;
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
