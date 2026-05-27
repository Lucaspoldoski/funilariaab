export const VEHICLE_STATUSES = [
  "aguardando",
  "em_analise",
  "em_manutencao",
  "pintura",
  "finalizacao",
  "entregue",
] as const;

export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const STATUS_LABELS: Record<VehicleStatus, string> = {
  aguardando: "Aguardando",
  em_analise: "Em análise",
  em_manutencao: "Em manutenção",
  pintura: "Pintura",
  finalizacao: "Finalização",
  entregue: "Entregue",
};

export const STATUS_COLORS: Record<VehicleStatus, string> = {
  aguardando: "bg-muted text-muted-foreground border-border",
  em_analise: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  em_manutencao: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  pintura: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
  finalizacao: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
  entregue: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
};
