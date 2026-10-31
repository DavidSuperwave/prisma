type BuildCronInput = {
  repeat: "daily" | "weekly" | "monthly";
  atHour: number;
  atMinute: number;
  weekday?: number;
  day?: number;
};

function assertIntegerInRange(value: number, min: number, max: number, label: string) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
}

export function buildCronExpression(input: BuildCronInput): string {
  const { repeat, atHour, atMinute } = input;
  assertIntegerInRange(atHour, 0, 23, "atHour");
  assertIntegerInRange(atMinute, 0, 59, "atMinute");

  if (repeat === "daily") {
    return `${atMinute} ${atHour} * * *`;
  }
  if (repeat === "weekly") {
    const weekday = input.weekday ?? 0;
    assertIntegerInRange(weekday, 0, 6, "weekday");
    return `${atMinute} ${atHour} * * ${weekday}`;
  }
  const day = input.day ?? 1;
  assertIntegerInRange(day, 1, 31, "day");
  return `${atMinute} ${atHour} ${day} * *`;
}

function formatTime(hour: number, minute: number) {
  const safeHour = Number.isInteger(hour) ? hour : 0;
  const safeMinute = Number.isInteger(minute) ? minute : 0;
  const date = new Date(Date.UTC(2020, 0, 1, safeHour, safeMinute));
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
}

export function describeCron(cron: string, tz: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return `Custom cron (${tz}): ${cron}`;
  }
  const [minuteRaw, hourRaw, dayRaw, monthRaw, weekdayRaw] = parts;
  const minute = Number.parseInt(minuteRaw, 10);
  const hour = Number.parseInt(hourRaw, 10);
  const time = formatTime(hour, minute);
  const zone = tz || "UTC";
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  if (dayRaw === "*" && monthRaw === "*" && weekdayRaw === "*" && Number.isInteger(hour) && Number.isInteger(minute)) {
    return `Daily at ${time} (${zone})`;
  }
  const weekday = Number.parseInt(weekdayRaw, 10);
  if (dayRaw === "*" && monthRaw === "*" && Number.isInteger(weekday) && Number.isInteger(hour) && Number.isInteger(minute)) {
    const weekdayLabel = weekdays[((weekday % 7) + 7) % 7];
    return `Weekly on ${weekdayLabel} at ${time} (${zone})`;
  }
  const day = Number.parseInt(dayRaw, 10);
  if (monthRaw === "*" && weekdayRaw === "*" && Number.isInteger(day) && Number.isInteger(hour) && Number.isInteger(minute)) {
    return `Monthly on day ${day} at ${time} (${zone})`;
  }
  return `Custom cron (${zone}): ${cron}`;
}
