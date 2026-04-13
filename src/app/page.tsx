"use client";

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Environment, Float } from "@react-three/drei";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

type Theme = "light" | "dark";

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
const EMPTY = "Waiting for SVG upload...";

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

  const bounds = new THREE.Box2(
    new THREE.Vector2(Infinity, Infinity),
    new THREE.Vector2(-Infinity, -Infinity)
  );

  data.paths.forEach((path) => {
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
    let fill = path.userData?.style?.fill;
    if (!fill || fill === "none" || fill === "transparent") {
      const stroke = path.userData?.style?.stroke;
      fill = (stroke && stroke !== "none" && stroke !== "transparent") ? stroke : "#f1f5f9";
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

export default function Home() {
  const ref = useRef<MeshBundle | null>(null);
  const [group, setGroup] = useState<THREE.Group | null>(null);
  const [svgText, setSvgText] = useState("");
  const [filename, setFilename] = useState("");
  const [theme, setTheme] = useState<Theme>("dark");
  const [status, setStatus] = useState(EMPTY);


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

  const onFile = useCallback((file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".svg")) {
      setStatus("Invalid file type. SVG only.");
      return;
    }

    const r = new FileReader();
    r.onload = () => {
      const t = typeof r.result === "string" ? r.result : "";
      if (!t) return;
      setSvgText(t);
      setFilename(file.name.replace(/\.svg$/i, ""));
    };
    r.readAsText(file);
  }, []);

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

  const cls = (l: string, d: string) => (theme === "light" ? l : d);
  

  // If you want to ensure client-side rendering, you can check typeof window
  if (typeof window === "undefined") return <div className="h-screen w-screen bg-slate-950" />;

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
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Source File</label>
              <div className={`relative group transition-all duration-300 rounded-2xl border-2 border-dashed p-1 ${cls("border-slate-200 hover:border-blue-400 bg-slate-50/50", "border-slate-800 hover:border-blue-500 bg-slate-800/30")}`}>
                <input
                  type="file"
                  accept=".svg"
                  onChange={(e) => onFile(e.target.files?.[0])}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="py-4 text-center">
                  <span className="text-sm font-medium opacity-60 group-hover:opacity-100 transition-opacity">
                    {filename ? `${filename}.svg` : "Drag or Click to Upload"}
                  </span>
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
                onClick={exportGlb} disabled={!group}
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-4 rounded-2xl disabled:opacity-30 transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-blue-500/10"
              >
                Export GLB (3D)
              </button>
              <button
                onClick={exportStl} disabled={!group}
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

        <section className={`relative h-full overflow-hidden ${cls("bg-gradient-to-br from-slate-50 to-slate-200", "bg-gradient-to-br from-slate-900 to-black")}`}>
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
