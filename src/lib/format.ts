export const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

export const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

export const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR") : "—";
