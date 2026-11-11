import { useEffect, useRef, useState } from 'react';
import { CAMERA_MODES } from '../config/simulator.config';
import { useSimulatorStore } from '../state/simulator.store';
import { GarageVehiclePreview } from './GarageVehiclePreview';
import { MiniMap } from './MiniMap';
import { VehicleCardPreview } from './VehicleCardPreview';
import { VEHICLE_OPTIONS } from '../../../shared/config/assets';
import { DowntownDrivingLogo } from '../../../shared/components/DowntownDrivingLogo';
import { ExamHud } from '../../driving-school/DrivingSchool';
interface DialGaugeProps {
  accent: string;
  label: string;
  max: number;
  suffix: string;
  value: number;
  variant?: 'compact' | 'cluster';
}

type SettingsTabId = 'audio' | 'controls' | 'display' | 'garage' | 'preferences';

interface SettingsTab {
  description: string;
  id: SettingsTabId;
  label: string;
}

interface SliderControlProps {
  channel: Parameters<ReturnType<typeof useSimulatorStore.getState>['setAudioChannel']>[0];
  label: string;
  value: number;
}

interface ToggleRowProps {
  description: string;
  label: string;
  onClick: () => void;
  value: boolean;
}

interface VehicleStat {
  label: string;
  value: number;
}

interface PauseActionProps {
  icon: JSX.Element;
  label: string;
  onClick: () => void;
}

const PAINT_SWATCHES = ['#1b6fff', '#d8383f', '#ff8a2a', '#ffd34d', '#2cb67d', '#f4f7fb', '#1f1f24'];

const SETTINGS_TABS: SettingsTab[] = [
  { id: 'garage', label: 'Garage', description: 'Vehicle and paint setup' },
  { id: 'display', label: 'Display Settings', description: 'Camera and HUD layout' },
  { id: 'audio', label: 'Audio', description: 'Engine, city, and effects mix' },
  { id: 'controls', label: 'Control Bindings', description: 'Driving shortcuts and help' },
  { id: 'preferences', label: 'Preferences', description: 'Quick HUD presets and status' },
];

const TRANSITION_DELAY_MS = 850;

function DialGauge({ accent, label, max, suffix, value, variant = 'compact' }: DialGaugeProps) {
  const clamped = Math.max(0, Math.min(value, max));
  const rotation = -130 + (clamped / max) * 260;

  return (
    <div className={`dial-gauge${variant === 'cluster' ? ' dial-gauge--cluster' : ' panel'}`}>
      <div className="dial-gauge__face" style={{ ['--dial-accent' as string]: accent }}>
        <div className="dial-gauge__arc" />
        <div className="dial-gauge__ticks" />
        <div className="dial-gauge__needle-wrap" style={{ transform: `rotate(${rotation}deg)` }}>
          <div className="dial-gauge__needle" />
        </div>
        <div className="dial-gauge__hub" />
        <div className="dial-gauge__readout">
          <span>{label}</span>
          <strong>{Math.round(clamped)}</strong>
          <em>{suffix}</em>
        </div>
      </div>
    </div>
  );
}

function SliderControl({ channel, label, value }: SliderControlProps) {
  const setAudioChannel = useSimulatorStore((state) => state.setAudioChannel);

  return (
    <label className="settings-panel__slider">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(event) => setAudioChannel(channel, Number(event.target.value) / 100)}
      />
      <strong>{Math.round(value * 100)}%</strong>
    </label>
  );
}

function ToggleRow({ description, label, onClick, value }: ToggleRowProps) {
  return (
    <div className="settings-panel__toggle-row">
      <div>
        <span>{label}</span>
        <small>{description}</small>
      </div>
      <button type="button" className={`settings-panel__switch${value ? ' is-active' : ''}`} onClick={onClick}>
        {value ? 'On' : 'Off'}
      </button>
    </div>
  );
}

