import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { fmtBRL } from "@/lib/format";
import { MultiSelect } from "@/components/multi-select";
import { useCategories, useCreateCategory } from "@/hooks/use-categories";

export const Route = createFileRoute("/orders/new")({ component: () => <AppLayout><NewOrder /></AppLayout> });

type Item = { item_type: "servico" | "peca"; description: string; quantity: number; unit_price: number };

function NewOrder() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vehicleId, setVehicleId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [discount, setDiscount] = React.useState(0);
  const [items, setItems] = React.useState<Item[]>([{ item_type: "servico", description: "", quantity: 1, unit_price: 0 }]);
  const [selectedServices, setSelectedServices] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const { data: serviceCats = [] } = useCategories("servico");
  const createCat = useCreateCategory();

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles-select"],
    queryFn: async () => {
      const { data } = await supabase.from("vehicles").select("id, brand, model, plate, client_id, clients(name)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const labor = items.filter(i => i.item_type === "servico").reduce((s, i) => s + (i.quantity * i.unit_price), 0);
  const parts = items.filter(i => i.item_type === "peca").reduce((s, i) => s + (i.quantity * i.unit_price), 0);
  const total = Math.max(0, labor + parts - discount);

  function update(i: number, patch: Partial<Item>) { setItems(items.map((it, k) => k === i ? { ...it, ...patch } : it)); }
  function addItem(type: "servico" | "peca") { setItems([...items, { item_type: type, description: "", quantity: 1, unit_price: 0 }]); }
  function removeItem(i: number) { setItems(items.filter((_, k) => k !== i)); }

  async function save() {
    if (!vehicleId) return toast.error("Selecione um veículo");
    const vehicle = (vehicles as any[]).find(v => v.id === vehicleId);
    setSaving(true);
    const { data: order, error } = await supabase.from("service_orders").insert({
      vehicle_id: vehicleId, client_id: vehicle.client_id, description, labor_total: labor, parts_total: parts, discount, total, created_by: user?.id,
    }).select("id").single();
    if (error) { setSaving(false); return toast.error(error.message); }
    const validItems = items.filter(i => i.description.trim());
    if (validItems.length) {
      const { error: e2 } = await supabase.from("service_order_items").insert(
        validItems.map(i => ({ order_id: order.id, item_type: i.item_type, description: i.description, quantity: i.quantity, unit_price: i.unit_price, total: i.quantity * i.unit_price }))
      );
      if (e2) toast.error(e2.message);
    }
    toast.success("OS criada");
    navigate({ to: "/orders/$id", params: { id: order.id } });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/orders" })}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nova Ordem de Serviço</h1>
          <p className="text-sm text-muted-foreground">Cadastre serviços, peças e gere a OS.</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Veículo e descrição</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Veículo *</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue placeholder="Selecione um veículo" /></SelectTrigger>
              <SelectContent>
                {(vehicles as any[]).map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.brand} {v.model} · {v.plate} · {v.clients?.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Serviços a realizar (multi-seleção)</Label>
            <MultiSelect
              options={(serviceCats as any[]).map((c) => ({ value: c.id, label: c.name, color: c.color }))}
              value={selectedServices}
              onChange={(v) => {
                setSelectedServices(v);
                // sync to items list — preserve manually entered items, add new service rows
                const existingDescs = new Set(items.map((i) => i.description.toLowerCase()));
                const toAdd = (serviceCats as any[])
                  .filter((c) => v.includes(c.id) && !existingDescs.has(c.name.toLowerCase()))
                  .map((c) => ({ item_type: "servico" as const, description: c.name, quantity: 1, unit_price: 0 }));
                if (toAdd.length) setItems([...items.filter((i) => i.description.trim()), ...toAdd]);
              }}
              onCreate={(name) => createCat("servico", name)}
              placeholder="Selecione serviços..."
              createLabel="Cadastrar serviço"
            />
          </div>
          <div>
            <Label>Descrição geral do serviço</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Reparo de para-choque dianteiro, pintura da porta..." />
          </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Itens</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => addItem("servico")}><Plus className="mr-1 h-3 w-3" />Serviço</Button>
              <Button variant="outline" size="sm" onClick={() => addItem("peca")}><Plus className="mr-1 h-3 w-3" />Peça</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <Select value={it.item_type} onValueChange={(v) => update(i, { item_type: v as any })}>
                  <SelectTrigger className="col-span-3 sm:col-span-2"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="servico">Serviço</SelectItem><SelectItem value="peca">Peça</SelectItem></SelectContent>
                </Select>
                <Input className="col-span-9 sm:col-span-5" placeholder="Descrição" value={it.description} onChange={(e) => update(i, { description: e.target.value })} />
                <Input className="col-span-4 sm:col-span-2" type="number" min="0" step="0.01" placeholder="Qtd" value={it.quantity} onChange={(e) => update(i, { quantity: +e.target.value })} />
                <Input className="col-span-6 sm:col-span-2" type="number" min="0" step="0.01" placeholder="Preço" value={it.unit_price} onChange={(e) => update(i, { unit_price: +e.target.value })} />
                <Button variant="ghost" size="icon" className="col-span-2 sm:col-span-1" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-2 border-t pt-4 sm:max-w-xs sm:ml-auto">
            <Row label="Mão de obra" value={fmtBRL(labor)} />
            <Row label="Peças" value={fmtBRL(parts)} />
            <div className="flex items-center justify-between">
              <Label className="text-sm">Desconto</Label>
              <Input type="number" min="0" step="0.01" className="w-32" value={discount} onChange={(e) => setDiscount(+e.target.value)} />
            </div>
            <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span><span>{fmtBRL(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/orders" })}>Cancelar</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar OS"}</Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}
