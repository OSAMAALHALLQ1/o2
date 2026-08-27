export type CompanionMood = 'ecstatic' | 'happy' | 'neutral' | 'sleepy' | 'pouty';

export type CompanionAnimation = 'idle' | 'eat' | 'bath' | 'sleep' | 'cheer' | 'wave' | 'dance';

export type CompanionCareActionType = 'FEED' | 'CLEAN' | 'PLAY' | 'PET' | 'SLEEP' | 'WAKE';

export type CompanionExpression =
  | 'VERY_HAPPY'
  | 'HAPPY'
  | 'NEUTRAL'
  | 'TIRED'
  | 'HUNGRY'
  | 'DIRTY'
  | 'SLEEPING';

export type CompanionReaction =
  | 'FED'
  | 'BATHED'
  | 'PLAYED'
  | 'PETTED'
  | 'FELL_ASLEEP'
  | 'WOKE_UP';

export interface CompanionRenderProps {
  characterSlug: string;
  mood: CompanionMood;
  expression?: CompanionExpression;
  equippedCosmetics?: {
    outfitSlug?: string;
    hatSlug?: string;
    glassesSlug?: string;
    backAccessorySlug?: string;
  };
  currentAnimation?: CompanionAnimation;
  onTap?: () => void;
  scale?: number;
  interactive?: boolean;
}

export interface StarterCompanionDto {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  archetype: string;
  placeholderAsset: string;
  isStarter: boolean;
  sortOrder: number;
}

export interface CompanionSelectResponse {
  success: boolean;
  selectedCharacter: StarterCompanionDto;
  profile: {
    userId: string;
    username: string | null;
    selectedCharacterId: string;
    isOnboarded: boolean;
  };
}

export interface CompanionCareStateDto {
  userId: string;
  characterId: string;
  characterSlug: string;
  nameAr: string;
  nameEn: string;
  archetype: string;
  placeholderAsset: string;
  hunger: number;        // 0 - 100
  cleanliness: number;   // 0 - 100
  energy: number;        // 0 - 100
  mood: number;          // 0 - 100
  isSleeping: boolean;
  sleepStartedAt: string | null;
  lastSimulatedAt: string;
  lastInteractionAt: string;
  expression: CompanionExpression;
  updatedAt: string;
}

export interface CompanionActionRequestDto {
  action: CompanionCareActionType;
  clientActionId: string;
}

export interface CompanionStatDeltas {
  hunger?: number;
  cleanliness?: number;
  energy?: number;
  mood?: number;
}

export interface CompanionActionResponseDto {
  success: boolean;
  action: CompanionCareActionType;
  clientActionId: string;
  reaction: CompanionReaction;
  state: CompanionCareStateDto;
  statDeltas: CompanionStatDeltas;
}
