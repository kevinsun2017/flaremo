type ActivityDay = { date: string; count: number };

const monthFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getMonthFormatter(locale: string) {
  let formatter = monthFormatterCache.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: "short",
      timeZone: "UTC",
    });
    monthFormatterCache.set(locale, formatter);
  }
  return formatter;
}

export function buildMonthLabels(activity: ActivityDay[], locale: string) {
  const weekStarts = activity.filter((_, index) => index % 7 === 0);
  const formatter = getMonthFormatter(locale);
  let previousMonth = "";
  return weekStarts.map((day) => {
    const date = new Date(`${day.date}T12:00:00Z`);
    const month = formatter.format(date);
    if (month === previousMonth) return { date: day.date, label: "" };
    previousMonth = month;
    return { date: day.date, label: month };
  });
}

/**
 * The streak of consecutive writing days ending today (or yesterday — today
 * stays "not broken yet" until it is over). Days are chronological ascending,
 * as produced by the backend's activity window.
 */
export function currentStreak(activity: ActivityDay[]): number {
  let streak = 0;
  for (let index = activity.length - 1; index >= 0; index -= 1) {
    const day = activity[index];
    if (!day) break;
    if (day.count > 0) {
      streak += 1;
      continue;
    }
    // The latest day gets one free pass: an empty today does not break a
    // streak that is still alive from yesterday.
    if (index === activity.length - 1) continue;
    break;
  }
  return streak;
}

/** Returns a Tailwind colour class for a heatmap cell given the note count. */
export function heatmapColor(count: number): string {
  if (count <= 0) return "bg-muted-foreground/15 dark:bg-muted/30";
  if (count === 1) return "bg-primary/35 dark:bg-primary/30";
  if (count === 2) return "bg-primary/55 dark:bg-primary/50";
  if (count === 3) return "bg-primary/75 dark:bg-primary/75";
  return "bg-primary";
}
