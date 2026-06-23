import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Pencil, Save, X, MessageCircle, Phone, Mail, MapPin,
  Car, FileText, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { fmtBRL, fmtDate } from "@/lib/format";
import { STATUS_LABELS, STATUS_COLORS, type VehicleStatus } from "@/lib/vehicle-status";

export const Route = createFileRoute("/clients/$id")({
  component: () => <AppLayout><ClientDetail /></AppLayout>,
});

const QUOTE_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente", aprovado: "Aprovado", recusado: "Recusado", expirado: "Expirado",
};
const QUOTE_STATUS_TONE: Record<string, string> = {
  pendente: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  aprovado: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  recusado: "bg-red-500/15 text-red-600 dark:text-red-400",
  expirado: "bg-muted text-muted-foreground",
};

function ClientDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "", document: "", phone: "", whatsapp: "", email: "", address: "",
  });

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["client-vehicles", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("vehicles")
        .select("*")
        .eq("client_id", id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ["client-quotes", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotes")
        .select("*, vehicles(brand, model, plate)")
        .eq("client_id", id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  React.useEffect(() => {
    if (client) {
      setForm({
        name: client.name ?? "",
        document: (client as any).document ?? "",
        phone: client.phone ?? "",
        whatsapp: client.whatsapp ?? "",
        email: client.email ?? "",
        address: client.address ?? "",
      });
    }
  }, [client]);

  async function handleSave() {
    const { error } = await supabase.from("clients").update(form).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cliente atualizado");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["client", id] });
    qc.invalidateQueries({ queryKey: ["clients-full"] });
  }

  async function handleDelete() {
    if (!confirm("Excluir este cliente? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cliente excluído");
    navigate({ to: "/clients" });
  }

  function openWhatsapp() {
    const num = ((client as any)?.whatsapp || client?.phone || "").replace(/\D/g, "");
    if (!num) { toast.error("Cliente sem WhatsApp/telefone cadastrado"); return; }
    window.open(`https://wa.me/${num.length >= 11 ? num : `55${num}`}`, "_blank");
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!client) return <p className="text-muted-foreground">Cliente não encontrado.</p>;

  const totalQuotes = (quotes as any[]).reduce((s, q) => s + Number(q.total), 0);
  const approvedQuotes = (quotes as any[]).filter((q) => q.status === "aprovado");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/clients"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
            <p className="text-sm text-muted-foreground">
              {(client as any).document && <>{(client as any).document} · </>}
              {(client as any).phone ?? client.phone ?? ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={openWhatsapp}>
            <MessageCircle className="mr-2 h-4 w-4" />WhatsApp
          </Button>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" />Editar
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                <X className="mr-2 h-4 w-4" />Cancelar
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" />Salvar
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />Excluir
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Veículos</p>
            <p className="text-2xl font-semibold">{vehicles.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Orçamentos</p>
            <p className="text-2xl font-semibold">{quotes.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Aprovados</p>
            <p className="text-2xl font-semibold text-emerald-500">{approvedQuotes.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Valor total</p>
            <p className="text-xl font-semibold">{fmtBRL(totalQuotes)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados pessoais</TabsTrigger>
          <TabsTrigger value="veiculos">Veículos ({vehicles.length})</TabsTrigger>
          <TabsTrigger value="orcamentos">Orçamentos ({quotes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="mt-4">
          <Card>
            <CardContent className="p-6">
              {editing ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label>Nome *</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>CPF / CNPJ</Label>
                    <Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div>
                    <Label>WhatsApp</Label>
                    <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="(11) 99999-0000" />
                  </div>
                  <div>
                    <Label>E-mail</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Endereço</Label>
                    <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </div>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2">
                  <InfoRow icon={Phone} label="Telefone" value={client.phone} />
                  <InfoRow icon={MessageCircle} label="WhatsApp" value={(client as any).whatsapp} />
                  <InfoRow icon={Mail} label="E-mail" value={client.email} />
                  <InfoRow icon={FileText} label="CPF / CNPJ" value={(client as any).document} />
                  <div className="sm:col-span-2">
                    <InfoRow icon={MapPin} label="Endereço" value={client.address} />
                  </div>
                  <div className="sm:col-span-2 text-xs text-muted-foreground">
                    Cadastrado em {fmtDate(client.created_at)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="veiculos" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {vehicles.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhum veículo vinculado.</p>
              ) : (
                <div className="divide-y">
                  {(vehicles as any[]).map((v) => (
                    <Link
                      key={v.id}
                      to="/vehicles/$id"
                      params={{ id: v.id }}
                      className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-muted/40 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                          <Car className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{v.brand} {v.model} {v.year}</p>
                          <p className="text-xs text-muted-foreground font-mono">{v.plate}{v.color ? ` · ${v.color}` : ""}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={STATUS_COLORS[v.status as VehicleStatus]}>
                        {STATUS_LABELS[v.status as VehicleStatus]}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orcamentos" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {quotes.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhum orçamento encontrado.</p>
              ) : (
                <div className="divide-y">
                  {(quotes as any[]).map((q) => (
                    <Link
                      key={q.id}
                      to="/quotes/$id"
                      params={{ id: q.id }}
                      className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-muted/40 transition"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">#{q.number}</span>
                          <Badge variant="outline" className={QUOTE_STATUS_TONE[q.status]}>
                            {QUOTE_STATUS_LABEL[q.status]}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {q.vehicles ? `${q.vehicles.brand} ${q.vehicles.model} · ${q.vehicles.plate}` : "—"}
                          {" · "}{fmtDate(q.created_at)}
                        </p>
                      </div>
                      <span className="font-semibold">{fmtBRL(q.total)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value ?? "—"}</p>
      </div>
    </div>
  );
}
