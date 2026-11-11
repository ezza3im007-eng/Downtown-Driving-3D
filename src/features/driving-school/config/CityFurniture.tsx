import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, InstancedMesh, MeshBasicMaterial, Object3D, Vector3 } from 'three';
import { CROSSWALKS, TRAFFIC_LIGHTS } from '../config/generatedPlacements';
import { useSimulatorStore } from '../../simulator/state/simulator.store';
import { useExamStore } from '../DrivingSchool';

const GREEN = 8;
const YELLOW = 2;
const CYCLE = 20; // 2 groupes en opposition de phase
export type LightColor = 'green' | 'yellow' | 'red';

export function lightColor(group: number, t: number): LightColor {
  const p = (t + (group ? CYCLE / 2 : 0)) % CYCLE;
  return p < GREEN ? 'green' : p < GREEN + YELLOW ? 'yellow' : 'red';
}

const ON: Record<LightColor, string> = { red: '#ff2a2a', yellow: '#ffc21a', green: '#2dff6a' };
const OFF = '#1a1a1a';

/** Passages piétons : bandes blanches instanciées sur chaque branche de carrefour. */
export function Crosswalks() {
  const ref = useRef<InstancedMesh>(null);
  const STRIPES = 9;
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    let i = 0;
    for (const c of CROSSWALKS) {
      const ux = Math.sin(c.rot);
      const uz = Math.cos(c.rot);
      for (let s = 0; s < STRIPES; s++) {
        const lateral = ((s + 0.5) / STRIPES - 0.5) * c.w * 0.9;
        o.position.set(c.x + uz * lateral, c.y + 0.06, c.z - ux * lateral);
        o.rotation.set(-Math.PI / 2, 0, -c.rot);
        o.scale.set(0.9, 3, 1);
        o.updateMatrix();
        mesh.setMatrixAt(i++, o.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, CROSSWALKS.length * STRIPES]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#f2f2f2" polygonOffset polygonOffsetFactor={-2} />
    </instancedMesh>
  );
}

function LightHead({ x, y, z, rot, group }: { x: number; y: number; z: number; rot: number; group: number }) {
  const mats = useRef<Record<LightColor, MeshBasicMaterial | null>>({ red: null, yellow: null, green: null });
  const last = useRef<LightColor | ''>('');
  useFrame((s) => {
    const c = lightColor(group, s.clock.elapsedTime);
    if (c === last.current) return;
    last.current = c;
    (Object.keys(mats.current) as LightColor[]).forEach((k) => mats.current[k]?.color.set(k === c ? ON[k] : OFF));
  });
  const lamp = (k: LightColor, py: number) => (
    <mesh position={[0, py, 0.2]}>
      <circleGeometry args={[0.16, 16]} />
      <meshBasicMaterial
        ref={(m) => {
          mats.current[k] = m;
        }}
        color={new Color(OFF)}
        toneMapped={false}
      />
    </mesh>
  );
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 2.1, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 4.2, 8]} />
        <meshStandardMaterial color="#2b2f33" />
      </mesh>
      <mesh position={[0, 4.0, 0]}>
        <boxGeometry args={[0.5, 1.3, 0.35]} />
        <meshStandardMaterial color="#15181b" />
      </mesh>
      <group position={[0, 4.0, 0]}>
        {lamp('red', 0.4)}
        {lamp('yellow', 0)}
        {lamp('green', -0.4)}
      </group>
    </group>
  );
}

export function TrafficLights() {
  return (
    <group name="traffic-lights">
      {TRAFFIC_LIGHTS.flatMap((l) => l.arms.map((a, i) => <LightHead key={`${l.id}-${i}`} {...a} />))}
    </group>
  );
}

/** Sans rendu : faute « feu rouge » quand on franchit la ligne d'arrêt au rouge. */
export function RedLightTracker() {
  const { camera } = useThree();
  const fwd = useRef(new Vector3());
  const cooldown = useRef<Record<string, number>>({});
  useFrame((state) => {
    const exam = useExamStore.getState();
    const sim = useSimulatorStore.getState();
    if (!exam.enabled || sim.cameraMode === 'overview' || sim.speedKph < 8) return;
    camera.getWorldDirection(fwd.current);
    fwd.current.y = 0;
    fwd.current.normalize();
    const t = state.clock.elapsedTime;
    for (const l of TRAFFIC_LIGHTS) {
      if (Math.hypot(l.x - camera.position.x, l.z - camera.position.z) > 40) continue;
      l.arms.forEach((a, i) => {
        const d = Math.hypot(a.stopX - camera.position.x, a.stopZ - camera.position.z);
        if (d > 3.5) return;
        // le conducteur roule vers le centre, soit dans le sens opposé à la normale du feu
        if (fwd.current.x * -Math.sin(a.rot) + fwd.current.z * -Math.cos(a.rot) < 0.5) return;
        if (lightColor(a.group, t) !== 'red') return;
        const key = `${l.id}-${i}`;
        if (t - (cooldown.current[key] ?? -999) < 15) return;
        cooldown.current[key] = t;
        exam.addFault('light', 'Feu rouge non respecté');
      });
    }
  });
  return null;
}
