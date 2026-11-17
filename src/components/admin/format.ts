// Dates and amounts the way the panel shows them: Dutch time, Dutch notation.

const amsterdam = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", ...options });

export const dateTime = (d: Date) => amsterdam({ day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
export const shortDate = (d: Date) => amsterdam({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
export const time = (d: Date) => amsterdam({ hour: "2-digit", minute: "2-digit" }).format(d);

/** 2100 basis points → "21%". */
export const vatRate = (bp: number) => `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(bp / 100)}%`;
