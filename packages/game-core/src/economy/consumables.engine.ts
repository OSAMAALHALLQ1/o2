import {
  RawCareState,
  EffectiveCareState,
  calculateEffectiveCareState,
  clamp,
} from '../companion/simulation.engine';
import { DEFAULT_COMPANION_TUNING_CONFIG, CompanionTuningConfig } from '../companion/tuning.config';

export interface ConsumableItemEffect {
  hungerDelta?: number | null;
  cleanlinessDelta?: number | null;
  energyDelta?: number | null;
  moodDelta?: number | null;
  reactionKey?: string | null;
}

export interface ApplyConsumableResult {
  updatedState: RawCareState;
  effectiveState: EffectiveCareState;
  reactionKey: string;
}

export function applyConsumableItem(
  rawState: RawCareState,
  effect: ConsumableItemEffect,
  currentTimeMs: number,
  config: CompanionTuningConfig = DEFAULT_COMPANION_TUNING_CONFIG,
): ApplyConsumableResult {
  // Step 1: Simulate time elapsed up to currentTimeMs using authoritative simulation
  const effectiveAtCurrentTime = calculateEffectiveCareState(rawState, currentTimeMs, config);

  // Step 2: Apply consumable effect deltas
  const hungerDelta = effect.hungerDelta ?? 0;
  const cleanlinessDelta = effect.cleanlinessDelta ?? 0;
  const energyDelta = effect.energyDelta ?? 0;
  const moodDelta = effect.moodDelta ?? 0;

  const minEnergyFloor = effectiveAtCurrentTime.isSleeping ? 0.0 : config.passiveDecayFloor;

  const newHunger = clamp(effectiveAtCurrentTime.hunger + hungerDelta, 0.0, 100.0);
  const newCleanliness = clamp(effectiveAtCurrentTime.cleanliness + cleanlinessDelta, 0.0, 100.0);
  const newEnergy = clamp(effectiveAtCurrentTime.energy + energyDelta, minEnergyFloor, 100.0);
  const newMood = clamp(effectiveAtCurrentTime.mood + moodDelta, 0.0, 100.0);

  const updatedRaw: RawCareState = {
    hunger: Number(newHunger.toFixed(2)),
    cleanliness: Number(newCleanliness.toFixed(2)),
    energy: Number(newEnergy.toFixed(2)),
    mood: Number(newMood.toFixed(2)),
    isSleeping: effectiveAtCurrentTime.isSleeping,
    sleepStartedAt: effectiveAtCurrentTime.sleepStartedAt,
    lastSimulatedAt: new Date(currentTimeMs).toISOString(),
    lastInteractionAt: new Date(currentTimeMs).toISOString(),
  };

  // Compute final effective state
  const finalEffective = calculateEffectiveCareState(updatedRaw, currentTimeMs, config);

  return {
    updatedState: updatedRaw,
    effectiveState: finalEffective,
    reactionKey: effect.reactionKey || 'DELICIOUS_TREAT',
  };
}
