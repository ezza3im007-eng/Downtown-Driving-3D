const withBase = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const vehicleAssetModules = import.meta.glob(
  [
    '../../../Assets/car/*.glb',
    '!../../../Assets/car/honda_rc181*.glb',
    '!../../../Assets/car/jeep_wrangler*.glb',
  ],
  {
    eager: true,
    import: 'default',
  },
) as Record<string, string>;

const EXCLUDED_VEHICLE_IDS = new Set([
  'honda-rc181-hailwood-1966-www-vecarz-com',
  'jeep-gladiator',
]);

export interface VehicleOption {
  assetPath: string;
  id: string;
  label: string;
}

function toVehicleId(fileName: string) {
  return fileName
    .replace(/\.glb$/i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function toVehicleLabel(fileName: string) {
  return fileName
    .replace(/\.glb$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function compareVehicleOptions(a: VehicleOption, b: VehicleOption) {
  if (a.id === 'free-porsche-911-carrera-4s') {
    return -1;
  }

  if (b.id === 'free-porsche-911-carrera-4s') {
    return 1;
  }

  return a.label.localeCompare(b.label);
}

export const VEHICLE_OPTIONS = Object.entries(vehicleAssetModules)
  .map(([modulePath, assetPath]) => {
    const fileName = modulePath.split('/').pop() ?? modulePath;
    const id = toVehicleId(fileName);

    return {
      assetPath,
      id,
      label: toVehicleLabel(fileName),
    };
  })
  .filter((vehicle) => !EXCLUDED_VEHICLE_IDS.has(vehicle.id))
  .sort(compareVehicleOptions);

export const DEFAULT_VEHICLE_ID =
  VEHICLE_OPTIONS.find((vehicle) => vehicle.id === 'free-porsche-911-carrera-4s')?.id ??
  VEHICLE_OPTIONS[0]?.id ??
  'default-vehicle';

export const ASSET_PATHS = {
  audio: {
    brake: withBase('assets/audio/_A_sudden_hard_car_brake_.mp3'),
    city: withBase('assets/audio/city-sounds.mp3'),
    crash: withBase('assets/audio/car-crash-sound.mp3'),
    drift: withBase('assets/audio/drift.mp3'),
    horn: withBase('assets/audio/double-car-horn.mp3'),
    loading: withBase('assets/audio/loading.mp3'),
    reverseBeep: withBase('assets/audio/drive-in-reverse-beep-alert-54774.mp3'),
  },
  map: withBase('assets/map/nfs_undercover_ds_-_metropolis.glb'),
} as const;

export function getVehicleOptionById(vehicleId: string) {
  return VEHICLE_OPTIONS.find((vehicle) => vehicle.id === vehicleId) ?? VEHICLE_OPTIONS[0] ?? null;
}
