const appDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const appTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

function parsedDate(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAppDate(
  value: string | number | Date | null | undefined,
  fallback = "-",
) {
  if (!value) return fallback;
  const date = parsedDate(value);
  if (!date) return fallback;

  const [day, month, year] = appDateFormatter.format(date).split(" ");
  return `${day} ${month}, ${year}`;
}

export function formatAppDateTime(
  value: string | number | Date | null | undefined,
  fallback = "-",
) {
  if (!value) return fallback;
  const date = parsedDate(value);
  if (!date) return fallback;

  return `${formatAppDate(date, fallback)}, ${appTimeFormatter.format(date)}`;
}
