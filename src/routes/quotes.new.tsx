import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Search, User, Car, Wrench, Package, Camera, ImageIcon, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { fmtBRL } from "@/lib/format";
import { VehiclePhotos } from "@/components/vehicle-photos";
import { VehicleDiagram, type DiagramMark } from "@/components/vehicle-diagram";

export const Route = createFileRoute("/quotes/new")({
  component: () => (
    <AppLayout>
      <NewQuote />
    </AppLayout>
  ),
});

const QUICK_SERVICES = [
  "Funilaria", "Pintura", "Polimento", "Cristalização", "Martelinho de Ouro",
  "Troca de Peças", "Alinhamento", "Balanceamento", "Mecânica", "Elétrica",
];

type Item = { description: string; quantity: number; unit_price: number };

function NewQuote() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Client
  const [clientId, setClientId] = React.useState<string | null>(null);
  const [clientSearch, setClientSearch] = React.useState("");
  const [client, setClient] = React.useState({
    name: "", document: "", phone: "", whatsapp: "", email: "", address: "",
  });

  // Vehicle
  const [vehicleId, setVehicleId] = React.useState<string | null>(null);
  const [plateSearch, setPlateSearch] = React.useState("");
  const [vehicle, setVehicle] = React.useState({
    plate: "", brand: "", model: "", year: "", color: "", mileage: "", chassis: "", insurer: "", claim_number: "",
  });

  // Services & parts
  const [quickServices, setQuickServices] = React.useState<string[]>([]);
  const [customServices, setCustomServices] = React.useState<Item[]>([]);
  const [parts, setParts] = React.useState<Item[]>([]);

  // Financial
  const [discount, setDiscount] = React.useState(0);
  const [discountType, setDiscountType] = React.useState<"valor" | "percent">("valor");
  const [validUntil, setValidUntil] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Diagram
  const [diagram, setDiagram] = React.useState<DiagramMark[]>([]);

  const [saving, setSaving] = React.useState(false);

  // search results
  const { data: clientHits = [] } = useQuery({
    queryKey: ["client-search", clientSearch],
    enabled: clientSearch.trim().length >= 2,
    queryFn: async () => {
      const s = `%${clientSearch}%`;
      const { data } = await supabase
        .from("clients")
        .select("*")
        .or(`name.ilike.${s},phone.ilike.${s},document.ilike.${s},whatsapp.ilike.${s}`)
        .limit(8);
      return data ?? [];
    },
  });

  const { data: vehicleHits = [] } = useQuery({
    queryKey: ["vehicle-search", plateSearch],
    enabled: plateSearch.trim().length >= 2,
    queryFn: async () => {
      const s = `%${plateSearch}%`;
      const { data } = await supabase
        .from("vehicles")
        .select("*, clients(name)")
        .or(`plate.ilike.${s},brand.ilike.${s},model.ilike.${s}`)
        .limit(8);
      return data ?? [];
    },
  });

  function selectClient(c: any) {
    setClientId(c.id);
    setClient({
      name: c.name ?? "", document: c.document ?? "", phone: c.phone ?? "",
      whatsapp: c.whatsapp ?? "", email: c.email ?? "", address: c.address ?? "",
    });
    setClientSearch("");
  }

  function selectVehicle(v: any) {
    setVehicleId(v.id);
    setVehicle({
      plate: v.plate ?? "", brand: v.brand ?? "", model: v.model ?? "",
      year: v.year?.toString() ?? "", color: v.color ?? "", mileage: v.mileage?.toString() ?? "",
      chassis: v.chassis ?? "", insurer: v.insurer ?? "", claim_number: v.claim_number ?? "",
    });
    if (v.client_id && !clientId) {
      // auto-load client
      supabase.from("clients").select("*").eq("id", v.client_id).single().then(({ data }) => data && selectClient(data));
    }
    setPlateSearch("");
  }

  function toggleQuick(name: string) {
    setQuickServices((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));
  }

  // totals
  const laborTotal =
    quickServices.length * 0 + // quick services are description-only, value 0 default; user can convert to custom
    customServices.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const partsTotal = parts.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const subtotal = laborTotal + partsTotal;
  const discountValue = discountType === "percent" ? (subtotal * discount) / 100 : discount;
  const total = Math.max(0, subtotal - discountValue);

  async function upsertClient(): Promise<string | null> {
    if (clientId) {
      const { error } = await supabase.from("clients").update(client).eq("id", clientId);
      if (error) { toast.error(error.message); return null; }
      return clientId;
    }
    if (!client.name.trim()) { toast.error("Informe o nome do cliente"); return null; }
    const { data, error } = await supabase.from("clients").insert({ ...client, created_by: user?.id }).select("id").single();
    if (error) { toast.error(error.message); return null; }
    setClientId(data.id);
    return data.id;
  }

  async function upsertVehicle(clientUuid: string): Promise<string | null> {
    const payload: any = {
      plate: vehicle.plate.toUpperCase(), brand: vehicle.brand, model: vehicle.model,
      year: vehicle.year ? +vehicle.year : null, color: vehicle.color || null,
      mileage: vehicle.mileage ? +vehicle.mileage : null, chassis: vehicle.chassis || null,
      insurer: vehicle.insurer || null, claim_number: vehicle.claim_number || null,
      client_id: clientUuid,
    };
    if (vehicleId) {
      const { error } = await supabase.from("vehicles").update(payload).eq("id", vehicleId);
      if (error) { toast.error(error.message); return null; }
      return vehicleId;
    }
    if (!vehicle.plate.trim() || !vehicle.brand.trim() || !vehicle.model.trim()) {
      toast.error("Informe placa, marca e modelo do veículo"); return null;
    }
    const { data, error } = await supabase.from("vehicles").insert({ ...payload, created_by: user?.id }).select("id").single();
    if (error) { toast.error(error.message); return null; }
    setVehicleId(data.id);
    return data.id;
  }

  async function saveDraft(redirect = true) {
    setSaving(true);
    try {
      const cId = await upsertClient();
      if (!cId) return;
      const vId = await upsertVehicle(cId);
      if (!vId) return;

      const allServices: Item[] = [
        ...quickServices.map((s) => ({ description: s, quantity: 1, unit_price: 0 })),
        ...customServices.filter((c) => c.description.trim()),
      ];
      const allParts = parts.filter((p) => p.description.trim());

      const { data: q, error } = await supabase.from("quotes").insert({
        client_id: cId, vehicle_id: vId,
        description: notes || null, notes: notes || null,
        labor_total: laborTotal, parts_total: partsTotal,
        discount: discountValue, discount_type: discountType, total,
        valid_until: validUntil || null, diagram_marks: diagram as any,
        created_by: user?.id,
      }).select("id").single();
      if (error) { toast.error(error.message); return; }

      const items = [
        ...allServices.map((i) => ({ quote_id: q.id, item_type: "servico" as const, description: i.description, quantity: i.quantity, unit_price: i.unit_price, total: i.quantity * i.unit_price })),
        ...allParts.map((i) => ({ quote_id: q.id, item_type: "peca" as const, description: i.description, quantity: i.quantity, unit_price: i.unit_price, total: i.quantity * i.unit_price })),
      ];
      if (items.length) {
        const { error: e2 } = await supabase.from("quote_items").insert(items);
        if (e2) toast.error(e2.message);
      }
      toast.success("Orçamento salvo");
      if (redirect) navigate({ to: "/quotes/$id", params: { id: q.id } });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon"><Link to="/quotes"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Novo Orçamento</h1>
          <p className="text-sm text-muted-foreground">Cliente, veículo, serviços e vistoria — tudo em uma tela.</p>
        </div>
        <Button onClick={() => saveDraft(true)} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />{saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cliente */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4" />Cliente {clientId && <Badge variant="outline">Vinculado</Badge>}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nome, telefone ou CPF..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
              {clientSearch.length >= 2 && clientHits.length > 0 && (
                <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
                  {(clientHits as any[]).map((c) => (
                    <button key={c.id} type="button" onClick={() => selectClient(c)} className="block w-full px-3 py-2 text-left text-sm hover:bg-accent">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.phone ?? "—"} · {c.document ?? "—"}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome *</Label><Input value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} /></div>
              <div><Label>CPF/CNPJ</Label><Input value={client.document} onChange={(e) => setClient({ ...client, document: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} /></div>
              <div><Label>WhatsApp</Label><Input value={client.whatsapp} onChange={(e) => setClient({ ...client, whatsapp: e.target.value })} placeholder="(11) 99999-0000" /></div>
              <div><Label>E-mail</Label><Input type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} /></div>
              <div className="col-span-2"><Label>Endereço</Label><Input value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} /></div>
            </div>
            {clientId && (
              <Button variant="ghost" size="sm" onClick={() => { setClientId(null); setClient({ name: "", document: "", phone: "", whatsapp: "", email: "", address: "" }); }}>
                Limpar e cadastrar novo
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Veículo */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Car className="h-4 w-4" />Veículo {vehicleId && <Badge variant="outline">Vinculado</Badge>}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por placa, marca ou modelo..." value={plateSearch} onChange={(e) => setPlateSearch(e.target.value)} />
              {plateSearch.length >= 2 && vehicleHits.length > 0 && (
                <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
                  {(vehicleHits as any[]).map((v) => (
                    <button key={v.id} type="button" onClick={() => selectVehicle(v)} className="block w-full px-3 py-2 text-left text-sm hover:bg-accent">
                      <div className="font-medium">{v.brand} {v.model} <span className="font-mono text-xs text-muted-foreground">· {v.plate}</span></div>
                      <div className="text-xs text-muted-foreground">{v.clients?.name ?? "—"}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Placa *</Label><Input className="uppercase font-mono" value={vehicle.plate} onChange={(e) => setVehicle({ ...vehicle, plate: e.target.value })} /></div>
              <div><Label>Cor</Label><Input value={vehicle.color} onChange={(e) => setVehicle({ ...vehicle, color: e.target.value })} /></div>
              <div><Label>Marca *</Label><Input value={vehicle.brand} onChange={(e) => setVehicle({ ...vehicle, brand: e.target.value })} /></div>
              <div><Label>Modelo *</Label><Input value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} /></div>
              <div><Label>Ano</Label><Input type="number" value={vehicle.year} onChange={(e) => setVehicle({ ...vehicle, year: e.target.value })} /></div>
              <div><Label>KM</Label><Input type="number" value={vehicle.mileage} onChange={(e) => setVehicle({ ...vehicle, mileage: e.target.value })} /></div>
              <div className="col-span-2"><Label>Chassi</Label><Input value={vehicle.chassis} onChange={(e) => setVehicle({ ...vehicle, chassis: e.target.value })} /></div>
              <div><Label>Seguradora</Label><Input value={vehicle.insurer} onChange={(e) => setVehicle({ ...vehicle, insurer: e.target.value })} /></div>
              <div><Label>Nº Sinistro</Label><Input value={vehicle.claim_number} onChange={(e) => setVehicle({ ...vehicle, claim_number: e.target.value })} /></div>
            </div>
            {vehicleId && (
              <Button variant="ghost" size="sm" onClick={() => { setVehicleId(null); setVehicle({ plate: "", brand: "", model: "", year: "", color: "", mileage: "", chassis: "", insurer: "", claim_number: "" }); }}>
                Limpar e cadastrar novo
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Serviços */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4" />Serviços</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2 block text-xs uppercase text-muted-foreground">Serviços rápidos</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {QUICK_SERVICES.map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:bg-accent">
                  <Checkbox checked={quickServices.includes(s)} onCheckedChange={() => toggleQuick(s)} />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs uppercase text-muted-foreground">Serviços personalizados</Label>
              <Button size="sm" variant="outline" onClick={() => setCustomServices([...customServices, { description: "", quantity: 1, unit_price: 0 }])}>
                <Plus className="mr-1 h-3 w-3" />Adicionar Serviço
              </Button>
            </div>
            <ItemList items={customServices} onChange={setCustomServices} placeholder="Ex.: Reparar para-choque dianteiro" />
          </div>
        </CardContent>
      </Card>

      {/* Peças */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" />Peças</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setParts([...parts, { description: "", quantity: 1, unit_price: 0 }])}>
              <Plus className="mr-1 h-3 w-3" />Adicionar Peça
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ItemList items={parts} onChange={setParts} placeholder="Ex.: Paralama dianteiro" />
        </CardContent>
      </Card>

      {/* Diagrama */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4" />Diagrama do veículo</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">Selecione uma vista e clique sobre o desenho para marcar áreas danificadas.</p>
          <VehicleDiagram value={diagram} onChange={setDiagram} />
        </CardContent>
      </Card>

      {/* Fotos */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Camera className="h-4 w-4" />Fotos e vistoria</CardTitle></CardHeader>
        <CardContent>
          {vehicleId ? (
            <VehiclePhotos vehicleId={vehicleId} />
          ) : (
            <div className="rounded-md border-2 border-dashed py-8 text-center text-sm text-muted-foreground">
              Salve o veículo primeiro para anexar fotos com marcação de danos.
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={async () => {
                  const cId = await upsertClient(); if (!cId) return;
                  await upsertVehicle(cId);
                }}>
                  Salvar cliente e veículo
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Financeiro */}
      <Card>
        <CardHeader><CardTitle className="text-base">Resumo financeiro</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <div>
                <Label>Validade até</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Garantia, condições..." />
              </div>
            </div>
            <div className="space-y-2 rounded-md border bg-muted/30 p-4">
              <Row label="Mão de obra" value={fmtBRL(laborTotal)} />
              <Row label="Peças" value={fmtBRL(partsTotal)} />
              <Row label="Subtotal" value={fmtBRL(subtotal)} />
              <div className="flex items-center gap-2">
                <Label className="flex-1 text-sm">Desconto</Label>
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value as any)} className="h-8 rounded-md border bg-background px-2 text-sm">
                  <option value="valor">R$</option>
                  <option value="percent">%</option>
                </select>
                <Input type="number" min="0" step="0.01" className="w-28" value={discount} onChange={(e) => setDiscount(+e.target.value || 0)} />
              </div>
              <Row label="Desconto aplicado" value={`- ${fmtBRL(discountValue)}`} />
              <div className="flex items-center justify-between border-t pt-2 text-lg font-semibold">
                <span>Total</span><span>{fmtBRL(total)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 z-20 flex justify-end gap-2">
        <Button variant="outline" asChild><Link to="/quotes">Cancelar</Link></Button>
        <Button size="lg" onClick={() => saveDraft(true)} disabled={saving} className="shadow-lg">
          <Save className="mr-2 h-4 w-4" />{saving ? "Salvando..." : "Salvar Orçamento"}
        </Button>
      </div>
    </div>
  );
}

function ItemList({ items, onChange, placeholder }: { items: Item[]; onChange: (v: Item[]) => void; placeholder: string }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum item adicionado.</p>;
  }
  function update(i: number, patch: Partial<Item>) { onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it))); }
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-12 gap-2">
          <Input className="col-span-12 sm:col-span-6" placeholder={placeholder} value={it.description} onChange={(e) => update(i, { description: e.target.value })} />
          <Input className="col-span-4 sm:col-span-2" type="number" min="0" step="0.01" placeholder="Qtd" value={it.quantity} onChange={(e) => update(i, { quantity: +e.target.value || 0 })} />
          <Input className="col-span-4 sm:col-span-2" type="number" min="0" step="0.01" placeholder="Unitário" value={it.unit_price} onChange={(e) => update(i, { unit_price: +e.target.value || 0 })} />
          <div className="col-span-3 sm:col-span-1 flex items-center justify-end px-2 text-sm font-medium">{fmtBRL(it.quantity * it.unit_price)}</div>
          <Button variant="ghost" size="icon" className="col-span-1" onClick={() => onChange(items.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}
