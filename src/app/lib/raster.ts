import { type ImageTracerApi, type TraceOptions } from "./types";

export const readAsText = (file: File) =>
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

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image."));
    img.src = src;
  });

const colorDist = (a: number, b: number, c: number, x: number, y: number, z: number) =>
  Math.sqrt((a - x) ** 2 + (b - y) ** 2 + (c - z) ** 2);

const edgeAvg = (pixels: Uint8ClampedArray, w: number, h: number) => {
  let r = 0;
  let g = 0;
  let b = 0;
  let c = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 120));

  for (let x = 0; x < w; x += step) {
    const top = x * 4;
    const bottom = ((h - 1) * w + x) * 4;
    if (pixels[top + 3] > 0) { r += pixels[top]; g += pixels[top + 1]; b += pixels[top + 2]; c += 1; }
    if (pixels[bottom + 3] > 0) { r += pixels[bottom]; g += pixels[bottom + 1]; b += pixels[bottom + 2]; c += 1; }
  }

  for (let y = 0; y < h; y += step) {
    const left = y * w * 4;
    const right = (y * w + (w - 1)) * 4;
    if (pixels[left + 3] > 0) { r += pixels[left]; g += pixels[left + 1]; b += pixels[left + 2]; c += 1; }
    if (pixels[right + 3] > 0) { r += pixels[right]; g += pixels[right + 1]; b += pixels[right + 2]; c += 1; }
  }

  return c === 0 ? { r: 255, g: 255, b: 255 } : { r: r / c, g: g / c, b: b / c };
};

const floodClear = (pixels: Uint8ClampedArray, w: number, h: number, tol: number) => {
  const bg = edgeAvg(pixels, w, h);
  const seen = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (seen[i]) return;
    const p = i * 4;
    if (pixels[p + 3] === 0) { seen[i] = 1; return; }
    if (colorDist(pixels[p], pixels[p + 1], pixels[p + 2], bg.r, bg.g, bg.b) > tol) return;
    seen[i] = 1;
    q[tail++] = i;
  };

  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

  while (head < tail) {
    const i = q[head++];
    const x = i % w;
    const y = Math.floor(i / w);
    pixels[i * 4 + 3] = 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
};

export const preprocessRasterForTrace = async (file: File, removeBg: boolean, maxDim: number) => {
  const img = await loadImage(await readAsDataUrl(file));
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
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
    floodClear(imageData.data, w, h, 65);
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas.toDataURL("image/png");
};

export const traceRasterToSvg = (dataUrl: string, tracer: ImageTracerApi, options: TraceOptions) =>
  new Promise<string>((resolve, reject) => {
    tracer.imageToSVG(
      dataUrl,
      (svg) => (svg ? resolve(svg) : reject(new Error("Trace returned empty SVG."))),
      options
    );
  });

export const saveTextFile = (filename: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
