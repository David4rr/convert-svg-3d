import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Float, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Theme } from "../lib/types";

function Scene({ group, theme }: { group: THREE.Group | null; theme: Theme }) {
  const cloned = useMemo(() => {
    if (!group) return null;
    const g = group.clone(true);
    const box = new THREE.Box3().setFromObject(g);
    const c = new THREE.Vector3();
    box.getCenter(c);
    g.position.x -= c.x;
    g.position.z -= c.z;
    g.position.y -= box.min.y + 1.5;
    return g;
  }, [group]);

  return (
    <>
      <ambientLight intensity={theme === "light" ? 0.7 : 0.4} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={theme === "light" ? 1.5 : 1} castShadow />
      {cloned && <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}><primitive object={cloned} /></Float>}
      <ContactShadows position={[0, -1.5, 0]} opacity={theme === "light" ? 0.4 : 0.6} scale={10} blur={2.5} far={4} />
      <Environment preset="city" />
      <gridHelper args={[20, 40, theme === "light" ? "#e2e8f0" : "#1e293b", theme === "light" ? "#f1f5f9" : "#0f172a"]} position={[0, -1.51, 0]} />
      <OrbitControls enableDamping dampingFactor={0.08} minDistance={2} maxDistance={15} makeDefault target={[0, -0.5, 0]} />
    </>
  );
}

export function SceneView({ group, theme }: { group: THREE.Group | null; theme: Theme }) {
  const bg = theme === "light" ? "bg-linear-to-br from-slate-50 to-slate-200" : "bg-linear-to-br from-slate-900 to-black";
  return (
    <section className={`relative h-full overflow-hidden ${bg}`}>
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.05),transparent_70%)]" />
      <Canvas shadows camera={{ position: [5, 4, 5], fov: 35 }}>
        <Scene group={group} theme={theme} />
      </Canvas>
      {!group && (
        <div className="absolute inset-0 flex flex-col items-center justify-center animate-pulse">
          <div className="w-24 h-24 rounded-full bg-blue-500/10 flex items-center justify-center mb-6"><div className="text-5xl">🧊</div></div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] opacity-30">Waiting for SVG</p>
        </div>
      )}
    </section>
  );
}
