function readText(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function parseMainlandIdCard(value: unknown): { gender: '男' | '女'; birthDate: string } | null {
  const text = readText(value)?.toUpperCase() ?? '';
  const eighteen = text.match(/^(\d{6})(\d{4})(\d{2})(\d{2})\d{2}(\d)[\dX]$/);
  if (eighteen) {
    const birthDate = normalizeDateParts(eighteen[2], eighteen[3], eighteen[4]);
    if (!birthDate) return null;
    return { birthDate, gender: Number(eighteen[5]) % 2 === 1 ? '男' : '女' };
  }

  const fifteen = text.match(/^(\d{6})(\d{2})(\d{2})(\d{2})\d{2}(\d)$/);
  if (fifteen) {
    const birthDate = normalizeDateParts(`19${fifteen[2]}`, fifteen[3], fifteen[4]);
    if (!birthDate) return null;
    return { birthDate, gender: Number(fifteen[5]) % 2 === 1 ? '男' : '女' };
  }

  return null;
}

function normalizeDateParts(yearText: string, monthText: string, dayText: string): string | null {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return formatUtcDate(date);
}

function calculateAge(birthDate: string, referenceDate: Date): number | null {
  const parsed = parseDateInput(birthDate);
  if (!parsed) return null;
  let age = referenceDate.getFullYear() - parsed.year;
  const currentMonth = referenceDate.getMonth() + 1;
  const currentDay = referenceDate.getDate();
  if (currentMonth < parsed.month || (currentMonth === parsed.month && currentDay < parsed.day)) {
    age -= 1;
  }
  return age >= 0 && age < 150 ? age : null;
}

function parseDateInput(value: unknown): { year: number; month: number; day: number } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
  }
  const text = readText(value);
  if (!text) return null;
  const match = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (!match) return null;
  const normalized = normalizeDateParts(match[1], match[2].padStart(2, '0'), match[3].padStart(2, '0'));
  if (!normalized) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function parseMonths(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const text = readText(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2})(?:\.0+)?(?:个月|月)?$/);
  if (!match) return null;
  const months = Number(match[1]);
  return months > 0 && months <= 120 ? months : null;
}

function addMonthsClamped(date: { year: number; month: number; day: number }, months: number): Date {
  const zeroBasedMonth = date.month - 1 + months;
  const targetYear = date.year + Math.floor(zeroBasedMonth / 12);
  const targetMonth = ((zeroBasedMonth % 12) + 12) % 12;
  const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(date.day, maxDay)));
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function applyOnboardingDerivedFields(extraData: Record<string, unknown>, referenceDate = new Date()): Record<string, unknown> {
  const identity = parseMainlandIdCard(extraData.id_card_no);
  if (identity) {
    if (!hasValue(extraData.gender)) extraData.gender = identity.gender;
    if (!hasValue(extraData.birth_date)) extraData.birth_date = identity.birthDate;
    if (!hasValue(extraData.age)) {
      const age = calculateAge(identity.birthDate, referenceDate);
      if (age !== null) extraData.age = age;
    }
  }

  if (!hasValue(extraData.probation_end_date)) {
    const start = parseDateInput(extraData.probation_start_date);
    const months = parseMonths(extraData.probation_months);
    if (start && months !== null) {
      const end = addMonthsClamped(start, months);
      end.setUTCDate(end.getUTCDate() - 1);
      extraData.probation_end_date = formatUtcDate(end);
    }
  }

  return extraData;
}
