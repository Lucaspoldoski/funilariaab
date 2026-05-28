import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_COLORS, STATUS_LABELS, type VehicleStatus } from "@/lib/vehicle-status";

export const Route = createFileRoute("/calendar")({ component: () => <AppLayout><CalendarPage /></AppLayout> });

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WEEK = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function CalendarPage() {
  const [cursor, setCursor] = React.useState(() => { const d = new Date(); d.setDate(1); return d; });
  const month = cursor.getMonth(); const year = cursor.getFullYear();

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const startISO = start.toISOString().slice(0, 10);
  const endISO = end.toISOString().slice(0, 10);

  const { data: vehicles = [] } = useQuery({
    queryKey: ["calendar", startISO, endISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, brand, model, plate, status, entry_date, expected_delivery, clients(name)")
        .or(`and(entry_date.gte.${startISO},entry_date.lte.${endISO}),and(expected_delivery.gte.${startISO},expected_delivery.lte.${endISO})`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const byDay = React.useMemo(() => {
    const map = new Map<string, Array<{ id: string; label: string; kind: "entrada" | "entrega"; status: string; sub: string }>>();
    for (const v of vehicles as any[]) {
      const push = (k: string, kind: "entrada" | "entrega") => {
        if (!k) return;
        const arr = map.get(k) ?? []; arr.push({ id: v.id, label: `${v.brand} ${v.model}`, kind, status: v.status, sub: v.plate });
        map.set(k, arr);
      };
      push(v.entry_date, "entrada"); push(v.expected_delivery, "entrega");
    }
    return map;
  }, [vehicles]);

  const firstDow = start.getDay();
  const totalDays = end.getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">Entradas e previsões de entrega do mês.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-40 text-center text-sm font-medium">{MONTHS[month]} {year}</div>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }}>Hoje</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-7 gap-1 pb-2 text-center text-xs font-medium text-muted-foreground">
            {WEEK.map((w) => <div key={w}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="h-24 sm:h-28 rounded-md bg-muted/20" />;
              const iso = d.toISOString().slice(0, 10);
              const events = byDay.get(iso) ?? [];
              const isToday = iso === todayISO;
              return (
                <div key={i} className={cn("h-24 sm:h-28 overflow-hidden rounded-md border p-1.5 text-xs", isToday && "border-primary bg-primary/5")}>
                  <div className={cn("mb-1 text-right text-xs font-medium", isToday && "text-primary")}>{d.getDate()}</div>
                  <div className="space-y-0.5">
                    {events.slice(0, 2).map((e, j) => (
                      <Link key={j} to="/vehicles/$id" params={{ id: e.id }}
                        className={cn("block truncate rounded px-1 py-0.5",
                          e.kind === "entrada" ? "bg-blue-500/15 text-blue-700 dark:text-blue-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300")}>
                        {e.kind === "entrada" ? "↓" : "↑"} {e.label}
                      </Link>
                    ))}
                    {events.length > 2 && <div className="text-[10px] text-muted-foreground">+{events.length - 2} mais</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Próximos eventos</CardTitle></CardHeader>
        <CardContent>
          {vehicles.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum evento neste mês.</p>
          ) : (
            <div className="divide-y">
              {(vehicles as any[]).map((v) => (
                <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <Link to="/vehicles/$id" params={{ id: v.id }} className="text-sm font-medium hover:underline">{v.brand} {v.model} · {v.plate}</Link>
                    <p className="text-xs text-muted-foreground">{v.clients?.name ?? "—"}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {v.entry_date && <Badge variant="outline" className="bg-blue-500/15 text-blue-700 dark:text-blue-300">Entrada {new Date(v.entry_date).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</Badge>}
                    {v.expected_delivery && <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Entrega {new Date(v.expected_delivery).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</Badge>}
                    <Badge variant="outline" className={STATUS_COLORS[v.status as VehicleStatus]}>{STATUS_LABELS[v.status as VehicleStatus]}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
