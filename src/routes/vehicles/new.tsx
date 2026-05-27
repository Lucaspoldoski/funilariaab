import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { VEHICLE_STATUSES, STATUS_LABELS } from "@/lib/vehicle-status";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/vehicles/new")({ component: () => <AppLayout><NewVehicle /></AppLayout> });

function NewVehicle() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [clientId, setClientId] = React.useState<string>("");
  const [status, setStatus] = React.useState("aguardando");
  const [newClient, setNewClient] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const { data: clients = [], refetch: refetchClients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    let finalClientId = clientId;
    try {
      if (newClient) {
        const { data, error } = await supabase.from("clients").insert({
          name: String(fd.get("client_name") ?? ""),
          phone: String(fd.get("client_phone") ?? "") || null,
          email: String(fd.get("client_email") ?? "") || null,
          document: String(fd.get("client_document") ?? "") || null,
          created_by: user?.id,
        }).select("id").single();
        if (error) throw error;
        finalClientId = data.id;
        refetchClients();
      }
      if (!finalClientId) { toast.error("Selecione ou cadastre um cliente"); setBusy(false); return; }

      const { data: vehicle, error } = await supabase.from("vehicles").insert({
        client_id: finalClientId,
        brand: String(fd.get("brand")),
        model: String(fd.get("model")),
        year: fd.get("year") ? Number(fd.get("year")) : null,
        color: String(fd.get("color") ?? "") || null,
        plate: String(fd.get("plate")).toUpperCase(),
        chassis: String(fd.get("chassis") ?? "") || null,
        mileage: fd.get("mileage") ? Number(fd.get("mileage")) : null,
        insurer: String(fd.get("insurer") ?? "") || null,
        claim_number: String(fd.get("claim_number") ?? "") || null,
        status,
        entry_date: String(fd.get("entry_date") ?? "") || null,
        expected_delivery: String(fd.get("expected_delivery") ?? "") || null,
        notes: String(fd.get("notes") ?? "") || null,
        created_by: user?.id,
      }).select("id").single();
      if (error) throw error;
      toast.success("Veículo cadastrado!");
      navigate({ to: "/vehicles/$id", params: { id: vehicle.id } });
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao cadastrar");
    } finally { setBusy(false); }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo veículo</h1>
        <p className="text-sm text-muted-foreground">Cadastre o cliente e os dados do veículo.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Cliente</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button type="button" variant={newClient ? "outline" : "default"} size="sm" onClick={() => setNewClient(false)}>Selecionar existente</Button>
            <Button type="button" variant={newClient ? "default" : "outline"} size="sm" onClick={() => setNewClient(true)}>Cadastrar novo</Button>
          </div>
          {newClient ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Nome</Label><Input name="client_name" required /></div>
              <div><Label>CPF / CNPJ</Label><Input name="client_document" /></div>
              <div><Label>Telefone</Label><Input name="client_phone" /></div>
              <div><Label>E-mail</Label><Input name="client_email" type="email" /></div>
            </div>
          ) : (
            <div>
              <Label>Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Veículo</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div><Label>Marca *</Label><Input name="brand" required /></div>
          <div><Label>Modelo *</Label><Input name="model" required /></div>
          <div><Label>Ano</Label><Input name="year" type="number" min={1900} max={2100} /></div>
          <div><Label>Cor</Label><Input name="color" /></div>
          <div><Label>Placa *</Label><Input name="plate" required className="uppercase" /></div>
          <div><Label>Chassi</Label><Input name="chassis" /></div>
          <div><Label>Quilometragem</Label><Input name="mileage" type="number" /></div>
          <div><Label>Seguradora</Label><Input name="insurer" /></div>
          <div><Label>Nº do sinistro</Label><Input name="claim_number" /></div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VEHICLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Data de entrada</Label><Input name="entry_date" type="date" defaultValue={today} /></div>
          <div><Label>Previsão de entrega</Label><Input name="expected_delivery" type="date" /></div>
          <div className="sm:col-span-2 lg:col-span-3"><Label>Observações</Label><Textarea name="notes" rows={3} /></div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/vehicles" })}>Cancelar</Button>
        <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar veículo"}</Button>
      </div>
    </form>
  );
}
