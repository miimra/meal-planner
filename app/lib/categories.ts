// The 12 fixed categories. This is reference data — dishes are seeded from here
// on first run, then become editable in localStorage (see store.ts).

export type Style = "iranian" | "international" | "either";
export type Effort = "quick" | "medium" | "medium-heavy" | "heavy";

export interface Category {
  id: number;
  name_fa: string;
  name_en: string;
  emoji: string;
  style: Style;
  effort: Effort;
  effort_minutes: [number, number];
  weekend_only?: boolean;
  prep_ahead?: boolean;
  notes?: string;
  dishes: string[];
}

export const CATEGORIES: Category[] = [
  {
    id: 1,
    name_fa: "بندری و تخم‌مرغی",
    name_en: "Bandari & Eggs",
    emoji: "🍳",
    style: "iranian",
    effort: "quick",
    effort_minutes: [20, 30],
    dishes: [
      "بندری (eggs + sausage + potatoes)",
      "تخم‌مرغ سوسیس",
      "تخم‌مرغ سیب‌زمینی",
      "املت",
      "کوکو سیب‌زمینی",
      "کوکو سبزی",
      "فلافل (frozen)",
    ],
  },
  {
    id: 2,
    name_fa: "کبابی ایرانی",
    name_en: "Iranian Grilled",
    emoji: "🍢",
    style: "iranian",
    effort: "medium",
    effort_minutes: [30, 45],
    weekend_only: true,
    dishes: ["جوجه کباب", "جوجه سیخی", "کباب ترش", "چلوکباب"],
  },
  {
    id: 3,
    name_fa: "خورشت‌های سنگین",
    name_en: "Heavy Iranian Stews",
    emoji: "🍲",
    style: "iranian",
    effort: "heavy",
    effort_minutes: [60, 120],
    weekend_only: true,
    prep_ahead: true,
    dishes: ["فسنجون", "مرغ ترش", "انواع خورش‌ها (Various stews)", "پلو ماهیچه"],
  },
  {
    id: 4,
    name_fa: "لا پلو و دمی",
    name_en: "Layered Rice & Dami",
    emoji: "🍚",
    style: "iranian",
    effort: "medium-heavy",
    effort_minutes: [45, 90],
    dishes: [
      "هویج و مرغ لا پلو",
      "قارچ و مرغ لا پلو",
      "ته‌چین",
      "لوبیا پلو",
      "عدس پلو",
      "دمی گوجه",
    ],
  },
  {
    id: 5,
    name_fa: "مرغ/گوشت بین‌المللی",
    name_en: "International Chicken/Meat",
    emoji: "🍗",
    style: "international",
    effort: "medium",
    effort_minutes: [30, 45],
    dishes: [
      "بیف استراگانف (Beef Stroganoff)",
      "باتر چیکن (Butter Chicken)",
      "تریاکی (Teriyaki)",
      "مرغ سوخاری (Fried Chicken)",
    ],
  },
  {
    id: 6,
    name_fa: "ماهی و میگو",
    name_en: "Fish & Shrimp",
    emoji: "🐟",
    style: "either",
    effort: "medium",
    effort_minutes: [25, 45],
    notes: "Fish weekly at most. Shrimp is frozen.",
    dishes: [
      "ماهی (Fish)",
      "میگو پاستا (Shrimp Pasta)",
      "میگو سوخاری (Fried Shrimp)",
      "حواری (Shrimp Rice / Meygo Polo)",
    ],
  },
  {
    id: 7,
    name_fa: "پاستا و نودل",
    name_en: "Pasta & Noodles",
    emoji: "🍝",
    style: "international",
    effort: "quick",
    effort_minutes: [20, 45],
    notes:
      "Pasta needs a side (salad, boiled egg, or veggies) — don't serve carbs alone.",
    dishes: [
      "ماکارونی (Amir's favorite)",
      "پاستا",
      "نودل",
      "لازانیا (heavy — pre-cook)",
    ],
  },
  {
    id: 8,
    name_fa: "همبرگر و سوشی",
    name_en: "Burgers & Sushi",
    emoji: "🍔",
    style: "international",
    effort: "medium",
    effort_minutes: [30, 45],
    dishes: ["همبرگر (Burger)", "سوشی (Sushi — often bought)"],
  },
  {
    id: 9,
    name_fa: "خمیری و تنوری",
    name_en: "Pastries & Baked",
    emoji: "🥟",
    style: "iranian",
    effort: "medium",
    effort_minutes: [30, 45],
    dishes: ["پیراشکی", "سمبوسه", "کتلت"],
  },
  {
    id: 10,
    name_fa: "سالاد به‌عنوان وعده",
    name_en: "Salad as Meal",
    emoji: "🥗",
    style: "either",
    effort: "quick",
    effort_minutes: [15, 30],
    dishes: [
      "سالاد ماکارونی (Macaroni Salad)",
      "سالاد اولویه (Olivieh Salad)",
      "سالاد سیب‌زمینی (Potato Salad)",
    ],
  },
  {
    id: 11,
    name_fa: "سرد و راحت",
    name_en: "Cold & Simple",
    emoji: "🌡️",
    style: "iranian",
    effort: "quick",
    effort_minutes: [10, 30],
    dishes: ["آبدوغ خیار (Abdoogh Khiar)", "عدسی (Lentil Stew)"],
  },
  {
    id: 12,
    name_fa: "پیتزا",
    name_en: "Pizza",
    emoji: "🍕",
    style: "international",
    effort: "medium",
    effort_minutes: [30, 45],
    notes: "Homemade or takeaway",
    dishes: [],
  },
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: number): Category | undefined {
  return CATEGORY_BY_ID.get(id);
}

export const EFFORT_LABEL: Record<Effort, string> = {
  quick: "Quick",
  medium: "Medium",
  "medium-heavy": "Medium–Heavy",
  heavy: "Heavy",
};

export const STYLE_LABEL: Record<Style, string> = {
  iranian: "Iranian",
  international: "International",
  either: "Either",
};
