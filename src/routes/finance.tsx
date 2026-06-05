import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { AdminGuard } from "@/components/admin-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ArrowDownCircle, ArrowUpCircle, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { fmtBRL, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/finance")({
  component: () => (
    <AppLayout>
      <AdminGuard>
        <FinancePage />
      </AdminGuard>
    </AppLayout>
  ),
});

function FinancePage() {
  const [tab, setTab] = React.useState<"all" | "receita" | "despesa">("all");
  const [open, setOpen] = React.useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_transactions").select("*").order("due_date", { ascending: false, nullsFirst: false });
      return data ?? [];
    },
  });

  const list = (data as any[]).filter(t => tab === "all" || t.type === tab);
  const totalReceita = (data as any[]).filter(t => t.type === "receita" && t.status === "pago").reduce((s, t) => s + Number(t.amount), 0);
  const totalDespesa = (data as any[]).filter(t => t.type === "despesa" && t.status === "pago").reduce((s, t) => s + Number(t.amount), 0);
  const aReceber = (data as any[]).filter(t => t.type === "receita" && t.status === "pendente").reduce((s, t) => s + Number(t.amount), 0);
  const aPagar = (data as any[]).filter(t => t.type === "despesa" && t.status === "pendente").reduce((s, t) => s + Number(t.amount), 0);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("financial_transactions").insert({
      type: String(fd.get("type")) as any,
      category: String(fd.get("category") ?? "") || null,
      description: String(fd.get("description")),
      amount: +String(fd.get("amount")),
      due_date: String(fd.get("due_date") ?? "") || null,
      status: "pendente",
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Lançamento criado"); setOpen(false);
    qc.invalidateQueries({ queryKey: ["transactions"] });
  }

  async function markPaid(id: string) {
    const { error } = await supabase.from("financial_transactions").update({ status: "pago", paid_date: new Date().toISOString().slice(0, 10) }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["transactions"] });
  }
  async function remove(id: string) {
    if (!confirm("Excluir lançamento?")) return;
    await supabase.from("financial_transactions").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["transactions"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Controle de receitas, despesas e contas a receber.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo lançamento</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo lançamento</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo *</Label>
                  <Select name="type" defaultValue="receita">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="receita">Receita</SelectItem><SelectItem value="despesa">Despesa</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Categoria</Label><Input name="category" placeholder="Ex.: Peças, Mão de obra..." /></div>
              </div>
              <div><Label>Descrição *</Label><Input name="description" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor (R$) *</Label><Input name="amount" type="number" min="0" step="0.01" required /></div>
                <div><Label>Vencimento</Label><Input name="due_date" type="date" /></div>
              </div>
              <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Receita (pago)" value={fmtBRL(totalReceita)} icon={ArrowDownCircle} tone="text-emerald-500" />
        <Stat label="Despesas (pago)" value={fmtBRL(totalDespesa)} icon={ArrowUpCircle} tone="text-red-500" />
        <Stat label="A receber" value={fmtBRL(aReceber)} icon={ArrowDownCircle} tone="text-blue-500" />
        <Stat label="A pagar" value={fmtBRL(aPagar)} icon={ArrowUpCircle} tone="text-amber-500" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="receita">Receitas</TabsTrigger>
          <TabsTrigger value="despesa">Despesas</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader><CardTitle>{list.length} lançamento(s)</CardTitle></CardHeader>
        <CardContent>
          {list.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum lançamento.</p> : (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2 pr-3">Descrição</th><th className="py-2 pr-3">Categoria</th><th className="py-2 pr-3">Vencimento</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3 text-right">Valor</th><th></th></tr>
                </thead>
                <tbody className="divide-y">
                  {list.map(t => (
                    <tr key={t.id} className="hover:bg-muted/40">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2">
                          {t.type === "receita" ? <ArrowDownCircle className="h-4 w-4 text-emerald-500" /> : <ArrowUpCircle className="h-4 w-4 text-red-500" />}
                          <span className="font-medium">{t.description}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">{t.category ?? "—"}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{fmtDate(t.due_date)}</td>
                      <td className="py-3 pr-3">
                        <Badge variant="outline" className={t.status === "pago" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}>
                          {t.status === "pago" ? "Pago" : "Pendente"}
                        </Badge>
                      </td>
                      <td className={`py-3 pr-3 text-right font-medium ${t.type === "receita" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {t.type === "receita" ? "+" : "-"} {fmtBRL(t.amount)}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex justify-end gap-1">
                          {t.status !== "pago" && <Button variant="ghost" size="icon" onClick={() => markPaid(t.id)} title="Marcar como pago"><CheckCircle2 className="h-4 w-4" /></Button>}
                          <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4" /></Button>
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

function Stat({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
    </CardContent></Card>
  );
}
