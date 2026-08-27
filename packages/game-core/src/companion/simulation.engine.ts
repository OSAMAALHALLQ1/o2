import type {
  CompanionCareActionType,
  CompanionExpression,
  CompanionReaction,
  CompanionStatDeltas,
} from '@o2/types';
import {
  CompanionTuningConfig,
  DEFAULT_COMPANION_TUNING_CONFIG,
} from './tuning.config';

export interface RawCareState {
  hunger: number;
  cleanliness: number;
  energy: number;
  mood: number;
  isSleeping: boolean;
  sleepStartedAt: Date | string | null;
  lastSimulatedAt: Date | string;
  lastInteractionAt: Date | string;
}

export interface EffectiveCareState extends RawCareState {
  expression: CompanionExpression;
}

/**
 * Pure helper to clamp values within range [min, max].
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

/**
 * Derives the visual mood expression based on priority:
 * 1. Sleeping -> SLEEPING
 * 2. Critical Needs (<25 pts) -> TIRED, HUNGRY, DIRTY
 * 3. General Mood Levels -> VERY_HAPPY, HAPPY, NEUTRAL
 */
export function deriveCompanionExpression(state: {
  hunger: number;
  cleanliness: number;
  energy: number;
  mood: number;
  isSleeping: boolean;
}): CompanionExpression {
  if (state.isSleeping) {
    return 'SLEEPING';
  }
  if (state.energy < 20) {
    return 'TIRED';
  }
  if (state.hunger < 25) {
    return 'HUNGRY';
  }
  if (state.cleanliness < 25) {
    return 'DIRTY';
  }
  if (state.mood >= 80) {
    return 'VERY_HAPPY';
  }
  if (state.mood >= 50) {
    return 'HAPPY';
  }
  return 'NEUTRAL';
}

/**
 * Pure deterministic simulation function.
 * Computes the effective care state from a persisted snapshot and the current server timestamp.
 * NO database writes required for read-only calculations.
 */
export function calculateEffectiveCareState(
  rawState: RawCareState,
  nowMs: number,
  config: CompanionTuningConfig = DEFAULT_COMPANION_TUNING_CONFIG,
): EffectiveCareState {
  const lastSimMs = new Date(rawState.lastSimulatedAt).getTime();
  const rawElapsedMs = Math.max(0, nowMs - lastSimMs);
  const rawElapsedHours = rawElapsedMs / (1000 * 60 * 60);

  // Inactivity Protection: Cap decay calculation at configured maximum hours
  const effectiveHours = Math.min(rawElapsedHours, config.inactivityDecayCapHours);

  let hunger = clamp(rawState.hunger, 0, 100);
  let cleanliness = clamp(rawState.cleanliness, 0, 100);
  let energy = clamp(rawState.energy, 0, 100);
  let mood = clamp(rawState.mood, 0, 100);

  if (effectiveHours > 0) {
    if (rawState.isSleeping) {
      // Sleeping Simulation: Energy recovers, needs decay at 50% gentle rate
      energy = clamp(energy + effectiveHours * config.sleepingEnergyRecoveryPerHour, 0, 100);
      hunger = Math.max(
        config.passiveDecayFloor,
        hunger - effectiveHours * (config.hungerDecayPerHour * 0.5),
      );
      cleanliness = Math.max(
        config.passiveDecayFloor,
        cleanliness - effectiveHours * (config.cleanlinessDecayPerHour * 0.5),
      );
      mood = Math.max(
        config.passiveDecayFloor,
        mood - effectiveHours * (config.moodDecayPerHour * 0.5),
      );
    } else {
      // Awake Simulation: Needs decay gently down to passiveDecayFloor
      hunger = Math.max(config.passiveDecayFloor, hunger - effectiveHours * config.hungerDecayPerHour);
      cleanliness = Math.max(
        config.passiveDecayFloor,
        cleanliness - effectiveHours * config.cleanlinessDecayPerHour,
      );
      energy = Math.max(config.passiveDecayFloor, energy - effectiveHours * config.awakeEnergyDecayPerHour);
      mood = Math.max(config.passiveDecayFloor, mood - effectiveHours * config.moodDecayPerHour);
    }
  }

  // Round stats to 1 decimal place for stable serialization
  hunger = Math.round(hunger * 10) / 10;
  cleanliness = Math.round(cleanliness * 10) / 10;
  energy = Math.round(energy * 10) / 10;
  mood = Math.round(mood * 10) / 10;

  const expression = deriveCompanionExpression({
    hunger,
    cleanliness,
    energy,
    mood,
    isSleeping: rawState.isSleeping,
  });

  return {
    ...rawState,
    hunger,
    cleanliness,
    energy,
    mood,
    expression,
  };
}

