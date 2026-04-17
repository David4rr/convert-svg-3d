"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { SceneView } from "./SceneView";
import { HomeLegacyControls } from "./HomeLegacyControls";
import { buildMesh, dispose } from "../lib/mesh";
import { preprocessRasterForTrace, readAsText, saveTextFile, traceRasterToSvg } from "../lib/raster";
import { stripBackgroundRect } from "../lib/svgCleanup";
import {
  DEFAULT_PARAMS,
  EMPTY,
  TRACE_PRESETS,
  type ImageTracerApi,
  type MeshBundle,
  type Params,
  type Theme,
  type TraceOptions,
  type TraceQuality,
} from "../lib/types";

export default function HomeLegacyRefactored() {
  const ref = useRef<MeshBundle | null>(null);
  const imagePickerRef = useRef<HTMLInputElement | null>(null);
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
  const [status, setStatus] = useState(EMPTY);
  const [p, setP] = useState<Params>(DEFAULT_PARAMS);

  useEffect(() => setMounted(true), []);

  const setNum = (k: keyof Params) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setP((v) => ({ ...v, [k]: Number(e.target.value) }));
  const setStr = (k: keyof Params) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setP((v) => ({ ...v, [k]: e.target.value }));

  const onSvgFile = useCallback(async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".svg")) {
      setStatus("Invalid 3D source. SVG only.");
      return;
    }
    setFilename(file.name.replace(/\.svg$/i, ""));
    try {
      const text = await readAsText(file);
      if (!text) {
        setStatus("SVG read failed.");
        return;
      }
      setSvgText(text);
      setStatus(`Loaded SVG: ${file.name}`);
    } catch {
      setSvgText("");
      setStatus("SVG load failed.");
    }
  }, []);

  const onImageFile = useCallback((file?: File) => {
    if (!file) return;
    const n = file.name.toLowerCase();
    if (!n.endsWith(".png") && !n.endsWith(".jpg") && !n.endsWith(".jpeg")) {
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
      const options: TraceOptions = TRACE_PRESETS[traceQuality] ?? (TRACE_PRESETS.fast as TraceOptions);
      const tracedSvg = await traceRasterToSvg(imageDataUrl, tracer, options);
      const cleanedSvg = stripBackgroundRect(tracedSvg, removeBackground);
      setConvertedSvg(cleanedSvg);
      setStatus(`Ready: ${imageName || "image"}.svg`);
    } catch {
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
      startTransition(() => setStatus(ok ? `Ready: ${filename || "model"}.svg` : "No paths found in SVG."));
    } catch {
      dispose(ref.current);
      ref.current = null;
      startTransition(() => setGroup(null));
      startTransition(() => setStatus("Parse Error."));
    }
  }, [svgText, p, filename]);

  useEffect(() => () => {
    dispose(ref.current);
    ref.current = null;
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
      () => undefined,
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
    if (convertedSvg) saveTextFile(`${imageName || "image"}.svg`, convertedSvg, "image/svg+xml;charset=utf-8");
  }, [convertedSvg, imageName]);

  const convertedSvgPreviewSrc = useMemo(
    () => (convertedSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(convertedSvg)}` : ""),
    [convertedSvg]
  );

  if (!mounted) return null;
  return (
    <main className={theme === "light" ? "h-screen w-screen overflow-hidden bg-[#f8fafc] text-slate-900" : "h-screen w-screen overflow-hidden bg-slate-950 text-slate-100"}>
      <div className="grid h-full w-full md:grid-cols-[380px_1fr]">
        <HomeLegacyControls
          theme={theme}
          setTheme={setTheme}
          filename={filename}
          onSvgFile={onSvgFile}
          imagePickerRef={imagePickerRef}
          onImageFile={onImageFile}
          convertImageToSvg={convertImageToSvg}
          imageFile={imageFile}
          isConverting={isConverting}
          traceQuality={traceQuality}
          setTraceQuality={setTraceQuality}
          removeBackground={removeBackground}
          setRemoveBackground={setRemoveBackground}
          exportSvg={exportSvg}
          convertedSvg={convertedSvg}
          convertedSvgPreviewSrc={convertedSvgPreviewSrc}
          p={p}
          setNum={setNum}
          setStr={setStr}
          setP={setP}
          exportGlb={exportGlb}
          exportStl={exportStl}
          group={group}
          status={status}
        />
        <SceneView group={group} theme={theme} />
      </div>
    </main>
  );
}
