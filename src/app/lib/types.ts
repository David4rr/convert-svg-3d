import * as THREE from "three";

export type Theme = "light" | "dark";
export type TraceQuality = "fast" | "high";

export type Params = {
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

export type MeshBundle = {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  edges: THREE.LineSegments[];
};

export const FIT = 3.5;
export const EMPTY = "Waiting for SVG upload or image conversion...";

export const TRACE_PRESETS = {
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

export type TraceOptions = {
  ltres: number;
  qtres: number;
  pathomit: number;
  rightangleenhance: boolean;
  layering: number;
  colorsampling: number;
  numberofcolors: number;
  mincolorratio: number;
  colorquantcycles: number;
  roundcoords: number;
  linefilter: boolean;
  scale: number;
  strokewidth: number;
  viewbox: boolean;
  desc: boolean;
};

export const DEFAULT_PARAMS: Params = {
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
};

export type ImageTracerApi = {
  imageToSVG: (
    src: string,
    callback: (svg: string) => void,
    options: TraceOptions
  ) => void;
};
