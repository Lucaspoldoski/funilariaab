import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { STATUS_COLORS, STATUS_LABELS, VEHICLE_STATUSES, type VehicleStatus } from "@/lib/vehicle-status";
import { VehiclePhotos } from "@/components/vehicle-photos";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/vehicles/$id")({
  component: () => <AppLayout><VehicleDetail /></AppLayout>,
});

function VehicleDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*, clients(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["vehicle-history", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_status_history")
        .select("*")
        .eq("vehicle_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function updateStatus(status: string) {
    const { error } = await supabase.from("vehicles").update({ status: status as VehicleStatus }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado");
    qc.invalidateQueries({ queryKey: ["vehicle", id] });
    qc.invalidateQueries({ queryKey: ["vehicle-history", id] });
  }

  async function remove() {
    if (!confirm("Excluir este veículo?")) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Veículo removido");
    navigate({ to: "/vehicles" });
  }

  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!vehicle) return <p className="text-muted-foreground">Veículo não encontrado.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon"><Link to="/vehicles"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{vehicle.brand} {vehicle.model}</h1>
            <p className="text-sm text-muted-foreground">Placa <span className="font-mono">{vehicle.plate}</span> · {vehicle.clients?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={STATUS_COLORS[vehicle.status as VehicleStatus]}>
            {STATUS_LABELS[vehicle.status as VehicleStatus]}
          </Badge>
          <Select value={vehicle.status} onValueChange={updateStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VEHICLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Dados do veículo</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Info label="Marca" value={vehicle.brand} />
            <Info label="Modelo" value={vehicle.model} />
            <Info label="Ano" value={vehicle.year ?? "—"} />
            <Info label="Cor" value={vehicle.color ?? "—"} />
            <Info label="Chassi" value={vehicle.chassis ?? "—"} />
            <Info label="Quilometragem" value={vehicle.mileage ?? "—"} />
            <Info label="Seguradora" value={vehicle.insurer ?? "—"} />
            <Info label="Nº sinistro" value={vehicle.claim_number ?? "—"} />
            <Info label="Data de entrada" value={vehicle.entry_date ?? "—"} />
            <Info label="Previsão de entrega" value={vehicle.expected_delivery ?? "—"} />
            {vehicle.notes && <div className="sm:col-span-2"><Info label="Observações" value={vehicle.notes} /></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Info label="Nome" value={vehicle.clients?.name} />
            <Info label="Telefone" value={vehicle.clients?.phone ?? "—"} />
            <Info label="E-mail" value={vehicle.clients?.email ?? "—"} />
            <Info label="Documento" value={vehicle.clients?.document ?? "—"} />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="photos">Fotos</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline">
          <Card>
            <CardHeader><CardTitle>Timeline do veículo</CardTitle></CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem alterações registradas.</p>
              ) : (
                <ol className="relative space-y-4 border-l-2 border-border pl-5">
                  {history.map((h: any) => (
                    <li key={h.id} className="relative">
                      <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {h.old_status && <Badge variant="outline">{STATUS_LABELS[h.old_status as VehicleStatus]}</Badge>}
                        <span className="text-muted-foreground">→</span>
                        <Badge variant="outline" className={STATUS_COLORS[h.new_status as VehicleStatus]}>
                          {STATUS_LABELS[h.new_status as VehicleStatus]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="photos">
          <Card>
            <CardHeader><CardTitle>Fotos do veículo</CardTitle></CardHeader>
            <CardContent><VehiclePhotos vehicleId={id} /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
