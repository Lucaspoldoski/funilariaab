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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Plus, Trash2, Search, User, Car, Wrench, Package, Camera,
  ImageIcon, Save, MessageCircle, Printer, CheckCircle2, Phone, Mail, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { fmtBRL, fmtDate } from "@/lib/format";
import { VehiclePhotos } from "@/components/vehicle-photos";
import { VehicleDiagram, type DiagramMark } from "@/components/vehicle-diagram";
import { QuoteProgress } from "@/components/quote-progress";

export const Route = createFileRoute("/quotes/new")({
  component: () => (
    <AppLayout>
      <NewQuote />
    </AppLayout>
  ),
});

const QUICK_SERVICES = [
  "Funilaria", "Pintura", "Polimento", "Cristalização", "Martelinho de Ouro",
  "Mecânica", "Elétrica", "Higienização", "Alinhamento", "Balanceamento",
];

const PAYMENT_METHODS = [
  "Dinheiro", "PIX", "Débito", "Crédito à vista", "Crédito parcelado", "Boleto", "Transferência",
];

type Item = { description: string; category?: string; quantity: number; unit_price: number; notes?: string };

function NewQuote() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Client
  const [clientId, setClientId] = React.useState<string | null>(null);
  const [clientSearch, setClientSearch] = React.useState("");
  const [showClientForm, setShowClientForm] = React.useState(false);
  const [client, setClient] = React.useState({
    name: "", document: "", phone: "", whatsapp: "", email: "",
    cep: "", address: "", neighborhood: "", city: "", state: "", notes: "",
  });

  // Vehicle
  const [vehicleId, setVehicleId] = React.useState<string | null>(null);
  const [plateSearch, setPlateSearch] = React.useState("");
  const [showVehicleForm, setShowVehicleForm] = React.useState(false);
  const [vehicle, setVehicle] = React.useState({
    plate: "", brand: "", model: "", version: "", year: "", color: "",
    fuel: "", mileage: "", chassis: "", renavam: "", insurer: "", claim_number: "",
  });

  // Services & parts
  const [quickServices, setQuickServices] = React.useState<string[]>([]);
  const [customServices, setCustomServices] = React.useState<Item[]>([]);
  const [parts, setParts] = React.useState<Item[]>([]);

  // Financial
  const [discount, setDiscount] = React.useState(0);
  const [discountType, setDiscountType] = React.useState<"valor" | "percent">("valor");
  const [validUntil, setValidUntil] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("");
  const [paymentTerms, setPaymentTerms] = React.useState("");
  const [warranty, setWarranty] = React.useState("90 dias");
  const [deliveryForecast, setDeliveryForecast] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Diagram
  const [diagram, setDiagram] = React.useState<DiagramMark[]>([]);

  const [quoteId, setQuoteId] = React.useState<string | null>(null);
  const [quoteNumber, setQuoteNumber] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Client search
  const { data: clientHits = [] } = useQuery({
    queryKey: ["client-search", clientSearch],
    enabled: clientSearch.trim().length >= 2 && !clientId,
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

  // Aggregates for selected client
  const { data: clientAgg } = useQuery({
    queryKey: ["client-agg", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const [{ count: vehCount }, lastQ] = await Promise.all([
        supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("client_id", clientId!),
        supabase.from("quotes").select("number, created_at, total").eq("client_id", clientId!).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { vehicleCount: vehCount ?? 0, lastQuote: lastQ.data };
    },
  });

  // Vehicle search
  const { data: vehicleHits = [] } = useQuery({
    queryKey: ["vehicle-search", plateSearch],
    enabled: plateSearch.trim().length >= 2 && !vehicleId,
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
      whatsapp: c.whatsapp ?? "", email: c.email ?? "", cep: c.cep ?? "",
      address: c.address ?? "", neighborhood: c.neighborhood ?? "",
      city: c.city ?? "", state: c.state ?? "", notes: c.notes ?? "",
    });
    setClientSearch("");
    setShowClientForm(false);
  }

  function selectVehicle(v: any) {
    setVehicleId(v.id);
    setVehicle({
      plate: v.plate ?? "", brand: v.brand ?? "", model: v.model ?? "",
      version: v.version ?? "", year: v.year?.toString() ?? "",
      color: v.color ?? "", fuel: v.fuel ?? "",
      mileage: v.mileage?.toString() ?? "", chassis: v.chassis ?? "",
      renavam: v.renavam ?? "", insurer: v.insurer ?? "", claim_number: v.claim_number ?? "",
    });
    if (v.client_id && !clientId) {
      supabase.from("clients").select("*").eq("id", v.client_id).single().then(({ data }) => data && selectClient(data));
    }
    setPlateSearch("");
    setShowVehicleForm(false);
  }

  function toggleQuick(name: string) {
    setQuickServices((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));
  }

  // Totals
  const laborTotal = customServices.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const partsTotal = parts.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const subtotal = laborTotal + partsTotal;
  const discountValue = discountType === "percent" ? (subtotal * discount) / 100 : discount;
  const total = Math.max(0, subtotal - discountValue);

  // Progress checks
  const progress = {
    client: !!clientId || (!!client.name.trim() && !!client.phone.trim()),
    vehicle: !!vehicleId || (!!vehicle.plate.trim() && !!vehicle.brand.trim() && !!vehicle.model.trim()),
    photos: false, // updated when vehicleId saved -> we count via photoCount below
    items: quickServices.length + customServices.length + parts.length > 0,
    financial: total > 0,
  };

  const { data: photoCount = 0 } = useQuery({
    queryKey: ["photo-count", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { count } = await supabase.from("vehicle_photos").select("id", { count: "exact", head: true }).eq("quote_id", quoteId!);
      return count ?? 0;
    },
    refetchInterval: 4000,
  });
  progress.photos = (photoCount ?? 0) > 0;

  // Auto-save every 10s once the quote has been created (has id)
  const saveRef = React.useRef<((opts?: { silent?: boolean }) => Promise<any>) | null>(null);
  React.useEffect(() => {
    if (!quoteId) return;
    const t = setInterval(() => { saveRef.current?.({ silent: true }); }, 10000);
    return () => clearInterval(t);
  }, [quoteId]);

  async function upsertClient(): Promise<string | null> {
    const payload = {
      ...client,
      cep: client.cep || null, neighborhood: client.neighborhood || null,
      city: client.city || null, state: client.state || null, notes: client.notes || null,
    };
    if (clientId) {
      const { error } = await supabase.from("clients").update(payload).eq("id", clientId);
      if (error) { toast.error(error.message); return null; }
      return clientId;
    }
    if (!client.name.trim()) { toast.error("Informe o nome do cliente"); return null; }
    const { data, error } = await supabase.from("clients").insert({ ...payload, created_by: user?.id }).select("id").single();
    if (error) { toast.error(error.message); return null; }
    setClientId(data.id);
    return data.id;
  }

  async function upsertVehicle(clientUuid: string): Promise<string | null> {
    const payload: any = {
      plate: vehicle.plate.toUpperCase(), brand: vehicle.brand, model: vehicle.model,
      version: vehicle.version || null,
      year: vehicle.year ? +vehicle.year : null, color: vehicle.color || null,
      fuel: vehicle.fuel || null,
      mileage: vehicle.mileage ? +vehicle.mileage : null, chassis: vehicle.chassis || null,
      renavam: vehicle.renavam || null,
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

  /** Save / upsert the full quote (idempotent on quoteId). */
  async function saveQuote(opts: { redirect?: boolean; silent?: boolean } = {}): Promise<{ id: string; number: number } | null> {
    setSaving(true);
    try {
      const cId = await upsertClient();
      if (!cId) return null;
      const vId = await upsertVehicle(cId);
      if (!vId) return null;

      const allServices: Item[] = [
        ...quickServices.map((s) => ({ description: s, quantity: 1, unit_price: 0 })),
        ...customServices.filter((c) => c.description.trim()),
      ];
      const allParts = parts.filter((p) => p.description.trim());

      const quotePayload = {
        client_id: cId, vehicle_id: vId,
        description: notes || null, notes: notes || null,
        labor_total: laborTotal, parts_total: partsTotal,
        discount: discountValue, discount_type: discountType, total,
        valid_until: validUntil || null,
        payment_method: paymentMethod || null,
        payment_terms: paymentTerms || null,
        warranty: warranty || null,
        delivery_forecast: deliveryForecast || null,
        diagram_marks: diagram as any,
      };

      let qId = quoteId;
      let qNum = quoteNumber;
      if (qId) {
        const { error } = await supabase.from("quotes").update(quotePayload).eq("id", qId);
        if (error) { toast.error(error.message); return null; }
        await supabase.from("quote_items").delete().eq("quote_id", qId);
      } else {
        const { data, error } = await supabase.from("quotes").insert({ ...quotePayload, created_by: user?.id }).select("id, number").single();
        if (error) { toast.error(error.message); return null; }
        qId = data.id; qNum = data.number;
        setQuoteId(qId); setQuoteNumber(qNum);
        // link any photos already uploaded against the vehicle to this quote
        await supabase.from("vehicle_photos").update({ quote_id: qId }).eq("vehicle_id", vId).is("quote_id", null);
      }

      const items = [
        ...allServices.map((i) => ({ quote_id: qId!, item_type: "servico" as const, description: i.description, quantity: i.quantity, unit_price: i.unit_price, total: i.quantity * i.unit_price })),
        ...allParts.map((i) => ({ quote_id: qId!, item_type: "peca" as const, description: i.description, quantity: i.quantity, unit_price: i.unit_price, total: i.quantity * i.unit_price })),
      ];
      if (items.length) {
        const { error: e2 } = await supabase.from("quote_items").insert(items);
        if (e2) toast.error(e2.message);
      }
      if (!opts.silent) toast.success("Orçamento salvo");
      if (opts.redirect && qId) navigate({ to: "/quotes/$id", params: { id: qId } });
      return qId && qNum != null ? { id: qId, number: qNum } : null;
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = saveQuote;


  async function sendWhatsApp() {
    const saved = await saveQuote({ silent: true });
    if (!saved) return;
    const num = (client.whatsapp || client.phone || "").replace(/\D/g, "");
    if (!num) return toast.error("Cliente sem telefone/WhatsApp cadastrado");
    const url = `${window.location.origin}/quotes/${saved.id}`;
    const text = encodeURIComponent(
      `Olá ${client.name}, segue seu orçamento #${saved.number} de reparo automotivo.\n` +
      `Veículo: ${vehicle.brand} ${vehicle.model} (${vehicle.plate.toUpperCase()})\n` +
      `Valor: ${fmtBRL(total)}${validUntil ? ` (válido até ${fmtDate(validUntil)})` : ""}\n` +
      `Detalhes: ${url}\n\nQualquer dúvida estamos à disposição.`,
    );
    window.open(`https://wa.me/${num.length >= 11 ? num : `55${num}`}?text=${text}`, "_blank");
  }

  async function approveAsOrder() {
    const saved = await saveQuote({ silent: true });
    if (!saved) return;
    if (!confirm("Aprovar este orçamento e gerar uma Ordem de Serviço?")) return;
    const { data: order, error } = await supabase.from("service_orders").insert({
      client_id: clientId!, vehicle_id: vehicleId!,
      description: notes || null,
      labor_total: laborTotal, parts_total: partsTotal, discount: discountValue, total,
      status: "aprovada", created_by: user?.id,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    const { data: items } = await supabase.from("quote_items").select("*").eq("quote_id", saved.id);
    if (items && items.length) {
      await supabase.from("service_order_items").insert(
        (items as any[]).map((i) => ({
          order_id: order.id, item_type: i.item_type, description: i.description,
          quantity: i.quantity, unit_price: i.unit_price, total: i.total,
        })),
      );
    }
    await supabase.from("quotes").update({ status: "aprovado", converted_order_id: order.id }).eq("id", saved.id);
    toast.success("Ordem de Serviço criada");
    navigate({ to: "/orders/$id", params: { id: order.id } });
  }

  async function openPdf() {
    const saved = await saveQuote({ silent: true });
    if (!saved) return;
    window.open(`/quotes/${saved.id}`, "_blank");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-28">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon"><Link to="/quotes"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Novo Orçamento</h1>
          <p className="text-sm text-muted-foreground">Atendimento completo em uma única tela.</p>
        </div>
        {quoteNumber && <Badge variant="outline" className="font-mono">#{quoteNumber}</Badge>}
      </div>

      <QuoteProgress
        client={progress.client}
        vehicle={progress.vehicle}
        photos={progress.photos}
        items={progress.items}
        financial={progress.financial}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />Cliente
              {clientId && <Badge variant="outline" className="ml-auto bg-emerald-500/10 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" />Vinculado</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!clientId && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Buscar por nome, telefone, CPF ou WhatsApp..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
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
                {clientSearch.length >= 2 && clientHits.length === 0 && (
                  <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => { setClient((c) => ({ ...c, name: clientSearch })); setShowClientForm(true); setClientSearch(""); }}>
                    <Plus className="mr-2 h-3 w-3" />Cadastrar "{clientSearch}" como novo cliente
                  </Button>
                )}
              </div>
            )}

            {clientId && (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{client.name}</p>
                    <p className="text-xs text-muted-foreground">{client.document || "Sem CPF"}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {client.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{client.phone}</span>}
                      {client.whatsapp && <span className="flex items-center gap-1 text-emerald-600"><MessageCircle className="h-3 w-3" />{client.whatsapp}</span>}
                      {client.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{client.email}</span>}
                    </div>
                    {clientAgg && (
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <Badge variant="secondary">{clientAgg.vehicleCount} veículo(s)</Badge>
                        {clientAgg.lastQuote && (
                          <Badge variant="secondary">Último orç. #{clientAgg.lastQuote.number} · {fmtBRL(clientAgg.lastQuote.total)}</Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setClientId(null); setClient({ name: "", document: "", phone: "", whatsapp: "", email: "", cep: "", address: "", neighborhood: "", city: "", state: "", notes: "" }); setShowClientForm(false); }}>
                    Trocar
                  </Button>
                </div>
                <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs" onClick={() => setShowClientForm((v) => !v)}>
                  {showClientForm ? "Ocultar dados" : "Editar dados completos"}
                </Button>
              </div>
            )}

            {(showClientForm || (!clientId && (client.name || clientSearch === ""))) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Nome *</Label><Input value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} /></div>
                <div><Label>CPF/CNPJ</Label><Input value={client.document} onChange={(e) => setClient({ ...client, document: e.target.value })} /></div>
                <div><Label>Telefone</Label><Input value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} /></div>
                <div><Label>WhatsApp</Label><Input value={client.whatsapp} onChange={(e) => setClient({ ...client, whatsapp: e.target.value })} placeholder="(11) 99999-0000" /></div>
                <div><Label>E-mail</Label><Input type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} /></div>
                <div><Label>CEP</Label><Input value={client.cep} onChange={(e) => setClient({ ...client, cep: e.target.value })} /></div>
                <div><Label>Endereço</Label><Input value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} /></div>
                <div><Label>Bairro</Label><Input value={client.neighborhood} onChange={(e) => setClient({ ...client, neighborhood: e.target.value })} /></div>
                <div><Label>Cidade</Label><Input value={client.city} onChange={(e) => setClient({ ...client, city: e.target.value })} /></div>
                <div><Label>Estado</Label><Input maxLength={2} value={client.state} onChange={(e) => setClient({ ...client, state: e.target.value.toUpperCase() })} /></div>
                <div className="col-span-2"><Label>Observações</Label><Textarea rows={2} value={client.notes} onChange={(e) => setClient({ ...client, notes: e.target.value })} /></div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Veículo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Car className="h-4 w-4" />Veículo
              {vehicleId && <Badge variant="outline" className="ml-auto bg-emerald-500/10 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" />Vinculado</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!vehicleId && (
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
                {plateSearch.length >= 2 && vehicleHits.length === 0 && (
                  <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => { setVehicle((v) => ({ ...v, plate: plateSearch.toUpperCase() })); setShowVehicleForm(true); setPlateSearch(""); }}>
                    <Plus className="mr-2 h-3 w-3" />Cadastrar veículo "{plateSearch}"
                  </Button>
                )}
              </div>
            )}

            {vehicleId && (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{vehicle.brand} {vehicle.model} {vehicle.version}</p>
                    <p className="font-mono text-sm">{vehicle.plate} · {vehicle.year || "—"} · {vehicle.color || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {vehicle.fuel && <>{vehicle.fuel} · </>}
                      {vehicle.mileage && <>{vehicle.mileage} km</>}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setVehicleId(null); setVehicle({ plate: "", brand: "", model: "", version: "", year: "", color: "", fuel: "", mileage: "", chassis: "", renavam: "", insurer: "", claim_number: "" }); setShowVehicleForm(false); }}>
                    Trocar
                  </Button>
                </div>
                <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs" onClick={() => setShowVehicleForm((v) => !v)}>
                  {showVehicleForm ? "Ocultar dados" : "Editar dados completos"}
                </Button>
              </div>
            )}

            {(showVehicleForm || (!vehicleId && (vehicle.plate || plateSearch === ""))) && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Placa *</Label><Input className="uppercase font-mono" value={vehicle.plate} onChange={(e) => setVehicle({ ...vehicle, plate: e.target.value })} /></div>
                <div><Label>Cor</Label><Input value={vehicle.color} onChange={(e) => setVehicle({ ...vehicle, color: e.target.value })} /></div>
                <div><Label>Marca *</Label><Input value={vehicle.brand} onChange={(e) => setVehicle({ ...vehicle, brand: e.target.value })} /></div>
                <div><Label>Modelo *</Label><Input value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} /></div>
                <div><Label>Versão</Label><Input value={vehicle.version} onChange={(e) => setVehicle({ ...vehicle, version: e.target.value })} /></div>
                <div><Label>Ano</Label><Input type="number" value={vehicle.year} onChange={(e) => setVehicle({ ...vehicle, year: e.target.value })} /></div>
                <div>
                  <Label>Combustível</Label>
                  <Select value={vehicle.fuel} onValueChange={(v) => setVehicle({ ...vehicle, fuel: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {["Gasolina", "Etanol", "Flex", "Diesel", "GNV", "Híbrido", "Elétrico"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>KM</Label><Input type="number" value={vehicle.mileage} onChange={(e) => setVehicle({ ...vehicle, mileage: e.target.value })} /></div>
                <div><Label>Renavam</Label><Input value={vehicle.renavam} onChange={(e) => setVehicle({ ...vehicle, renavam: e.target.value })} /></div>
                <div className="col-span-2"><Label>Chassi</Label><Input value={vehicle.chassis} onChange={(e) => setVehicle({ ...vehicle, chassis: e.target.value })} /></div>
                <div><Label>Seguradora</Label><Input value={vehicle.insurer} onChange={(e) => setVehicle({ ...vehicle, insurer: e.target.value })} /></div>
                <div><Label>Nº Sinistro</Label><Input value={vehicle.claim_number} onChange={(e) => setVehicle({ ...vehicle, claim_number: e.target.value })} /></div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Diagrama */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4" />Vistoria — Diagrama de avarias</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">Selecione uma vista (frente, traseira, lateral, teto) e clique sobre o desenho para marcar amassados, riscos, quebras, trincas ou pintura.</p>
          <VehicleDiagram value={diagram} onChange={setDiagram} />
        </CardContent>
      </Card>

      {/* Fotos */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Camera className="h-4 w-4" />Fotos e marcação de danos</CardTitle></CardHeader>
        <CardContent>
          {vehicleId && quoteId ? (
            <VehiclePhotos vehicleId={vehicleId} quoteId={quoteId} />
          ) : (
            <div className="rounded-md border-2 border-dashed py-8 text-center text-sm text-muted-foreground">
              Salve o orçamento primeiro para anexar fotos vinculadas a ele.
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={() => saveQuote({ silent: false })} disabled={saving}>
                  <Save className="mr-2 h-3 w-3" />Salvar rascunho e habilitar fotos
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Serviços */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4" />Serviços</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2 block text-xs uppercase text-muted-foreground">Serviços rápidos (categorias)</Label>
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
              <Label className="text-xs uppercase text-muted-foreground">Serviços com valor</Label>
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

      {/* Financeiro */}
      <Card>
        <CardHeader><CardTitle className="text-base">Resumo financeiro e condições</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <div>
                <Label>Forma de pagamento</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Condições de pagamento</Label><Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Ex.: 50% entrada + 50% entrega" /></div>
              <div><Label>Garantia</Label><Input value={warranty} onChange={(e) => setWarranty(e.target.value)} placeholder="Ex.: 90 dias" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Previsão de entrega</Label><Input type="date" value={deliveryForecast} onChange={(e) => setDeliveryForecast(e.target.value)} /></div>
                <div><Label>Validade até</Label><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
              </div>
              <div><Label>Observações</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Garantia, condições, observações ao cliente..." /></div>
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

      {/* Ações rápidas */}
      <div className="sticky bottom-2 z-20 flex flex-wrap justify-end gap-2 rounded-lg border bg-card/95 p-2 shadow-lg backdrop-blur">
        <Button variant="outline" asChild><Link to="/quotes">Cancelar</Link></Button>
        <Button variant="outline" onClick={() => saveQuote({ silent: false })} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />{saving ? "Salvando..." : "Salvar Rascunho"}
        </Button>
        <Button variant="outline" onClick={openPdf} disabled={saving}>
          <FileText className="mr-2 h-4 w-4" />Gerar PDF
        </Button>
        <Button variant="outline" onClick={async () => { const s = await saveQuote({ silent: true }); if (s) { navigate({ to: "/quotes/$id", params: { id: s.id } }); setTimeout(() => window.print(), 600); } }} disabled={saving}>
          <Printer className="mr-2 h-4 w-4" />Imprimir
        </Button>
        <Button variant="outline" onClick={sendWhatsApp} disabled={saving} className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20">
          <MessageCircle className="mr-2 h-4 w-4" />WhatsApp
        </Button>
        <Button onClick={approveAsOrder} disabled={saving}>
          <CheckCircle2 className="mr-2 h-4 w-4" />Aprovar e gerar OS
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
