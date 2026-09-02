import type { AtrashCategoryDef, AtrashWordItem } from '@o2/types';

export const ATRASH_CATEGORIES: AtrashCategoryDef[] = [
  {
    slug: 'daily_life',
    nameAr: 'حياة يومية',
    icon: '☕',
    descriptionAr: 'أشياء وأدوات ومواقف نعيشها كل يوم في روتيننا',
  },
  {
    slug: 'food',
    nameAr: 'أكلات ومطاعم',
    icon: '🍔',
    descriptionAr: 'أشهى المأكولات والمشروبات الشعبية والحلويات',
  },
  {
    slug: 'sports',
    nameAr: 'رياضة وتحدي',
    icon: '⚽',
    descriptionAr: 'كرة قدم ومصطلحات رياضية وملاعب ونجوم الرياضة',
  },
  {
    slug: 'movies',
    nameAr: 'سينما ومسلسلات',
    icon: '🎬',
    descriptionAr: 'أفلام عربية وعالمية ومسلسلات ودراما سينمائية',
  },
  {
    slug: 'palestine',
    nameAr: 'فلسطين الحبيبة',
    icon: '🫒',
    descriptionAr: 'تراث ومدن ورموز فلسطينية أصيلة وعادات وتقاليد',
  },
  {
    slug: 'gaming',
    nameAr: 'ألعاب وجيمينج',
    icon: '🎮',
    descriptionAr: 'عالم الفيديو جيمز والكونسول والبطولات واللاعبين',
  },
  {
    slug: 'funny_scenarios',
    nameAr: 'مواقف طريفة',
    icon: '😂',
    descriptionAr: 'مواقف محرجة وقفشات مضحكة ومفارقات عفوية',
  },
  {
    slug: 'o2_special',
    nameAr: 'عالم O2 الخاص',
    icon: '✨',
    descriptionAr: 'مقهى O2 والرفيق والطلبات والجلسات الدافئة',
  },
];

