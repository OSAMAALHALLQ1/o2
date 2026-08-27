export type CompanionMood = 'ecstatic' | 'happy' | 'neutral' | 'sleepy' | 'pouty';

export type CompanionAnimation = 'idle' | 'eat' | 'bath' | 'sleep' | 'cheer' | 'wave' | 'dance';

export interface CompanionRenderProps {
  characterSlug: string;
  mood: CompanionMood;
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
  characterId: string;
  characterSlug: string;
  customName?: string;
  hunger: number; // 0 - 100
  cleanliness: number; // 0 - 100
  energy: number; // 0 - 100
  mood: number; // 0 - 100
  computedMoodCategory: CompanionMood;
  lastFedAt: string;
  lastBathedAt: string;
  lastSleptAt: string;
  lastInteractedAt: string;
}
