// Mode auto-école : fichier unique (règles, panneaux, état, 3D, HUD).
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CanvasTexture, DoubleSide, Object3D, Raycaster, SRGBColorSpace, Vector3 } from 'three';
import { create } from 'zustand';
import { useSimulatorStore } from '../simulator/state/simulator.store';

export const RULES = {
  defaultLimit: 50,
  speedTolerance: 5,
  speedGraceSeconds: 2,
  speedFaultCooldown: 10,
  detectRadius: 30,
  signPassRadius: 10,
  stopRadius: 10,
  stopMaxSpeed: 3,
  startScore: 100,
  passScore: 80,
  penalties: { speed: 5, stop: 15 },
} as const;

export type SignCategory = 'Interdiction' | 'Danger' | 'Priorité' | 'Indication';

export interface SignDef {
  code: string;
  name: string;
  category: SignCategory;
  meaning: string;
}

export const SIGN_DEFS: Record<string, SignDef> = {
  B1: {
    code: 'B1',
    name: 'Sens interdit',
    category: 'Interdiction',
    meaning: "Interdit à tout véhicule d'entrer dans cette voie. Vous la voyez par l'avant : ne vous y engagez pas.",
  },
  B14: {
    code: 'B14',
    name: 'Limitation de vitesse',
    category: 'Interdiction',
    meaning: "Vitesse maximale autorisée, en km/h. Elle s'applique jusqu'au prochain panneau de limitation ou de fin.",
  },
  AB4: {
    code: 'AB4',
    name: 'STOP',
    category: 'Priorité',
    meaning: "Arrêt obligatoire à la ligne, même si la route semble libre. Cédez le passage à tous les usagers.",
  },
  AB3a: {
    code: 'AB3a',
    name: 'Cédez le passage',
    category: 'Priorité',
    meaning: "Ralentissez et laissez passer les véhicules de l'autre voie. Arrêtez-vous si nécessaire.",
  },
  AB6: {
    code: 'AB6',
    name: 'Route à priorité',
    category: 'Priorité',
    meaning: "Vous êtes sur une route prioritaire aux intersections, tant que le panneau n'est pas barré.",
  },
  A14: {
    code: 'A14',
    name: 'Autres dangers',
    category: 'Danger',
    meaning: "Danger non couvert par un autre panneau. Redoublez de vigilance et réduisez votre vitesse.",
  },
  C20a: {
    code: 'C20a',
    name: 'Passage pour piétons',
    category: 'Indication',
    meaning: "Les piétons engagés ou qui manifestent l'intention de traverser sont prioritaires.",
  },
  C1a: {
    code: 'C1a',
    name: 'Stationnement',
    category: 'Indication',
    meaning: 'Lieu où le stationnement est autorisé.',
  },
};

export interface SignPlacement {
  id: string;
  sign: string;
  speed?: number;
  x: number;
  y?: number;
  z: number;
  rotationY?: number;
}

// EXEMPLES à remplacer : roulez jusqu'à l'endroit voulu, appuyez sur P,
// puis collez la ligne générée dans ce tableau.
export const SIGN_PLACEMENTS: SignPlacement[] = [
  { id: 'demo-1', sign: 'B14', speed: 50, x: 4, y: 0, z: 12, rotationY: Math.PI },
  { id: 'demo-2', sign: 'AB4', x: -4, y: 0, z: 30, rotationY: Math.PI },
  { id: 'demo-3', sign: 'C20a', x: 4, y: 0, z: 48, rotationY: Math.PI },
];

export type FaultKind = keyof typeof RULES.penalties;

export interface Fault {
  id: number;
  kind: FaultKind;
  message: string;
  points: number;
}

interface ExamState {
  enabled: boolean;
  score: number;
  faults: Fault[];
  currentLimit: number;
  nearbySign: { code: string; speed?: number } | null;
  toast: string | null;
  capture: string | null;
  reportVisible: boolean;
  addFault: (kind: FaultKind, message: string) => void;
  setLimit: (limit: number) => void;
  setNearbySign: (sign: ExamState['nearbySign']) => void;
  clearToast: () => void;
  setCapture: (text: string | null) => void;
  toggleEnabled: () => void;
  toggleReport: () => void;
  reset: () => void;
}

let faultId = 0;

export const useExamStore = create<ExamState>((set) => ({
  enabled: true,
  score: RULES.startScore,
  faults: [],
  currentLimit: RULES.defaultLimit,
  nearbySign: null,
  toast: null,
  capture: null,
  reportVisible: false,
  addFault: (kind, message) =>
    set((s) => {
      const points = RULES.penalties[kind];
      return {
        faults: [...s.faults, { id: ++faultId, kind, message, points }],
        score: Math.max(0, s.score - points),
        toast: `${message} (-${points})`,
      };
    }),
  setLimit: (currentLimit) => set({ currentLimit }),
  setNearbySign: (nearbySign) => set({ nearbySign }),
  clearToast: () => set({ toast: null }),
  setCapture: (capture) => set({ capture }),
  toggleEnabled: () => set((s) => ({ enabled: !s.enabled })),
  toggleReport: () => set((s) => ({ reportVisible: !s.reportVisible })),
  reset: () =>
    set({ score: RULES.startScore, faults: [], currentLimit: RULES.defaultLimit, toast: null, reportVisible: false }),
}));

const RED = '#d6181f';
const BLUE = '#0b4ea2';
const YELLOW = '#f7c600';
type Pt = [number, number];

const scalePts = (pts: Pt[], cx: number, cy: number, k: number): Pt[] =>
  pts.map(([x, y]) => [cx + (x - cx) * k,
