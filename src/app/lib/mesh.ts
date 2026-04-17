import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { FIT, type MeshBundle, type Params } from "./types";

export const dispose = (b: MeshBundle | null) => {
  if (!b) return;
  b.geometries.forEach((g) => g.dispose());
  b.materials.forEach((m) => m.dispose());
  b.edges.forEach((e) => {
    e.geometry.dispose();
    (e.material as THREE.Material).dispose();
  });
  b.group.clear();
};

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

  const fillVisible = fill !== "none" && fill !== "transparent" && fillOpacity * opacity > 0.01;
  const strokeVisible = stroke !== "none" && stroke !== "transparent" && strokeOpacity * opacity > 0.01;
  return fillVisible || strokeVisible;
};

export function buildMesh(svgText: string, p: Params): MeshBundle {
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
    if (!isPathVisible(path)) return;
    SVGLoader.createShapes(path).forEach((s) => {
      s.extractPoints(8).shape.forEach((v) => bounds.expandByPoint(new THREE.Vector2(v.x, v.y)));
    });
  });

  const size = bounds.getSize(new THREE.Vector2());
  const fitScale = FIT / Math.max(size.x, size.y, 1);
  const worldDepth = (p.depth / 10) / fitScale;

  data.paths.forEach((path) => {
    if (!isPathVisible(path)) return;

    const style = path.userData?.style ?? {};
    const opacity = parseOpacity(style.opacity, 1);
    const fillOpacity = parseOpacity(style.fillOpacity, 1);
    const strokeOpacity = parseOpacity(style.strokeOpacity, 1);

    let fill = path.userData?.style?.fill;
    if (!fill || fill === "none" || fill === "transparent" || fillOpacity * opacity <= 0.01) {
      const stroke = path.userData?.style?.stroke;
      fill = stroke && stroke !== "none" && stroke !== "transparent" && strokeOpacity * opacity > 0.01
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
          new THREE.LineBasicMaterial({ color: "#0f172a", transparent: true, opacity: p.edgeOpacity })
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
    const center = new THREE.Vector3();
    box.getCenter(center);
    group.position.sub(center);
    group.scale.set(fitScale, -fitScale, fitScale);
  }

  return { group, geometries, materials, edges };
}