export const ATRASH_WORD_PACK: AtrashWordItem[] = [
  // 1. Daily Life
  {
    id: 'dl_alarm',
    word: 'منبه',
    categorySlug: 'daily_life',
    hintsAr: ['شيء يرن ويزعجك صباحاً', 'تضغط عليه لتأجيله 5 دقائق'],
    distractors: ['ساعة حائط', 'هاتف', 'تقويم', 'راديو'],
  },
  {
    id: 'dl_keys',
    word: 'مفاتيح',
    categorySlug: 'daily_life',
    hintsAr: ['تبحث عنها وأنت مستعجل', 'تصدر صوتاً معدنياً في الجيب'],
    distractors: ['محفظة', 'نظارة', 'بطاقة هوية', 'قفل'],
  },
  {
    id: 'dl_elevator',
    word: 'مصعد',
    categorySlug: 'daily_life',
    hintsAr: ['ينقلك بين الطوابق', 'فيه أزرار ومرآة'],
    distractors: ['درج', 'سلالم كهربائية', 'ممر', 'شرفة'],
  },
  {
    id: 'dl_charger',
    word: 'شاحن الهاتف',
    categorySlug: 'daily_life',
    hintsAr: ['سلك كهربائي ينقذ بطاريتك', 'دائماً يستعيره أحدهم'],
    distractors: ['باور بانك', 'سماعات', 'كابل إنترنت', 'مقبس جداري'],
  },

  // 2. Food
  {
    id: 'food_shawarma',
    word: 'شاورما',
    categorySlug: 'food',
    hintsAr: ['سيخ دوار ولحم أو دجاج مقطع', 'مع طحينية أو ثومية ومخلل'],
    distractors: ['فلافل', 'برجر', 'كباب', 'طاووق'],
  },
  {
    id: 'food_mansaf',
    word: 'منسف',
    categorySlug: 'food',
    hintsAr: ['أكلة تقليدية مع الجميد واللحم والصنوبر', 'تؤكل في المناسبات الكبرى'],
    distractors: ['مقلوبة', 'كبسة', 'برياني', 'أوزي'],
  },
  {
    id: 'food_knafeh',
    word: 'كنافة نابلسية',
    categorySlug: 'food',
    hintsAr: ['حلوى بالجبنة والقطر والفستق الحلبي', 'طازجة وساخنة تمط الجبنة'],
    distractors: ['بقلاوة', 'بسبوسة', 'قطايف', 'معمول'],
  },
  {
    id: 'food_falafel',
    word: 'فلافل',
    categorySlug: 'food',
    hintsAr: ['حبات مقرمشة من الحمص والبقدونس', 'فطور شعبي لا يمل منه'],
    distractors: ['حمص', 'فول مدمس', 'سمبوسك', 'فتة'],
  },

  // 3. Sports
  {
    id: 'sports_penalty',
    word: 'ركلة جزاء',
    categorySlug: 'sports',
    hintsAr: ['مواجهة مباشرة بين لاعب وحارس المرمى من 11 متراً', 'لحظة حبس الأنفاس'],
    distractors: ['ركلة ركنية', 'ركلة حرة', 'رمية تماس', 'تسلل'],
  },
  {
    id: 'sports_redcard',
    word: 'كارت أحمر',
    categorySlug: 'sports',
    hintsAr: ['يخرجه الحكم عند الخطأ الجسيم', 'يطرد اللاعب خارج الملعب'],
    distractors: ['كارت أصفر', 'صافرة الحكم', 'شريط الكابتن', 'تقنية الفار'],
  },
  {
    id: 'sports_goalkeeper',
    word: 'حارس مرمى',
    categorySlug: 'sports',
    hintsAr: ['يرتدي قفازات ويدافع عن الشباك', 'يحق له استخدام يديه'],
    distractors: ['مهاجم', 'مدافع', 'لاعب وسط', 'مدرب الفريق'],
  },

  // 4. Movies
  {
    id: 'movies_popcorn',
    word: 'فشار',
    categorySlug: 'movies',
    hintsAr: ['ذرة مفرقعة برائحة زكية داخل صالة العرض', 'رفيق مشاهدة الأفلام'],
    distractors: ['ناتشوز', 'مشروب غازي', 'شوكولاتة', 'آيس كريم'],
  },
  {
    id: 'movies_director',
    word: 'مخرج الفيلم',
    categorySlug: 'movies',
    hintsAr: ['يصرخ أكشن وكات ويقود التصوير', 'يجلس خلف الكواليس'],
    distractors: ['ممثل رئيسي', 'كاتب السيناريو', 'مصور الكاميرا', 'منتج'],
  },
  {
    id: 'movies_subtitle',
    word: 'ترجمة الأفلام',
    categorySlug: 'movies',
    hintsAr: ['نصوص تظهر أسفل الشاشة لفهم اللغات الأجنبية', 'تسبق أحياناً الكلام'],
    distractors: ['دبلجة', 'مؤثرات صوتية', 'موسيقى تصويرية', 'شارة البداية'],
  },

  // 5. Palestine
  {
    id: 'pal_kuffiyeh',
    word: 'الكوفية الفلسطينية',
    categorySlug: 'palestine',
    hintsAr: ['شماغ أبيض وأسود بنقوش شباك الصيد وأوراق الزيتون', 'رمز العزة والحرية'],
    distractors: ['طربوش', 'عقال', 'حطة', 'شال'],
  },
  {
    id: 'pal_olive',
    word: 'موسم الزيتون',
    categorySlug: 'palestine',
    hintsAr: ['شجرة مباركة ومعصرة زيت أصيل وعونة الأهل', 'موسم قطاف سنوي'],
    distractors: ['بيارات البرتقال', 'حقول القمح', 'شجر النخيل', 'أشجار التين'],
  },
  {
    id: 'pal_dabke',
    word: 'الدبكة الشعبية',
    categorySlug: 'palestine',
    hintsAr: ['رقصة فلكلورية باليرغول والشبابة وضرب الأقدام بالأرض', 'في كل زفة وفرح'],
    distractors: ['السامر', 'الزجل', 'العزف على العود', 'الموال'],
  },
  {
    id: 'pal_tatreez',
    word: 'التطريز الفلسطيني',
    categorySlug: 'palestine',
    hintsAr: ['خيوط حريرية ملونة تزين الثوب التراثي قطبة بقطبة', 'هوية وأصالة'],
    distractors: ['صناعة الفخار', 'حفر الخشب', 'النسيج', 'النقش على النحاس'],
  },

  // 6. Gaming
  {
    id: 'gaming_controller',
    word: 'يد تحكم (كنترولر)',
    categorySlug: 'gaming',
    hintsAr: ['جهاز به أسهم وأزرار وجويستيك للعب', 'اهتزاز عند الضرر'],
    distractors: ['كيبورد', 'ماوس قيمنق', 'سماعة محيطية', 'شاشة 144Hz'],
  },
  {
    id: 'gaming_headshot',
    word: 'هيدشوت',
    categorySlug: 'gaming',
    hintsAr: ['طلقة قناص حاسمة في الرأس تسقط الخصم فوراً', 'صوت مميز في ألعاب الشوتر'],
    distractors: ['كامبينغ', 'ريسباون', 'نوك داون', 'لوت بوكس'],
  },
  {
    id: 'gaming_boss',
    word: 'زعيم المرحلة',
    categorySlug: 'gaming',
    hintsAr: ['وحش كبير ذو شريط صحة طويل في نهاية المرحلة', 'يتطلب استراتيجية لهزيمته'],
    distractors: ['وحش عادي', 'إن بي سي NPC', 'تاجر اللعبة', 'المساعد الآلي'],
  },

  // 7. Funny Scenarios
  {
    id: 'funny_slippers',
    word: 'شبشب طائر',
    categorySlug: 'funny_scenarios',
    hintsAr: ['سلاح الأمهات الدقيق الموجه عن بعد', 'يصيبك خلف الأبواب دون خطأ'],
    distractors: ['عصا المكنسة', 'ملاس المطبخ', 'وسادة الكنبة', 'كأس ماء'],
  },
  {
    id: 'funny_lowbattery',
    word: 'بطارية 1%',
    categorySlug: 'funny_scenarios',
    hintsAr: ['شاشة تخفت فجأة وأنت بقمة المحادثة وتبحث عن شاحن مذعوراً', 'لحظة توتر'],
    distractors: ['انقطاع النت', 'شاشة سوداء', 'تحديث إجباري', 'نسيان كلمة المرور'],
  },
  {
    id: 'funny_fastvoice',
    word: 'فويس نوت مسرّع',
    categorySlug: 'funny_scenarios',
    hintsAr: ['تسجيل صوتي 5 دقائق تشغله على سرعة 2x ليتحول لصوت كرتوني', 'لتوفير الوقت'],
    distractors: ['مكالمة فائتة', 'رسالة ممسوحة', 'فيديو طويل', 'بث مباشر'],
  },

  // 8. O2 Special
  {
    id: 'o2_companion',
    word: 'الرفيق الصغير',
    categorySlug: 'o2_special',
    hintsAr: ['شخصية لطيفة تعتني بها وتطعمها وتلعب معها في عالم O2', 'تنام وتشعر بالجوع'],
    distractors: ['باريستا المقهى', 'شيف المطعم', 'زبون المتجر', 'حارس البوابة'],
  },
  {
    id: 'o2_secret_order',
    word: 'وجبة الكومبو السرية',
    categorySlug: 'o2_special',
    hintsAr: ['طلب خاص ولذيذ من مطبخ O2 مع بطاطا مقرمشة ومشروب منعش', 'تكافئ بها نفسك'],
    distractors: ['قهوة مثلجة', 'كوكيز بالشوكولاتة', 'ساندوتش خفيف', 'عصير برتقال طازج'],
  },
];

