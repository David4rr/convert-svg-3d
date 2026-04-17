import Image from "next/image";
import type * as THREE from "three";
import type { Params, Theme, TraceQuality } from "../lib/types";

type Props = {
  theme: Theme;
  setTheme: (next: Theme) => void;
  filename: string;
  onSvgFile: (file?: File) => void;
  imagePickerRef: React.RefObject<HTMLInputElement | null>;
  onImageFile: (file?: File) => void;
  convertImageToSvg: () => void;
  imageFile: File | null;
  isConverting: boolean;
  traceQuality: TraceQuality;
  setTraceQuality: (quality: TraceQuality) => void;
  removeBackground: boolean;
  setRemoveBackground: (enabled: boolean) => void;
  exportSvg: () => void;
  convertedSvg: string;
  convertedSvgPreviewSrc: string;
  p: Params;
  setNum: (k: keyof Params) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  setStr: (k: keyof Params) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  setP: React.Dispatch<React.SetStateAction<Params>>;
  exportGlb: () => void;
  exportStl: () => void;
  group: THREE.Group | null;
  status: string;
};

export function HomeLegacyControls({
  theme,
  setTheme,
  filename,
  onSvgFile,
  imagePickerRef,
  onImageFile,
  convertImageToSvg,
  imageFile,
  isConverting,
  traceQuality,
  setTraceQuality,
  removeBackground,
  setRemoveBackground,
  exportSvg,
  convertedSvg,
  convertedSvgPreviewSrc,
  p,
  setNum,
  setStr,
  setP,
  exportGlb,
  exportStl,
  group,
  status,
}: Props) {
  const cls = (l: string, d: string) => (theme === "light" ? l : d);

  return (
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
                onClick={() => setP((v) => ({ ...v, bevelEnabled: !v.bevelEnabled }))}
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
              onClick={() => setP((v) => ({ ...v, useSvgColor: !v.useSvgColor }))}
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
            onClick={exportGlb}
            disabled={!!(!group)}
            className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-4 rounded-2xl disabled:opacity-30 transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-blue-500/10"
          >
            Export GLB (3D)
          </button>
          <button
            onClick={exportStl}
            disabled={!!(!group)}
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
  );
}
