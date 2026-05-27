import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { STATUS_COLORS, STATUS_LABELS, VEHICLE_STATUSES, type VehicleStatus } from "@/lib/vehicle-status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/vehicles/")({ component: () => <AppLayout><VehiclesList /></AppLayout> });

function VehiclesList() {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<string>("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, brand, model, year, color, plate, status, entry_date, expected_delivery, clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = data.filter((v: any) => {
    if (status !== "all" && v.status !== status) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      v.brand?.toLowerCase().includes(s) ||
      v.model?.toLowerCase().includes(s) ||
      v.plate?.toLowerCase().includes(s) ||
      v.clients?.name?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Veículos</h1>
          <p className="text-sm text-muted-foreground">Gerencie todos os veículos em manutenção.</p>
        </div>
        <Button asChild><Link to="/vehicles/new"><Plus className="mr-2 h-4 w-4" />Novo veículo</Link></Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar marca, modelo, placa ou cliente..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {VEHICLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle>{filtered.length} veículo(s)</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">Nenhum veículo encontrado.</p>
              <Button asChild className="mt-3"><Link to="/vehicles/new">Cadastrar primeiro veículo</Link></Button>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Veículo</th>
                    <th className="py-2 pr-3 font-medium">Placa</th>
                    <th className="py-2 pr-3 font-medium">Cliente</th>
                    <th className="py-2 pr-3 font-medium">Entrada</th>
                    <th className="py-2 pr-3 font-medium">Previsão</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((v: any) => (
                    <tr key={v.id} className="hover:bg-muted/40">
                      <td className="py-3 pr-3">
                        <Link to="/vehicles/$id" params={{ id: v.id }} className="font-medium hover:underline">
                          {v.brand} {v.model}
                        </Link>
                        <div className="text-xs text-muted-foreground">{v.year ?? "—"} · {v.color ?? "—"}</div>
                      </td>
                      <td className="py-3 pr-3 font-mono text-xs">{v.plate}</td>
                      <td className="py-3 pr-3">{v.clients?.name ?? "—"}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{v.entry_date ?? "—"}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{v.expected_delivery ?? "—"}</td>
                      <td className="py-3 pr-3">
                        <Badge variant="outline" className={STATUS_COLORS[v.status as VehicleStatus]}>
                          {STATUS_LABELS[v.status as VehicleStatus]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
