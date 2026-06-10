import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, MessageCircle, Trash2, FileText, Pencil } from "lucide-react";
import { toast } from "sonner";
import { fmtBRL, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/quotes")({ component: () => <AppLayout><QuotesPage /></AppLayout> });

const STATUS_LABEL: Record<string, string> = { pendente: "Pendente", aprovado: "Aprovado", recusado: "Recusado", expirado: "Expirado" };
const STATUS_TONE: Record<string, string> = {
  pendente: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  aprovado: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  recusado: "bg-red-500/15 text-red-600 dark:text-red-400",
  expirado: "bg-muted text-muted-foreground",
};

function QuotesPage() {
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");

  const { data = [] } = useQuery({
    queryKey: ["quotes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotes")
        .select("*, clients(name, phone, whatsapp), vehicles(brand, model, plate)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("quotes").update({ status: status as any }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["quotes"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir orçamento?")) return;
    await supabase.from("quote_items").delete().eq("quote_id", id);
    await supabase.from("quotes").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["quotes"] });
  }

  function whatsapp(quote: any) {
    const num = (quote.clients?.whatsapp || quote.clients?.phone || "").replace(/\D/g, "");
    const text = encodeURIComponent(
      `Olá ${quote.clients?.name ?? ""}, segue seu orçamento #${quote.number}. Valor: ${fmtBRL(quote.total)}${quote.valid_until ? ` (válido até ${fmtDate(quote.valid_until)})` : ""}.`
    );
    window.open(`https://wa.me/${num.length >= 11 ? num : `55${num}`}?text=${text}`, "_blank");
  }

  const filtered = (data as any[]).filter((x) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return String(x.number).includes(s) || x.clients?.name?.toLowerCase().includes(s) || x.vehicles?.plate?.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">Crie orçamentos completos com fotos, marcação de danos e conversão em OS.</p>
        </div>
        <Button asChild><Link to="/quotes/new"><Plus className="mr-2 h-4 w-4" />Novo Orçamento</Link></Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{data.length} orçamento(s)</CardTitle>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="w-64 pl-9" placeholder="Buscar nº, cliente, placa..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum orçamento encontrado.</p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Nº</th>
                    <th className="py-2 pr-3">Cliente</th>
                    <th className="py-2 pr-3">Veículo</th>
                    <th className="py-2 pr-3">Validade</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((x) => (
                    <tr key={x.id} className="hover:bg-muted/40">
                      <td className="py-3 pr-3">
                        <Link to="/quotes/$id" params={{ id: x.id }} className="font-mono font-medium text-primary hover:underline">#{x.number}</Link>
                      </td>
                      <td className="py-3 pr-3 font-medium">{x.clients?.name ?? "—"}</td>
                      <td className="py-3 pr-3 text-muted-foreground">
                        {x.vehicles ? <>{x.vehicles.brand} {x.vehicles.model} · <span className="font-mono">{x.vehicles.plate}</span></> : "—"}
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">{fmtDate(x.valid_until)}</td>
                      <td className="py-3 pr-3">
                        <Select value={x.status} onValueChange={(v) => updateStatus(x.id, v)}>
                          <SelectTrigger className="h-7 w-36"><Badge variant="outline" className={STATUS_TONE[x.status]}>{STATUS_LABEL[x.status]}</Badge></SelectTrigger>
                          <SelectContent>{Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="py-3 pr-3 text-right font-medium">{fmtBRL(x.total)}</td>
                      <td className="py-3 pr-3">
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="icon" title="Abrir"><Link to="/quotes/$id" params={{ id: x.id }}><FileText className="h-4 w-4" /></Link></Button>
                          <Button asChild variant="ghost" size="icon" title="Editar"><Link to="/quotes/new" search={{ id: x.id }}><Pencil className="h-4 w-4" /></Link></Button>
                          <Button variant="ghost" size="icon" onClick={() => whatsapp(x)} title="WhatsApp"><MessageCircle className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(x.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
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