export function getAtrashCategory(slug: string): AtrashCategoryDef | undefined {
  return ATRASH_CATEGORIES.find((c) => c.slug === slug);
}

export function getRandomWordPackItem(seed?: number, categorySlug?: string): AtrashWordItem {
  let pool = ATRASH_WORD_PACK;
  if (categorySlug) {
    const filtered = pool.filter((item) => item.categorySlug === categorySlug);
    if (filtered.length > 0) {
      pool = filtered;
    }
  }

  if (typeof seed === 'number') {
    const index = Math.abs(seed) % pool.length;
    return pool[index];
  }

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

/**
 * Builds exactly 4 options for Atrash last chance.
 * Guarantees that the correct word is included, and 3 distinct distractors are selected.
 */
export function buildLastChanceOptions(
  secretItem: AtrashWordItem,
  seed?: number,
): string[] {
  const options = new Set<string>();
  options.add(secretItem.word);

  // Add category distractors first
  for (const distractor of secretItem.distractors) {
    if (options.size >= 4) break;
    options.add(distractor);
  }

  // If still less than 4, pull words from same category or other packs
  if (options.size < 4) {
    const sameCat = ATRASH_WORD_PACK.filter(
      (w) => w.categorySlug === secretItem.categorySlug && w.word !== secretItem.word,
    );
    for (const item of sameCat) {
      if (options.size >= 4) break;
      options.add(item.word);
    }
  }

  // Fallback if needed
  if (options.size < 4) {
    for (const item of ATRASH_WORD_PACK) {
      if (options.size >= 4) break;
      options.add(item.word);
    }
  }

  const optionList = Array.from(options).slice(0, 4);

  // Deterministically shuffle options so correct answer is not always in position 0
  const rng = (idx: number) => {
    if (typeof seed === 'number') {
      return (seed * 9301 + 49297 + idx * 233) % 233280;
    }
    return Math.random();
  };

  return optionList.sort((a, b) => {
    const hashA = rng(a.charCodeAt(0));
    const hashB = rng(b.charCodeAt(0));
    return hashA - hashB;
  });
}