function PauseAction({ icon, label, onClick }: PauseActionProps) {
  return (
    <button type="button" className="pause-panel__action" onClick={onClick}>
      <span className="pause-panel__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="pause-panel__label">{label}</span>
    </button>
  );
}

function cameraModeLabel(mode: (typeof CAMERA_MODES)[number]) {
  switch (mode) {
    case 'chase':
      return 'Chase';
    case 'bonnet':
      return 'Bonnet';
    case 'driver':
      return 'Driver Seat';
    case 'dickey':
      return 'Rear';
    case 'overview':
      return 'Overview';
    default:
      return mode;
  }
}

function createVehicleStats(vehicleId: string): VehicleStat[] {
  const seed = vehicleId.split('').reduce((total, character) => total + character.charCodeAt(0), 0);
  const statValue = (offset: number, base: number, spread: number) => base + ((seed + offset) % spread);

  return [
    { label: 'Speed', value: statValue(3, 68, 24) },
    { label: 'Drifting', value: statValue(9, 56, 28) },
    { label: 'Grip', value: statValue(15, 60, 22) },
    { label: 'Engine', value: statValue(21, 64, 26) },
  ];
}

export function HudOverlay() {
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabId>('garage');
  const transitionTimeoutRef = useRef<number | null>(null);

  const speedKph = useSimulatorStore((state) => state.speedKph);
  const rpm = useSimulatorStore((state) => state.rpm);
  const gear = useSimulatorStore((state) => state.gear);
  const debugBlocked = useSimulatorStore((state) => state.debugBlocked);
  const instructionsVisible = useSimulatorStore((state) => state.instructionsVisible);
  const pauseMenuVisible = useSimulatorStore((state) => state.pauseMenuVisible);
  const requestRestart = useSimulatorStore((state) => state.requestRestart);
  const toggleInstructions = useSimulatorStore((state) => state.toggleInstructions);
  const setInstructionsVisible = useSimulatorStore((state) => state.setInstructionsVisible);
  const setPauseMenuVisible = useSimulatorStore((state) => state.setPauseMenuVisible);
  const settingsVisible = useSimulatorStore((state) => state.settingsVisible);
  const setSettingsVisible = useSimulatorStore((state) => state.setSettingsVisible);
  const masterVolume = useSimulatorStore((state) => state.masterVolume);
  const engineVolume = useSimulatorStore((state) => state.engineVolume);
  const effectsVolume = useSimulatorStore((state) => state.effectsVolume);
  const ambienceVolume = useSimulatorStore((state) => state.ambienceVolume);
  const selectedVehicleId = useSimulatorStore((state) => state.selectedVehicleId);
  const setSelectedVehicleId = useSimulatorStore((state) => state.setSelectedVehicleId);
  const setTransitionLoadingLabel = useSimulatorStore((state) => state.setTransitionLoadingLabel);
  const setTransitionLoadingVisible = useSimulatorStore((state) => state.setTransitionLoadingVisible);
  const transitionLoadingVisible = useSimulatorStore((state) => state.transitionLoadingVisible);
  const vehicleColor = useSimulatorStore((state) => state.vehicleColor);
  const setVehicleColor = useSimulatorStore((state) => state.setVehicleColor);
  const cameraMode = useSimulatorStore((state) => state.cameraMode);
  const setCameraMode = useSimulatorStore((state) => state.setCameraMode);
  const miniMapVisible = useSimulatorStore((state) => state.miniMapVisible);
  const setMiniMapVisible = useSimulatorStore((state) => state.setMiniMapVisible);
  const dashboardVisible = useSimulatorStore((state) => state.dashboardVisible);
  const setDashboardVisible = useSimulatorStore((state) => state.setDashboardVisible);
  const activeVehicle = VEHICLE_OPTIONS.find((vehicle) => vehicle.id === selectedVehicleId) ?? VEHICLE_OPTIONS[0];
  const vehicleStats = createVehicleStats(activeVehicle.id);

  useEffect(() => {
    if (!settingsVisible && !pauseMenuVisible) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (settingsVisible) {
          setSettingsVisible(false);
          return;
        }

        setPauseMenuVisible(false);
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [pauseMenuVisible, setPauseMenuVisible, setSettingsVisible, settingsVisible]);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current != null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  const applyHudPreset = (preset: 'balanced' | 'minimal' | 'training') => {
    if (preset === 'minimal') {
      setMiniMapVisible(false);
      setDashboardVisible(true);
      setInstructionsVisible(false);
      return;
    }

    if (preset === 'training') {
      setMiniMapVisible(true);
      setDashboardVisible(true);
      setInstructionsVisible(true);
      return;
    }

    setMiniMapVisible(true);
    setDashboardVisible(true);
    setInstructionsVisible(false);
  };

  const activeTabMeta = SETTINGS_TABS.find((tab) => tab.id === activeSettingsTab) ?? SETTINGS_TABS[0];
  const runTimedScreenTransition = (label: string, action: () => void) => {
    if (transitionTimeoutRef.current != null) {
      window.clearTimeout(transitionTimeoutRef.current);
    }

    setPauseMenuVisible(false);
    setSettingsVisible(false);
    setTransitionLoadingLabel(label);
    setTransitionLoadingVisible(true);

    transitionTimeoutRef.current = window.setTimeout(() => {
      action();
      setTransitionLoadingVisible(false);
      transitionTimeoutRef.current = null;
    }, TRANSITION_DELAY_MS);
  };

  const openSettings = () => {
    if (transitionLoadingVisible) {
      return;
    }

    runTimedScreenTransition('Opening simulator menu', () => {
      setSettingsVisible(true);
    });
  };

  const togglePauseMenu = () => {
    if (transitionLoadingVisible) {
      return;
    }

    if (settingsVisible) {
      setSettingsVisible(false);
    }

    setPauseMenuVisible(!pauseMenuVisible);
  };

  const handleRestart = () => {
    if (transitionLoadingVisible) {
      return;
    }

    if (transitionTimeoutRef.current != null) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    setPauseMenuVisible(false);
    setSettingsVisible(false);
    setTransitionLoadingLabel('Resetting drive session');
    setTransitionLoadingVisible(true);
    requestRestart();
  };

  let settingsContent: JSX.Element;

  switch (activeSettingsTab) {
    case 'audio':
      settingsContent = (
        <div className="settings-panel__content-stack">
          <section className="settings-panel__section">
            <div className="settings-panel__section-title">
              <span>Sound mix</span>
              <strong>{Math.round(masterVolume * 100)}% master</strong>
            </div>
            <SliderControl channel="masterVolume" label="Master" value={masterVolume} />
            <SliderControl channel="engineVolume" label="Engine" value={engineVolume} />
            <SliderControl channel="effectsVolume" label="Effects" value={effectsVolume} />
            <SliderControl channel="ambienceVolume" label="City" value={ambienceVolume} />
          </section>
        </div>
      );
      break;
    case 'garage':
      settingsContent = (
        <div className="settings-panel__content-stack">
          <section className="settings-panel__section settings-panel__section--garage">
            <div className="garage-panel">
              <div className="garage-panel__hero">
                <div className="garage-panel__stage">
                  <div className="garage-panel__stage-copy">
                    <span className="garage-panel__label">Selected vehicle</span>
                    <h3>{activeVehicle.label}</h3>
                    <p>Choose a car from the lineup below, then tune the paint before you drive.</p>
                  </div>
                  <div className="garage-panel__display">
                    <div className="garage-panel__preview-glow" />
                    <div className="garage-panel__preview-frame">
                      <GarageVehiclePreview />
                    </div>
                  </div>
                </div>

                <div className="garage-panel__sidebar">
                  <div className="garage-panel__stats">
                    {vehicleStats.map((stat) => (
                      <div key={stat.label} className="garage-panel__stat">
                        <div className="garage-panel__stat-head">
                          <span>{stat.label}</span>
                          <strong>{stat.value}</strong>
                        </div>
                        <div className="garage-panel__stat-track">
                          <div className="garage-panel__stat-fill" style={{ width: `${stat.value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="garage-panel__actions">
                    <button
                      type="button"
                      className="garage-panel__select"
                      onClick={() => setSelectedVehicleId(activeVehicle.id)}
                    >
                      Select Car
                    </button>
                    <div className="garage-panel__color-tools">
                      <label className="settings-panel__field">
                        <span>Paint colour</span>
                        <div className="settings-panel__color-row">
                          <input
                            type="color"
                            value={vehicleColor}
                            onChange={(event) => setVehicleColor(event.target.value)}
                            aria-label="Vehicle paint colour"
                          />
                          <span>{vehicleColor.toUpperCase()}</span>
                        </div>
                      </label>

                      <div className="settings-panel__swatches">
                        {PAINT_SWATCHES.map((paint) => (
                          <button
                            key={paint}
                            type="button"
                            className={`settings-panel__swatch${vehicleColor === paint ? ' is-active' : ''}`}
                            style={{ backgroundColor: paint }}
                            onClick={() => setVehicleColor(paint)}
                            aria-label={`Set paint to ${paint}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="garage-panel__selector">
                {VEHICLE_OPTIONS.map((vehicle) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    className={`garage-panel__card${vehicle.id === activeVehicle.id ? ' is-active' : ''}`}
                    onClick={() => setSelectedVehicleId(vehicle.id)}
                    aria-label={vehicle.label}
                    title={vehicle.label}
                  >
                    <div className="garage-panel__card-art">
                      <VehicleCardPreview
                        paintColor={vehicle.id === activeVehicle.id ? vehicleColor : '#f4f7fb'}
                        vehicleId={vehicle.id}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      );
      break;
    case 'controls':
      settingsContent = (
        <div className="settings-panel__content-stack">
          <section className="settings-panel__section">
            <div className="settings-panel__section-title">
              <span>Driving help</span>
              <strong>{instructionsVisible ? 'Guide visible' : 'Guide hidden'}</strong>
            </div>
            <button type="button" className="settings-panel__action" onClick={toggleInstructions}>
              <span>Controls guide</span>
              <strong>{instructionsVisible ? 'Hide' : 'Show'}</strong>
            </button>
          </section>

          <section className="settings-panel__section">
            <div className="settings-panel__section-title">
              <span>Bindings</span>
              <strong>Keyboard</strong>
            </div>
            <ul className="settings-panel__bindings">
              <li>
                <span>Throttle</span>
                <strong>W or Arrow Up</strong>
              </li>
              <li>
                <span>Steer</span>
                <strong>A/D or Arrow Left/Right</strong>
              </li>
              <li>
                <span>Brake</span>
                <strong>Space or S / Arrow Down</strong>
              </li>
              <li>
                <span>Transmission</span>
                <strong>Automatic 6-speed</strong>
              </li>
              <li>
                <span>Horn</span>
                <strong>F</strong>
              </li>
              <li>
                <span>Cycle camera</span>
                <strong>C</strong>
              </li>
              <li>
                <span>Reset car</span>
                <strong>R</strong>
              </li>
            </ul>
          </section>
        </div>
      );
      break;
    case 'preferences':
      settingsContent = (
        <div className="settings-panel__content-stack">
          <section className="settings-panel__section">
            <div className="settings-panel__section-title">
              <span>HUD presets</span>
              <strong>Quick layouts</strong>
            </div>
            <div className="settings-panel__preset-grid">
              <button type="button" className="settings-panel__preset" onClick={() => applyHudPreset('minimal')}>
                <span>Minimal</span>
                <small>Road view with fewer overlays</small>
              </button>
              <button type="button" className="settings-panel__preset" onClick={() => applyHudPreset('balanced')}>
                <span>Balanced</span>
                <small>Map and gauges visible</small>
              </button>
              <button type="button" className="settings-panel__preset" onClick={() => applyHudPreset('training')}>
                <span>Training</span>
                <small>Everything visible for new players</small>
              </button>
            </div>
          </section>

          <section className="settings-panel__section">
            <div className="settings-panel__section-title">
              <span>Drive status</span>
              <strong>{debugBlocked ? 'Obstacle nearby' : 'Free drive'}</strong>
            </div>
            <div className="settings-panel__status-grid">
              <div className="settings-panel__status-card">
                <span>Speed</span>
                <strong>{speedKph} km/h</strong>
              </div>
              <div className="settings-panel__status-card">
                <span>Gear</span>
                <strong>{gear}</strong>
              </div>
              <div className="settings-panel__status-card">
                <span>RPM</span>
                <strong>{Math.round(rpm)}</strong>
              </div>
            </div>
          </section>
        </div>
      );
      break;
    case 'display':
    default:
      settingsContent = (
        <div className="settings-panel__content-stack">
          <section className="settings-panel__section">
            <div className="settings-panel__section-title">
              <span>View layout</span>
              <strong>{cameraModeLabel(cameraMode)}</strong>
            </div>
            <label className="settings-panel__field">
              <span>Camera view</span>
              <select
                value={cameraMode}
                onChange={(event) => setCameraMode(event.target.value as (typeof CAMERA_MODES)[number])}
              >
                {CAMERA_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {cameraModeLabel(mode)}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="settings-panel__section">
            <div className="settings-panel__section-title">
              <span>HUD modules</span>
              <strong>Live</strong>
            </div>
            <ToggleRow
              label="Route map"
              description="Shows the mini map in the lower left corner."
              value={miniMapVisible}
              onClick={() => setMiniMapVisible(!miniMapVisible)}
            />
            <ToggleRow
              label="Dashboard cluster"
              description="Shows speed, gear, and RPM gauges."
              value={dashboardVisible}
              onClick={() => setDashboardVisible(!dashboardVisible)}
            />
          </section>
        </div>
      );
      break;
  }

  return (
    <div className="hud">
     <ExamHud /> 
      <div className="hud__header">
        <div className="hud__brand">
          <DowntownDrivingLogo variant="hud" />
        </div>

        <div className="hud__top-actions">
          <div className="hud__action-row">
            <button
              type="button"
              className={`hud__pause-toggle panel${pauseMenuVisible ? ' is-active' : ''}`}
              onClick={togglePauseMenu}
              aria-expanded={pauseMenuVisible}
              aria-label={pauseMenuVisible ? 'Close pause menu' : 'Open pause menu'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 13 18.5v-13Z" />
              </svg>
            </button>

            {pauseMenuVisible ? (
              <div className="pause-panel panel">
                <div className="pause-panel__header">
                  <p className="eyebrow">Game Paused</p>
                  <strong>Session Menu</strong>
                </div>

                <div className="pause-panel__grid">
                  <PauseAction
                    label="Continue"
                    onClick={() => setPauseMenuVisible(false)}
                    icon={
                      <svg viewBox="0 0 24 24">
                        <path d="M8 6.5c0-1.2 1.32-1.93 2.34-1.3l7.22 4.5a1.53 1.53 0 0 1 0 2.6l-7.22 4.5A1.53 1.53 0 0 1 8 15.5v-9Z" />
                      </svg>
                    }
                  />
                  <PauseAction
                    label="Restart"
                    onClick={handleRestart}
                    icon={
                      <svg viewBox="0 0 24 24">
                        <path d="M12 5a7 7 0 1 1-6.56 9.44 1 1 0 1 1 1.87-.7A5 5 0 1 0 8 8.1V11a1 1 0 0 1-1.7.7l-3-3a1 1 0 0 1 0-1.4l3-3A1 1 0 0 1 8 5v1.1A8.94 8.94 0 0 1 12 5Z" />
                      </svg>
                    }
                  />
                  <PauseAction
                    label="Settings"
                    onClick={openSettings}
                    icon={
                      <svg viewBox="0 0 24 24">
                        <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.06 7.06 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.22-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.22 1.13-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.2A3.2 3.2 0 1 1 12 8.8a3.2 3.2 0 0 1 0 6.4Z" />
                      </svg>
                    }
                  />
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className={`hud__settings-toggle panel${settingsVisible ? ' is-active' : ''}`}
            onClick={() => {
              if (transitionLoadingVisible) {
                return;
              }

              if (settingsVisible) {
                setSettingsVisible(false);
                return;
              }

              openSettings();
            }}
            aria-expanded={settingsVisible}
            aria-label={settingsVisible ? 'Close settings' : 'Open settings'}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.06 7.06 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.22-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.22 1.13-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.2A3.2 3.2 0 1 1 12 8.8a3.2 3.2 0 0 1 0 6.4Z" />
            </svg>
          </button>

          {settingsVisible ? (
            <div className="hud__settings panel">
              <div className="settings-panel__shell">
                <aside className="settings-panel__menu">
                  <div className="settings-panel__menu-header">
                    <p className="eyebrow">Simulator Menu</p>
                  </div>

                  <nav className="settings-panel__nav" aria-label="Settings sections">
                    {SETTINGS_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`settings-panel__nav-item${activeSettingsTab === tab.id ? ' is-active' : ''}`}
                        onClick={() => setActiveSettingsTab(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                </aside>

                <section className="settings-panel__body">
                  <div className="settings-panel__heading">
                    <div>
                      <p className="eyebrow">Garage Settings</p>
                      <h2>{activeTabMeta.label}</h2>
                      <span className="settings-panel__description">{activeTabMeta.description}</span>
                    </div>
                    <button type="button" className="settings-panel__close" onClick={() => setSettingsVisible(false)}>
                      Close
                    </button>
                  </div>

                  {settingsContent}
                </section>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="hud__lower">
        <div className="hud__map-stack">
          {miniMapVisible ? <MiniMap /> : null}

          {dashboardVisible ? (
            <div className="hud__mini-cluster">
              <div className="dashboard-cluster panel">
                <DialGauge
                  accent="#3f89ff"
                  label="Speed"
                  max={220}
                  suffix="km/h"
                  value={speedKph}
                  variant="cluster"
                />
                <div className="dashboard-cluster__center">
                  <span className="dashboard-cluster__gear-label">Gear</span>
                  <strong className="dashboard-cluster__gear-value">{gear}</strong>
                </div>
                <DialGauge
                  accent="#5f8cff"
                  label="RPM"
                  max={8}
                  suffix="x1000"
                  value={rpm / 1000}
                  variant="cluster"
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="hud__controls-stack">
          <button
            type="button"
            className={`hud__controls-toggle panel${instructionsVisible ? ' is-active' : ''}`}
            onClick={toggleInstructions}
            aria-expanded={instructionsVisible}
            aria-label={instructionsVisible ? 'Hide controls' : 'Show controls'}
          >
            <span className="hud__controls-toggle-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="hud__controls-toggle-label">Controls</span>
          </button>

          {instructionsVisible ? (
            <div className="hud__controls panel">
              <div className="hud__controls-heading">
                <p className="eyebrow">Controls</p>
                <span>{debugBlocked ? 'Obstacle detected' : 'Free drive'}</span>
              </div>
              <ul>
              <li>
                <span>Throttle</span>
                <strong>W or Arrow Up</strong>
              </li>
              <li>
                <span>Steer</span>
                <strong>A/D or Arrow Left/Right</strong>
              </li>
              <li>
                <span>Brake</span>
                <strong>Space or S / Arrow Down</strong>
              </li>
              <li>
                <span>Transmission</span>
                <strong>Automatic 6-speed</strong>
              </li>
              <li>
                <span>Horn</span>
                <strong>F</strong>
              </li>
                <li>
                  <span>Cycle camera</span>
                  <strong>C</strong>
                </li>
                <li>
                  <span>Reset car</span>
                  <strong>R</strong>
                </li>
                <li>
                  <span>Toggle controls</span>
                  <strong>H or Button</strong>
                </li>
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
