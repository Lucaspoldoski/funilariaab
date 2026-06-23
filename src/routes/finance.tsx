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
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, ArrowDownCircle, ArrowUpCircle, CheckCircle2, Trash2,
  TrendingUp, ChevronLeft, ChevronRight, Wallet,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RTooltip, Legend,
} from "recharts";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { fmtBRL, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/finance")({
  component: () => <AppLayout><FinancePage /></AppLayout>,
});

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const CATEGORIES_RECEITA = ["Mão de obra", "Peças", "Pintura", "Funilaria", "Polimento", "Outros"];
const CATEGORIES_DESPESA = ["Fornecedor", "Aluguel", "Pessoal", "Material", "Equipamento", "Outros"];

function FinancePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<"all" | "receita" | "despesa">("all");
  const [open, setOpen] = React.useState(false);
  const [formType, setFormType] = React.useState<"receita" | "despesa">("receita");

  // Filtro de mês
  const today = new Date();
  const [filterYear, setFilterYear] = React.useState(today.getFullYear());
  const [filterMonth, setFilterMonth] = React.useState(today.getMonth()); // 0-indexed

  const rangeStart = new Date(filterYear, filterMonth, 1).toISOString().slice(0, 10);
  const rangeEnd   = new Date(filterYear, filterMonth + 1, 0).toISOString().slice(0, 10);

  function prevMonth() {
    if (filterMonth === 0) { setFilterMonth(11); setFilterYear((y) => y - 1); }
    else setFilterMonth((m) => m - 1);
  }
  function nextMonth() {
    if (filterMonth === 11) { setFilterMonth(0); setFilterYear((y) => y + 1); }
    else setFilterMonth((m) => m + 1);
  }

  // ── Query: transações do mês selecionado ──────────────────────────────────
  const { data = [], isLoading } = useQuery({
    queryKey: ["transactions", filterYear, filterMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("*")
        .gte("created_at", `${rangeStart}T00:00:00.000Z`)
        .lte("created_at", `${rangeEnd}T23:59:59.999Z`)
        .order("due_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Query: dados 6 meses para gráfico ────────────────────────────────────
  const { data: allTx6m = [] } = useQuery({
    queryKey: ["transactions-6m"],
    queryFn: async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5, 1);
      const { data } = await supabase
        .from("financial_transactions")
        .select("type, amount, status, paid_date, due_date")
        .gte("created_at", sixMonthsAgo.toISOString())
        .eq("status", "pago");
      return data ?? [];
    },
  });

  const list = (data as any[]).filter((t) => tab === "all" || t.type === tab);

  const totalReceita = (data as any[]).filter((t) => t.type === "receita" && t.status === "pago").reduce((s, t) => s + Number(t.amount), 0);
  const totalDespesa = (data as any[]).filter((t) => t.type === "despesa" && t.status === "pago").reduce((s, t) => s + Number(t.amount), 0);
  const aReceber     = (data as any[]).filter((t) => t.type === "receita" && t.status === "pendente").reduce((s, t) => s + Number(t.amount), 0);
  const aPagar       = (data as any[]).filter((t) => t.type === "despesa" && t.status === "pendente").reduce((s, t) => s + Number(t.amount), 0);
  const saldo        = totalReceita - totalDespesa;

  // ── Dados para gráfico 6 meses ────────────────────────────────────────────
  const chartData = Array.from({ length: 6 }, (_, i) => {
    const offset = i - 5;
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    const monthStr = d.toISOString().slice(0, 7);
    const monthTx = (allTx6m as any[]).filter((t) => (t.paid_date ?? t.due_date ?? "").startsWith(monthStr));
    const receita = monthTx.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
    const despesa = monthTx.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
    return { mes: MONTHS[d.getMonth()], receita, despesa, saldo: receita - despesa };
  });

  // ── Criar lançamento ──────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("financial_transactions").insert({
      type: formType,
      category: String(fd.get("category") ?? "") || null,
      description: String(fd.get("description")),
      amount: +String(fd.get("amount")),
      due_date: String(fd.get("due_date") ?? "") || null,
      status: "pendente",
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Lançamento criado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["transactions-6m"] });
  }

  async function markPaid(id: string) {
    const { error } = await supabase
      .from("financial_transactions")
      .update({ status: "pago", paid_date: new Date().toISOString().slice(0, 10) })
      .eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["transactions-6m"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    const { error } = await supabase.from("financial_transactions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Lançamento excluído");
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["transactions-6m"] });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Controle de receitas, despesas e fluxo de caixa.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo lançamento</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo lançamento</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Tipo *</Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormType("receita")}
                    className={`flex items-center gap-2 rounded-lg border p-3 text-sm transition ${formType === "receita" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "hover:bg-muted"}`}
                  >
                    <ArrowDownCircle className="h-4 w-4" />Receita
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType("despesa")}
                    className={`flex items-center gap-2 rounded-lg border p-3 text-sm transition ${formType === "despesa" ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400" : "hover:bg-muted"}`}
                  >
                    <ArrowUpCircle className="h-4 w-4" />Despesa
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Categoria</Label>
                  <Select name="category">
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {(formType === "receita" ? CATEGORIES_RECEITA : CATEGORIES_DESPESA).map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Vencimento</Label>
                  <Input name="due_date" type="date" />
                </div>
              </div>
              <div>
                <Label>Descrição *</Label>
                <Input name="description" required placeholder="Ex.: Pagamento OS #45" />
              </div>
              <div>
                <Label>Valor (R$) *</Label>
                <Input name="amount" type="number" min="0" step="0.01" required placeholder="0,00" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit">Salvar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Navegação de mês */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="min-w-36 text-center text-sm font-medium">{MONTHS[filterMonth]} {filterYear}</div>
        <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setFilterMonth(today.getMonth()); setFilterYear(today.getFullYear()); }}
        >
          Mês atual
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Receita (pago)" value={fmtBRL(totalReceita)} icon={ArrowDownCircle} tone="text-emerald-500" />
        <StatCard label="Despesas (pago)" value={fmtBRL(totalDespesa)} icon={ArrowUpCircle} tone="text-red-500" />
        <StatCard label="A receber" value={fmtBRL(aReceber)} icon={ArrowDownCircle} tone="text-blue-500" />
        <StatCard label="A pagar" value={fmtBRL(aPagar)} icon={ArrowUpCircle} tone="text-amber-500" />
        <StatCard
          label="Saldo do mês"
          value={fmtBRL(saldo)}
          icon={saldo >= 0 ? TrendingUp : Wallet}
          tone={saldo >= 0 ? "text-emerald-500" : "text-red-500"}
        />
      </div>

      {/* Gráfico 6 meses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fluxo de caixa (últimos 6 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => fmtBRL(v).replace("R$ ", "")} />
                <RTooltip
                  formatter={(v: number) => fmtBRL(v)}
                  contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                />
                <Legend />
                <Bar dataKey="receita" name="Receita" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesa" name="Despesa" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Filtro tipo */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all">Todos ({(data as any[]).length})</TabsTrigger>
          <TabsTrigger value="receita">Receitas ({(data as any[]).filter((t) => t.type === "receita").length})</TabsTrigger>
          <TabsTrigger value="despesa">Despesas ({(data as any[]).filter((t) => t.type === "despesa").length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Tabela */}
      <Card>
        <CardHeader><CardTitle className="text-base">{list.length} lançamento(s) em {MONTHS[filterMonth]}/{filterYear}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : list.length === 0 ? (
            <div className="py-10 text-center">
              <Wallet className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum lançamento neste período.</p>
              <Button className="mt-4" size="sm" onClick={() => setOpen(true)}>
                <Plus className="mr-2 h-3 w-3" />Adicionar lançamento
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 w-5"></th>
                    <th className="py-2 pr-3">Descrição</th>
                    <th className="py-2 pr-3">Categoria</th>
                    <th className="py-2 pr-3">Vencimento</th>
                    <th className="py-2 pr-3">Pago em</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Valor</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/40 transition">
                      <td className="py-3 pr-3">
                        {t.type === "receita"
                          ? <ArrowDownCircle className="h-4 w-4 text-emerald-500" />
                          : <ArrowUpCircle className="h-4 w-4 text-red-500" />}
                      </td>
                      <td className="py-3 pr-3 font-medium max-w-48 truncate">{t.description}</td>
                      <td className="py-3 pr-3">
                        {t.category
                          ? <Badge variant="outline" className="text-xs">{t.category}</Badge>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground whitespace-nowrap">{fmtDate(t.due_date)}</td>
                      <td className="py-3 pr-3 text-muted-foreground whitespace-nowrap">{t.paid_date ? fmtDate(t.paid_date) : "—"}</td>
                      <td className="py-3 pr-3">
                        <Badge
                          variant="outline"
                          className={t.status === "pago"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}
                        >
                          {t.status === "pago" ? "Pago" : "Pendente"}
                        </Badge>
                      </td>
                      <td className={`py-3 pr-3 text-right font-semibold whitespace-nowrap ${t.type === "receita" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {t.type === "receita" ? "+" : "−"} {fmtBRL(t.amount)}
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end gap-1">
                          {t.status !== "pago" && (
                            <Button variant="ghost" size="icon" onClick={() => markPaid(t.id)} title="Marcar como pago">
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => remove(t.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td colSpan={6} className="py-3 pr-3 text-right text-sm text-muted-foreground">Saldo do período:</td>
                    <td className={`py-3 pr-3 text-right text-base ${saldo >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {fmtBRL(saldo)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground leading-tight">{label}</p>
          <Icon className={`h-4 w-4 ${tone}`} />
        </div>
        <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}
