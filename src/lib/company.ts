// Company details shown on the site (ACM, BW 3:15d: name, address, KvK and
// VAT number must be visible). Values given by the owner on 2026-10-04,
// address on 2026-10-05; null = not given yet, shown as "nog in te vullen".

export const company = {
  tradeName: "WonZo",
  legalName: "R.M.A. Marketing",
  kvk: "42126738",
  /** Not given yet (registry <<BTW>>). */
  vat: null as string | null,
  address: "Thaliastraat 267, 6846 XX Arnhem" as string | null,
  email: "info@wonzo.nl",
  domain: "wonzo.nl",
} as const;
