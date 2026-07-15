// Dishes are stored as single strings (often bilingual, e.g. "بیف استراگانف
// (Beef Stroganoff)"). The design shows each dish as an English primary line with a
// Persian secondary line, so we split the string into those two parts.

export function isPersian(s: string): boolean {
  return /[؀-ۿ]/.test(s.trim().charAt(0));
}

export interface DishName {
  primary: string;
  primaryFa: boolean;
  secondary?: string;
  secondaryFa?: boolean;
}

export function splitDishName(raw: string): DishName {
  const name = raw.trim();
  const m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);

  if (m) {
    const outside = m[1].trim();
    const inside = m[2].trim();
    const outsideFa = isPersian(outside);
    const insideFa = isPersian(inside);

    // Prefer the Latin/English part as the bold primary, Persian as secondary.
    if (outsideFa && !insideFa) {
      return { primary: inside, primaryFa: false, secondary: outside, secondaryFa: true };
    }
    return {
      primary: outside,
      primaryFa: outsideFa,
      secondary: inside,
      secondaryFa: insideFa,
    };
  }

  return { primary: name, primaryFa: isPersian(name) };
}
