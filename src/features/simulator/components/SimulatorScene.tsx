import { Suspense, useRef } from 'react';
import { Color, Group } from 'three';
import { Sky } from '@react-three/drei';
import { CityMap } from '../../../entities/environment/CityMap';
import { PlayerVehicle } from './PlayerVehicle';
import { SIMULATOR_CONFIG } from '../config/simulator.config';

export function SimulatorScene() {
  const terrainRef = useRef<Group>(null);

  return (
    <>
      <color attach="background" args={[SIMULATOR_CONFIG.world.background]} />
      <fog
        attach="fog"
        args={[
          new Color(SIMULATOR_CONFIG.world.fogColor),
          SIMULATOR_CONFIG.world.fogNear,
          SIMULATOR_CONFIG.world.fogFar,
        ]}
      />
      <ambientLight intensity={0.75} />
      <hemisphereLight args={['#f4fbff', '#6a7f86', 1.1]} />
      <directionalLight
        castShadow
        intensity={2.1}
        position={[18, 26, 12]}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
        shadow-camera-far={80}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />
      <Sky distance={450000} sunPosition={[50, 12, 10]} inclination={0.48} azimuth={0.2} />
      <Suspense fallback={null}>
        <CityMap ref={terrainRef} />
        <PlayerVehicle terrainRef={terrainRef} />
<SignsLayer />
<ExamTracker />
      </Suspense>
    </>
  );
}
   import { SignsLayer, ExamTracker } from '../../driving-school/DrivingSchool';
