import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, FileText } from "lucide-react";
import { fmtBRL, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/orders")({ component: () => <AppLayout><OrdersList /></AppLayout> });

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho", aprovada: "Aprovada", em_execucao: "Em execução", concluida: "Concluída", cancelada: "Cancelada",
};
const STATUS_TONE: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  aprovada: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  em_execucao: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  concluida: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  cancelada: "bg-red-500/15 text-red-600 dark:text-red-400",
};

function OrdersList() {
  const [q, setQ] = React.useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id, number, status, total, created_at, vehicle_id, vehicles(brand,model,plate), clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const filtered = (data as any[]).filter((o) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return String(o.number).includes(s) || o.clients?.name?.toLowerCase().includes(s) || o.vehicles?.plate?.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ordens de Serviço</h1>
          <p className="text-sm text-muted-foreground">Gere, acompanhe e finalize OS com assinatura do cliente.</p>
        </div>
        <Button asChild><Link to="/orders/new"><Plus className="mr-2 h-4 w-4" />Nova OS</Link></Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar por nº, cliente ou placa..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card>
        <CardHeader><CardTitle>{filtered.length} ordem(ns)</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
            : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhuma OS cadastrada.</p>
                <Button asChild className="mt-3"><Link to="/orders/new">Criar primeira OS</Link></Button>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="py-2 pr-3">Nº</th><th className="py-2 pr-3">Cliente / Veículo</th><th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3 text-right">Total</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((o) => (
                      <tr key={o.id} className="hover:bg-muted/40">
                        <td className="py-3 pr-3 font-mono">
                          <Link to="/orders/$id" params={{ id: o.id }} className="font-medium hover:underline">#{o.number}</Link>
                        </td>
                        <td className="py-3 pr-3">
                          <div className="font-medium">{o.clients?.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{o.vehicles?.brand} {o.vehicles?.model} · {o.vehicles?.plate}</div>
                        </td>
                        <td className="py-3 pr-3 text-muted-foreground">{fmtDate(o.created_at)}</td>
                        <td className="py-3 pr-3"><Badge variant="outline" className={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge></td>
                        <td className="py-3 pr-3 text-right font-medium">{fmtBRL(o.total)}</td>
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
