export interface CompanionTuningConfig {
  /** Passive hunger decay per hour when awake (points) */
  hungerDecayPerHour: number;
  /** Passive cleanliness decay per hour (points) */
  cleanlinessDecayPerHour: number;
  /** Passive energy decay per hour when awake (points) */
  awakeEnergyDecayPerHour: number;
  /**
   * Passive energy recovery per hour when sleeping (points)
   * At +12.5/hour:
   * - 20 (floor) -> 100 (max) = 6.4 hours
   * - 80 (default) -> 100 (max) = 1.6 hours
   * - 0 (theoretical) -> 100 (max) = 8.0 hours
   */
  sleepingEnergyRecoveryPerHour: number;
  /** Passive mood decay per hour (points) */
  moodDecayPerHour: number;
  /** Minimum non-catastrophic floor for passive stat decay (points) */
  passiveDecayFloor: number;
  /** Maximum elapsed time (hours) calculated for passive decay to protect inactive players */
  inactivityDecayCapHours: number;
  /** Action tuning parameters */
  actions: {
    FEED: {
      hungerDelta: number;
      moodDelta: number;
      cooldownMs: number;
    };
    CLEAN: {
      cleanlinessDelta: number;
      moodDelta: number;
      cooldownMs: number;
    };
    PLAY: {
      moodDelta: number;
      energyCost: number;
      minEnergyRequired: number;
      cooldownMs: number;
    };
    PET: {
      moodDelta: number;
      cooldownMs: number;
    };
    SLEEP: {
      cooldownMs: number;
    };
    WAKE: {
      cooldownMs: number;
    };
  };
}

export const DEFAULT_COMPANION_TUNING_CONFIG: CompanionTuningConfig = {
  hungerDecayPerHour: 3.0,
  cleanlinessDecayPerHour: 2.0,
  awakeEnergyDecayPerHour: 2.5,
  sleepingEnergyRecoveryPerHour: 12.5, // +12.5/hr (6.4h from 20 floor to 100 max; 1.6h from 80 to 100)
  moodDecayPerHour: 2.0,
  passiveDecayFloor: 20.0,
  inactivityDecayCapHours: 48.0,
  actions: {
    FEED: {
      hungerDelta: 25.0,
      moodDelta: 5.0,
      cooldownMs: 3000, // 3 seconds
    },
    CLEAN: {
      cleanlinessDelta: 35.0,
      moodDelta: 5.0,
      cooldownMs: 5000, // 5 seconds
    },
    PLAY: {
      moodDelta: 25.0,
      energyCost: 15.0,
      minEnergyRequired: 35.0, // Minimum 35.0 energy required to initiate play
      cooldownMs: 10000, // 10 seconds
    },
    PET: {
      moodDelta: 10.0,
      cooldownMs: 5000, // 5 seconds
    },
    SLEEP: {
      cooldownMs: 0, // Transition-only
    },
    WAKE: {
      cooldownMs: 0, // Transition-only
    },
  },
};
