// Mode auto-école : fichier unique (règles, panneaux, état, 3D, HUD).
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CanvasTexture, DoubleSide, Object3D, Raycaster, SRGBColorSpace, Vector3 } from 'three';
import { create } from 'zustand';
import { useSimulatorStore } from '../simulator/state/simulator.store';

// ===== config/rules.ts =====
// Règles du simulateur auto-école (valeurs ajustables).
export const RULES = {
  defaultLimit: 50,        // km/h : vitesse en agglomération par défaut
  speedTolerance: 5,       // km/h tolérés au-dessus de la limite
  speedGraceSeconds: 2,    // durée de dépassement avant faute
  speedFaultCooldown: 10,  // secondes entre deux fautes de vitesse
  detectRadius: 30,        // m : distance à laquelle un panneau est "vu"
  signPassRadius: 10,      // m : distance où la limite du panneau s'applique
  stopRadius: 10,          // m : zone de contrôle d'un STOP
  stopMaxSpeed: 3,         // km/h : en dessous = arrêt valide
  startScore: 100,
  passScore: 80,
  penalties: { speed: 5, stop: 15 },
} as const;

// ===== config/signs.ts =====
// Panneaux du code de la route français (codes officiels).
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

// ===== config/signPlacements.ts =====
// Position des panneaux dans la ville.
// EXEMPLES à remplacer : roulez jusqu'à l'endroit voulu, appuyez sur P,
// puis collez la ligne générée dans ce tableau.
export interface SignPlacement {
  id: string;
  sign: string;        // clé de SIGN_DEFS (ex: 'B14', 'AB4')
  speed?: number;      // uniquement pour B14
  x: number;
  y?: number;
  z: number;
  rotationY?: number;  // radians
}

export const SIGN_PLACEMENTS: SignPlacement[] = [
  { id: 'demo-1', sign: 'B14', speed: 50, x: 4, y: 0, z: 12, rotationY: Math.PI },
  { id: 'demo-2', sign: 'AB4', x: -4, y: 0, z: 30, rotationY: Math.PI },
  { id: 'demo-3', sign: 'C20a', x: 4, y: 0, z: 48, rotationY: Math.PI },
];

// ===== state/useExamStore.ts =====
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

// ===== lib/signTexture.ts =====
const RED = '#d6181f';
const BLUE = '#0b4ea2';
const YELLOW = '#f7c600';
type Pt = [number, number];

const scalePts = (pts: Pt[], cx: number, cy: number, k: number): Pt[] =>
  pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);