export interface CareActionResult {
  updatedState: EffectiveCareState;
  reaction: CompanionReaction;
  statDeltas: CompanionStatDeltas;
}

/**
 * Pure function applying a care action to the current effective state.
 */
export function applyCareAction(
  currentState: RawCareState,
  action: CompanionCareActionType,
  nowMs: number,
  config: CompanionTuningConfig = DEFAULT_COMPANION_TUNING_CONFIG,
): CareActionResult {
  // 1. Advance simulation to current action timestamp
  const simulated = calculateEffectiveCareState(currentState, nowMs, config);
  const nowDate = new Date(nowMs);
  const nowIso = nowDate.toISOString();

  let hunger = simulated.hunger;
  let cleanliness = simulated.cleanliness;
  let energy = simulated.energy;
  let mood = simulated.mood;
  let isSleeping = simulated.isSleeping;
  let sleepStartedAt = simulated.sleepStartedAt;
  let reaction: CompanionReaction;
  const statDeltas: CompanionStatDeltas = {};

  switch (action) {
    case 'FEED': {
      if (isSleeping) {
        throw new Error('COMPANION_IS_SLEEPING');
      }
      const hungerDelta = config.actions.FEED.hungerDelta;
      const moodDelta = config.actions.FEED.moodDelta;
      hunger = clamp(hunger + hungerDelta, 0, 100);
      mood = clamp(mood + moodDelta, 0, 100);
      reaction = 'FED';
      statDeltas.hunger = hungerDelta;
      statDeltas.mood = moodDelta;
      break;
    }
    case 'CLEAN': {
      if (isSleeping) {
        throw new Error('COMPANION_IS_SLEEPING');
      }
      const cleanDelta = config.actions.CLEAN.cleanlinessDelta;
      const moodDelta = config.actions.CLEAN.moodDelta;
      cleanliness = clamp(cleanliness + cleanDelta, 0, 100);
      mood = clamp(mood + moodDelta, 0, 100);
      reaction = 'BATHED';
      statDeltas.cleanliness = cleanDelta;
      statDeltas.mood = moodDelta;
      break;
    }
    case 'PLAY': {
      if (isSleeping) {
        throw new Error('COMPANION_IS_SLEEPING');
      }
      if (energy < config.actions.PLAY.minEnergyRequired) {
        throw new Error('INSUFFICIENT_ENERGY');
      }
      const moodDelta = config.actions.PLAY.moodDelta;
      const energyCost = config.actions.PLAY.energyCost;
      mood = clamp(mood + moodDelta, 0, 100);
      energy = clamp(energy - energyCost, config.passiveDecayFloor, 100);
      reaction = 'PLAYED';
      statDeltas.mood = moodDelta;
      statDeltas.energy = -energyCost;
      break;
    }
    case 'PET': {
      if (isSleeping) {
        throw new Error('COMPANION_IS_SLEEPING');
      }
      const moodDelta = config.actions.PET.moodDelta;
      mood = clamp(mood + moodDelta, 0, 100);
      reaction = 'PETTED';
      statDeltas.mood = moodDelta;
      break;
    }
    case 'SLEEP': {
      if (isSleeping) {
        throw new Error('ALREADY_SLEEPING');
      }
      isSleeping = true;
      sleepStartedAt = nowIso;
      reaction = 'FELL_ASLEEP';
      break;
    }
    case 'WAKE': {
      if (!isSleeping) {
        throw new Error('ALREADY_AWAKE');
      }
      isSleeping = false;
      sleepStartedAt = null;
      reaction = 'WOKE_UP';
      break;
    }
    default:
      throw new Error(`UNKNOWN_CARE_ACTION: ${action}`);
  }

  hunger = Math.round(hunger * 10) / 10;
  cleanliness = Math.round(cleanliness * 10) / 10;
  energy = Math.round(energy * 10) / 10;
  mood = Math.round(mood * 10) / 10;

  const expression = deriveCompanionExpression({
    hunger,
    cleanliness,
    energy,
    mood,
    isSleeping,
  });

  const updatedState: EffectiveCareState = {
    hunger,
    cleanliness,
    energy,
    mood,
    isSleeping,
    sleepStartedAt,
    lastSimulatedAt: nowIso,
    lastInteractionAt: nowIso,
    expression,
  };

  return {
    updatedState,
    reaction,
    statDeltas,
  };
}
