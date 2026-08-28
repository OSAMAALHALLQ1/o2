import {
  CompanionCareStateDto,
  WalletBalancesDto,
  GameDefinitionDto,
  RestaurantBranchDto,
  CosmeticItemSummaryDto,
  PartySummaryDto,
  UserSummaryDto,
} from '@o2/types';

export const mockUser: UserSummaryDto = {
  id: 'usr_mock_001',
  role: 'PLAYER',
  moderationStatus: 'ACTIVE',
  createdAt: '2026-01-15T12:00:00Z',
  lastActiveAt: new Date().toISOString(),
};

export const mockProfile = {
  userId: 'usr_mock_001',
  username: 'anas_o2',
  displayName: 'أنس — سفير O2',
  language: 'ar',
  selectedCharacterId: 'char_panda_01',
  isOnboarded: true,
};

export const mockBalances: WalletBalancesDto = {
  coins: 1450,
  gems: 65,
  eventTokens: [
    {
      eventId: 'season_summer_2026',
      balance: 120,
    },
  ],
};

export const mockCompanion: CompanionCareStateDto = {
  userId: 'usr_mock_01',
  characterId: 'char_panda_01',
  characterSlug: 'panda_bamboo_master',
  nameAr: 'باندا بامبو',
  nameEn: 'Panda Bamboo',
  archetype: 'حارس الغابة',
  placeholderAsset: 'panda_mascot',
  hunger: 88,
  cleanliness: 92,
  energy: 80,
  mood: 95,
  isSleeping: false,
  sleepStartedAt: null,
  lastSimulatedAt: new Date(Date.now() - 3600000).toISOString(),
  lastInteractionAt: new Date().toISOString(),
  expression: 'VERY_HAPPY',
  updatedAt: new Date().toISOString(),
};

export const mockGames: GameDefinitionDto[] = [
  {
    slug: 'atrash',
    nameKey: 'أطرش بالزفة',
    minPlayers: 5,
    maxPlayers: 5,
    publicMatchCount: 5,
    descriptionKey: 'لعبة الذكاء والتمويه العربية الشهيرة. 4 يعرفون الموضوع و1 أطرش بالزفة!',
    badge: 'شعبية فائقة 🔥',
    isAvailable: true,
  },
  {
    slug: 'mafia',
    nameKey: 'مافيا O2 (Mafia)',
    minPlayers: 8,
    maxPlayers: 8,
    publicMatchCount: 8,
    descriptionKey: 'صراع المافيا والقرية مع دردشة صوتية فورية وأدوار سرية.',
    badge: 'صوتية 🎙️',
    isAvailable: true,
  },
  {
    slug: 'tarneeb',
    nameKey: 'طرنيب (Tarneeb 41)',
    minPlayers: 4,
    maxPlayers: 4,
    publicMatchCount: 4,
    descriptionKey: 'لعبة الورق العربية الكلاسيكية 2 ضد 2 مع حساب دقيق للتركات.',
    badge: 'ورق أصيل ♠️',
    isAvailable: true,
  },
  {
    slug: 'hide_seek',
    nameKey: 'استغماية O2 (Hide & Seek)',
    minPlayers: 8,
    maxPlayers: 8,
    publicMatchCount: 8,
    descriptionKey: 'تخفى داخل مطعم O2 أو ابحث عن أصدقائك بماسحات نبضية.',
    badge: 'مكانية 3D 🗺️',
    isAvailable: true,
  },
  {
    slug: 'imposter_sabotage',
    nameKey: 'المخرب في المطبخ (O2 Sabotage)',
    minPlayers: 6,
    maxPlayers: 10,
    publicMatchCount: 8,
    descriptionKey: 'جهّز طلبات الزبائن واكتشف من يعبث بوصفات المطعم!',
    badge: 'طاقم المطعم 🍔',
    isAvailable: true,
  },
];

export const mockBranches: RestaurantBranchDto[] = [
  {
    id: 'brn_gaza_01',
    slug: 'gaza_main',
    name: 'فرع غزة الرئيسي — شارع الرمال',
    isActive: true,
    address: 'غزة، شارع عمر المختار، مقابل الحديقة',
  },
  {
    id: 'brn_nuseirat_02',
    slug: 'nuseirat_branch',
    name: 'فرع النصيرات — السوق التجاري',
    isActive: true,
    address: 'النصيرات، الشارع العام بالقرب من الدوار',
  },
];

export const mockParty: PartySummaryDto = {
  partyId: 'party_mock_99',
  roomCode: 'O2-7788',
  leaderId: 'usr_mock_001',
  selectedGameSlug: 'atrash',
  desiredGameMode: 'ATRASH',
  capacity: 5,
  allowJoinByCode: false,
  version: 1,
  members: [
    {
      userId: 'usr_mock_001',
      username: 'anas_o2',
      displayName: 'أنس (المضيف)',
      characterSlug: 'panda_mascot',
      isLeader: true,
      isReady: true,
      readyState: 'READY',
      joinedAt: '2026-08-28T10:00:00.000Z',
    },
    {
      userId: 'usr_mock_002',
      username: 'karim_chef',
      displayName: 'كريم الشيف',
      characterSlug: 'koala_mascot',
      isLeader: false,
      isReady: true,
      readyState: 'READY',
      joinedAt: '2026-08-28T10:01:00.000Z',
    },
    {
      userId: 'usr_mock_003',
      username: 'sara_gamer',
      displayName: 'سارة',
      characterSlug: 'fox_mascot',
      isLeader: false,
      isReady: false,
      readyState: 'NOT_READY',
      joinedAt: '2026-08-28T10:02:00.000Z',
    },
  ],
};

export const mockDailyMissions = [
  {
    id: 'ms_01',
    title: 'أطعم رفيقك وجبة شهية',
    rewardCoins: 50,
    progress: 1,
    target: 1,
    isClaimed: true,
  },
  {
    id: 'ms_02',
    title: 'العب جولة أطرش بالزفة',
    rewardCoins: 100,
    progress: 0,
    target: 1,
    isClaimed: false,
  },
  {
    id: 'ms_03',
    title: 'اجمع 3 تحيات من أصدقاء الصالة',
    rewardCoins: 75,
    progress: 2,
    target: 3,
    isClaimed: false,
  },
];

export const mockCosmetics: CosmeticItemSummaryDto[] = [
  {
    id: 'cos_hat_01',
    slug: 'golden_crown',
    nameKey: 'تاج O2 الذهبي الفاخر',
    slot: 'HEAD',
    rarity: 'LEGENDARY',
    gemPrice: 50,
    previewUri: '👑',
    isOwned: true,
    isEquipped: true,
  },
  {
    id: 'cos_outfit_01',
    slug: 'chef_uniform',
    nameKey: 'زي شيف O2 الرسمي',
    slot: 'BODY',
    rarity: 'EPIC',
    coinPrice: 600,
    previewUri: '🧑‍🍳',
    isOwned: true,
    isEquipped: true,
  },
  {
    id: 'cos_glasses_01',
    slug: 'cool_sunglasses',
    nameKey: 'نظارات النجوم السوداء',
    slot: 'FACE',
    rarity: 'RARE',
    coinPrice: 300,
    previewUri: '🕶️',
    isOwned: false,
    isEquipped: false,
  },
  {
    id: 'cos_frame_01',
    slug: 'fire_frame',
    nameKey: 'إطار الشعلة الحمراء',
    slot: 'NAME_FRAME',
    rarity: 'EPIC',
    gemPrice: 30,
    previewUri: '🔥',
    isOwned: true,
    isEquipped: true,
  },
];