export function createSignTexture(code: string, speed = 50): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';

  const poly = (pts: Pt[], fill: string) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  const disc = (r: number, fill: string) => {
    g.beginPath();
    g.arc(128, 128, r, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
  };

  switch (code) {
    case 'B14':
      disc(120, RED);
      disc(92, '#fff');
      g.fillStyle = '#111';
      g.font = `bold ${speed >= 100 ? 78 : 100}px Arial`;
      g.fillText(String(speed), 128, 134);
      break;
    case 'B1':
      disc(120, RED);
      g.fillStyle = '#fff';
      g.fillRect(48, 106, 160, 44);
      break;
    case 'AB4': {
      const oct: Pt[] = Array.from({ length: 8 }, (_, i) => {
        const a = Math.PI / 8 + (i * Math.PI) / 4;
        return [128 + 122 * Math.cos(a), 128 + 122 * Math.sin(a)] as Pt;
      });
      poly(oct, '#fff');
      poly(scalePts(oct, 128, 128, 0.94), RED);
      g.fillStyle = '#fff';
      g.font = 'bold 74px Arial';
      g.fillText('STOP', 128, 132);
      break;
    }
    case 'AB3a': {
      const tri: Pt[] = [[10, 28], [246, 28], [128, 232]];
      poly(tri, RED);
      poly(scalePts(tri, 128, 96, 0.62), '#fff');
      break;
    }
    case 'A14': {
      const tri: Pt[] = [[128, 14], [248, 226], [8, 226]];
      poly(tri, RED);
      poly(scalePts(tri, 128, 156, 0.74), '#fff');
      g.fillStyle = '#111';
      g.font = 'bold 110px Arial';
      g.fillText('!', 128, 172);
      break;
    }
    case 'AB6': {
      const d: Pt[] = [[128, 6], [250, 128], [128, 250], [6, 128]];
      poly(d, '#fff');
      poly(scalePts(d, 128, 128, 0.84), '#111');
      poly(scalePts(d, 128, 128, 0.8), YELLOW);
      break;
    }
    case 'C20a': {
      poly([[16, 16], [240, 16], [240, 240], [16, 240]], '#fff');
      poly([[26, 26], [230, 26], [230, 230], [26, 230]], BLUE);
      poly([[128, 54], [200, 190], [56, 190]], '#fff');
      g.fillStyle = '#111';
      g.font = '84px Arial';
      g.fillText('\u{1F6B6}', 128, 150);
      break;
    }
    case 'C1a':
      poly([[16, 16], [240, 16], [240, 240], [16, 240]], '#fff');
      poly([[26, 26], [230, 26], [230, 230], [26, 230]], BLUE);
      g.fillStyle = '#fff';
      g.font = 'bold 180px Arial';
      g.fillText('P', 128, 136);
      break;
    default:
      disc(120, '#888');
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// ===== components/SignsLayer.tsx =====
export function SignsLayer() {
  const items = useMemo(
    () => SIGN_PLACEMENTS.map((p) => ({ p, texture: createSignTexture(p.sign, p.speed) })),
    [],
  );

  return (
    <group name="exam-signs">
      {items.map(({ p, texture }) => (
        <group key={p.id} position={[p.x, p.y ?? 0, p.z]} rotation={[0, p.rotationY ?? 0, 0]}>
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 2.2, 8]} />
            <meshStandardMaterial color="#9aa0a6" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 2.5, 0.05]}>
            <planeGeometry args={[0.8, 0.8]} />
            <meshBasicMaterial map={texture} transparent alphaTest={0.5} side={DoubleSide} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ===== components/ExamTracker.tsx =====
const SIGNS = SIGN_PLACEMENTS.map((p) => ({ ...p, pos: new Vector3(p.x, p.y ?? 0, p.z) }));

const isSignObject = (o: Object3D | null): boolean => {
  for (let n: Object3D | null = o; n; n = n.parent) if (n.name === 'exam-signs') return true;
  return false;
};

/** Composant sans rendu : surveille la conduite et enregistre les fautes. */
export function ExamTracker() {
  const { camera, scene } = useThree();
  const fwd = useRef(new Vector3());
  const tmp = useRef(new Vector3());
  const run = useRef({
    stopId: null as string | null,
    stopMin: 999,
    over: 0,
    lastSpeedFault: -999,
    passedId: null as string | null,
    nearKey: '',
  });

  useFrame((state, delta) => {
    const exam = useExamStore.getState();
    const sim = useSimulatorStore.getState();
    if (!exam.enabled || sim.cameraMode === 'overview') return;

    const speed = sim.speedKph;
    const r = run.current;
    camera.getWorldDirection(fwd.current);
    fwd.current.y = 0;
    fwd.current.normalize();

    let nearest: (typeof SIGNS)[number] | null = null;
    let nearestDist = Infinity;
    let stopInside: (typeof SIGNS)[number] | null = null;

    for (const s of SIGNS) {
      const d = Math.hypot(s.pos.x - camera.position.x, s.pos.z - camera.position.z);
      if (s.sign === 'AB4' && d < RULES.stopRadius) stopInside = s;
      if (d > RULES.detectRadius) continue;
      tmp.current.set(s.pos.x - camera.position.x, 0, s.pos.z - camera.position.z).normalize();
      const ahead = fwd.current.dot(tmp.current) > 0.3;
      if (ahead && d < nearestDist) {
        nearest = s;
        nearestDist = d;
      }
      // Limite de vitesse appliquée quand on passe le panneau
      if (s.sign === 'B14' && ahead && d < RULES.signPassRadius && r.passedId !== s.id) {
        r.passedId = s.id;
        exam.setLimit(s.speed ?? RULES.defaultLimit);
      }
    }

    // Carte "panneau en vue"
    const nearKey = nearest ? nearest.id : '';
    if (nearKey !== r.nearKey) {
      r.nearKey = nearKey;
      exam.setNearbySign(nearest ? { code: nearest.sign, speed: nearest.speed } : null);
    }

    // STOP : vitesse minimale dans la zone
    if (stopInside) {
      if (r.stopId !== stopInside.id) {
        r.stopId = stopInside.id;
        r.stopMin = speed;
      } else {
        r.stopMin = Math.min(r.stopMin, speed);
      }
    } else if (r.stopId) {
      if (r.stopMin > RULES.stopMaxSpeed) exam.addFault('stop', 'STOP non respecté : arrêt complet obligatoire');
      r.stopId = null;
    }

    // Excès de vitesse
    const limit = useExamStore.getState().currentLimit;
    if (speed > limit + RULES.speedTolerance) {
      r.over += delta;
      const now = state.clock.elapsedTime;
      if (r.over > RULES.speedGraceSeconds && now - r.lastSpeedFault > RULES.speedFaultCooldown) {
        r.lastSpeedFault = now;
        r.over = 0;
        exam.addFault('speed', `Excès de vitesse : ${Math.round(speed)} km/h pour ${limit} autorisés`);
      }
    } else {
      r.over = 0;
    }
  });

  // Mode éditeur : touche P = capture la position pour placer un panneau
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'p') return;
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      const dir = camera.getWorldDirection(new Vector3());
      dir.y = 0;
      dir.normalize();
      const p = camera.position.clone().addScaledVector(dir, 6);
      const ray = new Raycaster(new Vector3(p.x, camera.position.y, p.z), new Vector3(0, -1, 0), 0, 300);
      const hit = ray.intersectObjects(scene.children, true).find((h) => !isSignObject(h.object));
      const y = hit ? hit.point.y : 0;
      const rot = Math.atan2(-dir.x, -dir.z);
      const line = `{ id: 'sign-${Date.now() % 100000}', sign: 'B14', speed: 50, x: ${p.x.toFixed(2)}, y: ${y.toFixed(2)}, z: ${p.z.toFixed(2)}, rotationY: ${rot.toFixed(2)} },`;
      useExamStore.getState().setCapture(line);
      navigator.clipboard?.writeText(line).catch(() => undefined);
      console.log(line);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [camera, scene]);

  return null;
}

// ===== components/ExamHud.tsx =====
const card: React.CSSProperties = {
  background: 'rgba(12,18,24,0.82)',
  color: '#fff',
  borderRadius: 14,
  padding: '10px 14px',
  fontFamily: 'system-ui, sans-serif',
  backdropFilter: 'blur(6px)',
};

export function ExamHud() {
  const { enabled, score, faults, currentLimit, nearbySign, toast, capture, reportVisible } = useExamStore();
  const { toggleEnabled, toggleReport, clearToast, reset } = useExamStore.getState();
  const speed = useSimulatorStore((s) => s.speedKph);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(clearToast, 5000);
    return () => window.clearTimeout(t);
  }, [toast, clearToast]);

  const over = speed > currentLimit + RULES.speedTolerance;
  const sign = nearbySign ? SIGN_DEFS[nearbySign.code] : null;
  const passed = score >= RULES.passScore;

  return (
    <div style={{ position: 'fixed', left: 12, top: 84, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 300, pointerEvents: 'none' }}>
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, pointerEvents: 'auto' }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: '50%', background: '#fff',
            border: `6px solid ${over ? '#ff2d2d' : '#d6181f'}`, color: '#111',
            display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 22,
          }}
          title="Vitesse maximale autorisée"
        >
          {currentLimit}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Mode auto-école</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: passed ? '#5be08a' : '#ff6b6b' }}>
            {score}/{RULES.startScore}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button type="button" onClick={toggleReport} style={{ fontSize: 12 }}>Bilan</button>
          <button type="button" onClick={toggleEnabled} style={{ fontSize: 12 }}>{enabled ? 'Pause' : 'Reprendre'}</button>
        </div>
      </div>

      {toast ? (
        <div style={{ ...card, background: 'rgba(190,30,30,0.92)', fontSize: 14 }}>⚠ {toast}</div>
      ) : null}

      {sign ? (
        <div style={{ ...card, fontSize: 13, lineHeight: 1.4 }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>{sign.category} · {sign.code}</div>
          <strong>
            {sign.name}
            {nearbySign?.speed ? ` ${nearbySign.speed} km/h` : ''}
          </strong>
          <div style={{ marginTop: 4 }}>{sign.meaning}</div>
        </div>
      ) : null}

      {reportVisible ? (
        <div style={{ ...card, fontSize: 13, pointerEvents: 'auto' }}>
          <strong>
            Bilan : {score}/{RULES.startScore} — {passed ? 'Réussi' : 'Échec'}
          </strong>
          {faults.length === 0 ? <div style={{ marginTop: 4 }}>Aucune faute 👍</div> : null}
          <ul style={{ margin: '6px 0 8px 16px', padding: 0 }}>
            {faults.map((f) => (
              <li key={f.id}>{f.message} (-{f.points})</li>
            ))}
          </ul>
          <button type="button" onClick={reset} style={{ fontSize: 12 }}>Nouvel examen</button>
        </div>
      ) : null}

      {capture ? (
        <div style={{ ...card, fontSize: 11, wordBreak: 'break-all', pointerEvents: 'auto' }}>
          <div style={{ opacity: 0.7 }}>Position copiée (touche P) :</div>
          <code>{capture}</code>
        </div>
      ) : null}
    </div>
  );
}

