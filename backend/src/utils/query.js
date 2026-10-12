const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 5000;

export const parseLimit = (value, fallback = DEFAULT_LIMIT, max = MAX_LIMIT) => {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, 1), max);
};

export const parseDateString = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export const trimmed = (value) => {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
};
