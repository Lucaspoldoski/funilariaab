import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, MessageCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
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
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data = [] } = useQuery({
    queryKey: ["quotes"],
    queryFn: async () => {
      const { data } = await supabase.from("quotes").select("*, clients(name, phone)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-mini"],
    queryFn: async () => (await supabase.from("clients").select("id, name, phone")).data ?? [],
  });

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("quotes").insert({
      client_id: String(fd.get("client_id")),
      description: String(fd.get("description") ?? ""),
      total: +String(fd.get("total") ?? 0),
      valid_until: String(fd.get("valid_until") ?? "") || null,
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Orçamento criado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["quotes"] });
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("quotes").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["quotes"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir orçamento?")) return;
    await supabase.from("quotes").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["quotes"] });
  }

  function whatsapp(q: any) {
    const phone = q.clients?.phone?.replace(/\D/g, "");
    const text = encodeURIComponent(`Olá ${q.clients?.name}, segue o orçamento #${q.number}: ${q.description ?? ""}\nValor: ${fmtBRL(q.total)}${q.valid_until ? ` (válido até ${fmtDate(q.valid_until)})` : ""}`);
    window.open(`https://wa.me/${phone ? `55${phone}` : ""}?text=${text}`, "_blank");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">Crie e envie orçamentos rapidamente.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo orçamento</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo orçamento</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div>
                <Label>Cliente *</Label>
                <Select name="client_id" required>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{(clients as any[]).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Descrição</Label><Textarea name="description" rows={3} placeholder="Descreva os serviços incluídos..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor total (R$) *</Label><Input name="total" type="number" min="0" step="0.01" required /></div>
                <div><Label>Válido até</Label><Input name="valid_until" type="date" /></div>
              </div>
              <DialogFooter><Button type="submit">Criar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>{data.length} orçamento(s)</CardTitle></CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum orçamento ainda.</p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2 pr-3">Nº</th><th className="py-2 pr-3">Cliente</th><th className="py-2 pr-3">Validade</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3 text-right">Total</th><th className="py-2 pr-3"></th></tr>
                </thead>
                <tbody className="divide-y">
                  {(data as any[]).map(q => (
                    <tr key={q.id} className="hover:bg-muted/40">
                      <td className="py-3 pr-3 font-mono">#{q.number}</td>
                      <td className="py-3 pr-3 font-medium">{q.clients?.name ?? "—"}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{fmtDate(q.valid_until)}</td>
                      <td className="py-3 pr-3">
                        <Select value={q.status} onValueChange={(v) => updateStatus(q.id, v)}>
                          <SelectTrigger className="h-7 w-36"><Badge variant="outline" className={STATUS_TONE[q.status]}>{STATUS_LABEL[q.status]}</Badge></SelectTrigger>
                          <SelectContent>{Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="py-3 pr-3 text-right font-medium">{fmtBRL(q.total)}</td>
                      <td className="py-3 pr-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => whatsapp(q)} title="Enviar por WhatsApp"><MessageCircle className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(q.id)}><Trash2 className="h-4 w-4" /></Button>
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
