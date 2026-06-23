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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, Boxes, Package,
  Pencil, Plus, RefreshCw, Search, Trash2, TrendingDown, History,
} from "lucide-react";
import { toast } from "sonner";
import { fmtBRL, fmtDate, fmtDateTime } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/inventory")({
  component: () => (
    <AppLayout>
      <InventoryPage />
    </AppLayout>
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// Local types (tabelas criadas pelas migrations SaaS — não geradas no types.ts)
// ─────────────────────────────────────────────────────────────────────────────
type EstoquePeca = {
  id: string;
  empresa_id: string | null;
  codigo: string | null;
  descricao: string;
  fabricante: string | null;
  unidade: string;
  quantidade: number;
  quantidade_minima: number;
  valor_custo: number;
  valor_venda: number;
  localizacao: string | null;
  ativo: boolean;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

type Movimentacao = {
  id: string;
  peca_id: string;
  tipo: "entrada" | "saida" | "ajuste";
  quantidade: number;
  quantidade_anterior: number;
  quantidade_nova: number;
  custo_unitario: number | null;
  motivo: string | null;
  created_at: string;
  estoque_pecas?: { descricao: string; unidade: string } | null;
};

const UNITS = ["un", "pç", "m", "m²", "L", "kg", "cx", "jg", "par"];

const EMPTY_PECA = {
  codigo: "",
  descricao: "",
  fabricante: "",
  unidade: "un",
  quantidade: 0,
  quantidade_minima: 0,
  valor_custo: 0,
  valor_venda: 0,
  localizacao: "",
  ativo: true,
  observacoes: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function stockStatus(item: EstoquePeca): "ok" | "baixo" | "zerado" {
  if (item.quantidade === 0) return "zerado";
  if (item.quantidade <= item.quantidade_minima) return "baixo";
  return "ok";
}

function StockDot({ status }: { status: "ok" | "baixo" | "zerado" }) {
  const cfg = {
    ok:     { cls: "bg-emerald-500", label: "OK" },
    baixo:  { cls: "bg-amber-500",   label: "Estoque baixo" },
    zerado: { cls: "bg-red-500",     label: "Sem estoque" },
  }[status];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${cfg.cls}`} />
        </TooltipTrigger>
        <TooltipContent>{cfg.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
function InventoryPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState<"todos" | "baixo" | "zerado">("todos");
  const [editingPeca, setEditingPeca] = React.useState<EstoquePeca | null>(null);
  const [pecaDialogOpen, setPecaDialogOpen] = React.useState(false);
  const [movPecaId, setMovPecaId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(EMPTY_PECA);
  const [movForm, setMovForm] = React.useState({ tipo: "entrada" as "entrada" | "saida" | "ajuste", quantidade: 0, motivo: "" });

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: pecas = [], isLoading, error } = useQuery({
    queryKey: ["estoque-pecas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("estoque_pecas")
        .select("*")
        .order("descricao");
      if (error) throw error;
      return (data ?? []) as EstoquePeca[];
    },
  });

  const { data: movimentacoes = [] } = useQuery({
    queryKey: ["movimentacoes-estoque"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("movimentacao_estoque")
        .select("*, estoque_pecas(descricao, unidade)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Movimentacao[];
    },
  });

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = React.useMemo(() => {
    return pecas.filter((p) => {
      const matchQ = !q || p.descricao.toLowerCase().includes(q.toLowerCase()) || (p.codigo ?? "").toLowerCase().includes(q.toLowerCase()) || (p.fabricante ?? "").toLowerCase().includes(q.toLowerCase());
      const status = stockStatus(p);
      const matchStatus = filterStatus === "todos" || status === filterStatus;
      return matchQ && matchStatus;
    });
  }, [pecas, q, filterStatus]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalItens = pecas.length;
  const totalAtivos = pecas.filter((p) => p.ativo).length;
  const baixoEstoque = pecas.filter((p) => stockStatus(p) === "baixo").length;
  const semEstoque = pecas.filter((p) => stockStatus(p) === "zerado").length;
  const valorTotalEstoque = pecas.reduce((s, p) => s + p.quantidade * p.valor_custo, 0);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function openCreate() {
    setEditingPeca(null);
    setForm(EMPTY_PECA);
    setPecaDialogOpen(true);
  }

  function openEdit(p: EstoquePeca) {
    setEditingPeca(p);
    setForm({
      codigo: p.codigo ?? "",
      descricao: p.descricao,
      fabricante: p.fabricante ?? "",
      unidade: p.unidade,
      quantidade: p.quantidade,
      quantidade_minima: p.quantidade_minima,
      valor_custo: p.valor_custo,
      valor_venda: p.valor_venda,
      localizacao: p.localizacao ?? "",
      ativo: p.ativo,
      observacoes: p.observacoes ?? "",
    });
    setPecaDialogOpen(true);
  }

  async function handleSavePeca() {
    if (!form.descricao.trim()) { toast.error("Informe a descrição da peça"); return; }

    const payload = {
      codigo: form.codigo || null,
      descricao: form.descricao.trim(),
      fabricante: form.fabricante || null,
      unidade: form.unidade,
      quantidade: editingPeca ? undefined : form.quantidade, // only on create
      quantidade_minima: form.quantidade_minima,
      valor_custo: form.valor_custo,
      valor_venda: form.valor_venda,
      localizacao: form.localizacao || null,
      ativo: form.ativo,
      observacoes: form.observacoes || null,
    };

    if (editingPeca) {
      const { error } = await (supabase as any)
        .from("estoque_pecas")
        .update(payload)
        .eq("id", editingPeca.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Peça atualizada");
    } else {
      const { error } = await (supabase as any)
        .from("estoque_pecas")
        .insert({ ...payload, quantidade: form.quantidade, created_by: user?.id });
      if (error) { toast.error(error.message); return; }
      toast.success("Peça cadastrada no estoque");
    }

    setPecaDialogOpen(false);
    qc.invalidateQueries({ queryKey: ["estoque-pecas"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta peça do estoque? Histórico de movimentações será mantido.")) return;
    const { error } = await (supabase as any).from("estoque_pecas").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Peça removida");
    qc.invalidateQueries({ queryKey: ["estoque-pecas"] });
  }

  async function handleToggleAtivo(id: string, ativo: boolean) {
    const { error } = await (supabase as any).from("estoque_pecas").update({ ativo }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["estoque-pecas"] });
  }

  async function handleMovimentacao() {
    if (!movPecaId) return;
    if (movForm.quantidade <= 0) { toast.error("Quantidade deve ser maior que zero"); return; }

    const { error } = await (supabase as any).from("movimentacao_estoque").insert({
      peca_id: movPecaId,
      tipo: movForm.tipo,
      quantidade: movForm.quantidade,
      motivo: movForm.motivo || null,
      created_by: user?.id,
    });

    if (error) { toast.error(error.message); return; }

    const tipoLabel = { entrada: "Entrada registrada", saida: "Saída registrada", ajuste: "Ajuste aplicado" }[movForm.tipo];
    toast.success(tipoLabel);
    setMovPecaId(null);
    setMovForm({ tipo: "entrada", quantidade: 0, motivo: "" });
    qc.invalidateQueries({ queryKey: ["estoque-pecas"] });
    qc.invalidateQueries({ queryKey: ["movimentacoes-estoque"] });
  }

  const movPeca = movPecaId ? pecas.find((p) => p.id === movPecaId) : null;

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <div>
          <p className="text-lg font-semibold">Módulo de Estoque não disponível</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">
            Execute as migrations SaaS para habilitar o controle de estoque.
            As tabelas <code className="rounded bg-muted px-1 py-0.5 text-xs">estoque_pecas</code> e{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">movimentacao_estoque</code> ainda não foram criadas.
          </p>
        </div>
        <code className="rounded-md bg-muted px-4 py-2 text-left text-xs whitespace-pre">
          supabase db push{"\n"}# ou execute as migrations 20260617000001 a 20260617000005
        </code>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estoque</h1>
          <p className="text-sm text-muted-foreground">Controle de peças e materiais da oficina.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />Nova peça
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total de itens" value={String(totalItens)} icon={Boxes} tone="text-primary" />
        <StatCard label="Ativos" value={String(totalAtivos)} icon={Package} tone="text-emerald-500" />
        <StatCard
          label="Estoque baixo"
          value={String(baixoEstoque)}
          icon={TrendingDown}
          tone={baixoEstoque > 0 ? "text-amber-500" : "text-muted-foreground"}
          onClick={() => setFilterStatus(filterStatus === "baixo" ? "todos" : "baixo")}
          active={filterStatus === "baixo"}
        />
        <StatCard
          label="Sem estoque"
          value={String(semEstoque)}
          icon={AlertTriangle}
          tone={semEstoque > 0 ? "text-red-500" : "text-muted-foreground"}
          onClick={() => setFilterStatus(filterStatus === "zerado" ? "todos" : "zerado")}
          active={filterStatus === "zerado"}
        />
        <StatCard label="Valor em estoque" value={fmtBRL(valorTotalEstoque)} icon={Boxes} tone="text-blue-500" />
      </div>

      {/* Alert banner */}
      {(baixoEstoque > 0 || semEstoque > 0) && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />
          <span>
            {semEstoque > 0 && <strong>{semEstoque} {semEstoque === 1 ? "item" : "itens"} sem estoque</strong>}
            {semEstoque > 0 && baixoEstoque > 0 && " e "}
            {baixoEstoque > 0 && <strong>{baixoEstoque} {baixoEstoque === 1 ? "item" : "itens"} com estoque baixo</strong>}
            {". "}
            <button className="underline underline-offset-2" onClick={() => setFilterStatus("zerado")}>Ver itens zerados</button>
            {" · "}
            <button className="underline underline-offset-2" onClick={() => setFilterStatus("baixo")}>Ver estoque baixo</button>
          </span>
        </div>
      )}

      <Tabs defaultValue="estoque">
        <TabsList>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
        </TabsList>

        {/* ─── Tab: Estoque ─────────────────────────────────────────────── */}
        <TabsContent value="estoque" className="mt-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por descrição, código, fabricante..."
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={filterStatus === "todos" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus("todos")}
              >
                Todos
              </Button>
              <Button
                variant={filterStatus === "baixo" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus(filterStatus === "baixo" ? "todos" : "baixo")}
              >
                <TrendingDown className="mr-1 h-3.5 w-3.5 text-amber-500" />Baixo
              </Button>
              <Button
                variant={filterStatus === "zerado" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus(filterStatus === "zerado" ? "todos" : "zerado")}
              >
                <AlertTriangle className="mr-1 h-3.5 w-3.5 text-red-500" />Zerado
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{filtered.length} item(ns)</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Carregando estoque...</p>
              ) : filtered.length === 0 ? (
                <div className="py-10 text-center">
                  <Boxes className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    {q || filterStatus !== "todos" ? "Nenhuma peça encontrada." : "Nenhuma peça cadastrada no estoque."}
                  </p>
                  {!q && filterStatus === "todos" && (
                    <Button className="mt-4" size="sm" onClick={openCreate}>
                      <Plus className="mr-2 h-3 w-3" />Cadastrar primeira peça
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3 w-5"></th>
                        <th className="py-2 pr-3">Descrição</th>
                        <th className="py-2 pr-3">Código</th>
                        <th className="py-2 pr-3">Fabricante</th>
                        <th className="py-2 pr-3 text-right">Quantidade</th>
                        <th className="py-2 pr-3 text-right">Mínimo</th>
                        <th className="py-2 pr-3 text-right">V. Custo</th>
                        <th className="py-2 pr-3 text-right">V. Venda</th>
                        <th className="py-2 pr-3">Local</th>
                        <th className="py-2 pr-3 text-center">Ativo</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filtered.map((p) => {
                        const status = stockStatus(p);
                        return (
                          <tr key={p.id} className={`hover:bg-muted/40 transition ${!p.ativo ? "opacity-50" : ""}`}>
                            <td className="py-3 pr-3"><StockDot status={status} /></td>
                            <td className="py-3 pr-3 font-medium max-w-48 truncate">{p.descricao}</td>
                            <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">{p.codigo ?? "—"}</td>
                            <td className="py-3 pr-3 text-muted-foreground text-xs">{p.fabricante ?? "—"}</td>
                            <td className="py-3 pr-3 text-right">
                              <span className={`font-semibold ${status === "zerado" ? "text-red-500" : status === "baixo" ? "text-amber-500" : ""}`}>
                                {p.quantidade}
                              </span>
                              <span className="ml-1 text-xs text-muted-foreground">{p.unidade}</span>
                            </td>
                            <td className="py-3 pr-3 text-right text-muted-foreground">{p.quantidade_minima} {p.unidade}</td>
                            <td className="py-3 pr-3 text-right font-mono">{fmtBRL(p.valor_custo)}</td>
                            <td className="py-3 pr-3 text-right font-mono">{fmtBRL(p.valor_venda)}</td>
                            <td className="py-3 pr-3 text-xs text-muted-foreground">{p.localizacao ?? "—"}</td>
                            <td className="py-3 pr-3 text-center">
                              <Switch checked={p.ativo} onCheckedChange={(v) => handleToggleAtivo(p.id, v)} />
                            </td>
                            <td className="py-3">
                              <div className="flex justify-end gap-1">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => { setMovPecaId(p.id); setMovForm({ tipo: "entrada", quantidade: 0, motivo: "" }); }}
                                      >
                                        <RefreshCw className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Movimentar estoque</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab: Movimentações ───────────────────────────────────────── */}
        <TabsContent value="movimentacoes" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />Últimas 100 movimentações
              </CardTitle>
            </CardHeader>
            <CardContent>
              {movimentacoes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>
              ) : (
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">Data</th>
                        <th className="py-2 pr-3">Tipo</th>
                        <th className="py-2 pr-3">Peça</th>
                        <th className="py-2 pr-3 text-right">Qtd</th>
                        <th className="py-2 pr-3 text-right">Anterior</th>
                        <th className="py-2 pr-3 text-right">Nova</th>
                        <th className="py-2 pr-3">Motivo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {movimentacoes.map((m) => (
                        <tr key={m.id} className="hover:bg-muted/40">
                          <td className="py-3 pr-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                          <td className="py-3 pr-3">
                            {m.tipo === "entrada" && (
                              <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs">
                                <ArrowDownCircle className="mr-1 h-3 w-3" />Entrada
                              </Badge>
                            )}
                            {m.tipo === "saida" && (
                              <Badge variant="outline" className="bg-red-500/15 text-red-600 dark:text-red-400 text-xs">
                                <ArrowUpCircle className="mr-1 h-3 w-3" />Saída
                              </Badge>
                            )}
                            {m.tipo === "ajuste" && (
                              <Badge variant="outline" className="bg-blue-500/15 text-blue-600 dark:text-blue-400 text-xs">
                                <RefreshCw className="mr-1 h-3 w-3" />Ajuste
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 pr-3 font-medium">{m.estoque_pecas?.descricao ?? "—"}</td>
                          <td className="py-3 pr-3 text-right font-semibold">
                            {m.tipo === "saida" ? `-${m.quantidade}` : `+${m.quantidade}`}
                            {m.estoque_pecas?.unidade && <span className="ml-1 text-xs text-muted-foreground">{m.estoque_pecas.unidade}</span>}
                          </td>
                          <td className="py-3 pr-3 text-right text-muted-foreground">{m.quantidade_anterior}</td>
                          <td className="py-3 pr-3 text-right font-semibold">{m.quantidade_nova}</td>
                          <td className="py-3 pr-3 text-xs text-muted-foreground">{m.motivo ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Dialog: Criar / Editar Peça ─────────────────────────────────── */}
      <Dialog open={pecaDialogOpen} onOpenChange={setPecaDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingPeca ? "Editar peça" : "Nova peça no estoque"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Descrição *</Label>
              <Input
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Ex.: Para-lama dianteiro esquerdo"
              />
            </div>
            <div>
              <Label>Código / SKU</Label>
              <Input
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                placeholder="Ex.: PLM-01-ESQ"
              />
            </div>
            <div>
              <Label>Fabricante</Label>
              <Input
                value={form.fabricante}
                onChange={(e) => setForm({ ...form, fabricante: e.target.value })}
                placeholder="Ex.: Genuine, Cofap..."
              />
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={form.unidade} onValueChange={(v) => setForm({ ...form, unidade: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!editingPeca && (
              <div>
                <Label>Quantidade inicial</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.quantidade}
                  onChange={(e) => setForm({ ...form, quantidade: +e.target.value || 0 })}
                />
              </div>
            )}
            <div>
              <Label>Quantidade mínima</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                value={form.quantidade_minima}
                onChange={(e) => setForm({ ...form, quantidade_minima: +e.target.value || 0 })}
              />
            </div>
            <div>
              <Label>Valor de custo (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.valor_custo}
                onChange={(e) => setForm({ ...form, valor_custo: +e.target.value || 0 })}
              />
            </div>
            <div>
              <Label>Valor de venda (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.valor_venda}
                onChange={(e) => setForm({ ...form, valor_venda: +e.target.value || 0 })}
              />
            </div>
            <div>
              <Label>Localização</Label>
              <Input
                value={form.localizacao}
                onChange={(e) => setForm({ ...form, localizacao: e.target.value })}
                placeholder="Ex.: Prateleira A3"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <Input
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label>Ativo no estoque</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPecaDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSavePeca}>
              {editingPeca ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Movimentação de Estoque ─────────────────────────────── */}
      <Dialog open={!!movPecaId} onOpenChange={(v) => !v && setMovPecaId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Movimentar estoque</DialogTitle>
            {movPeca && (
              <p className="text-sm text-muted-foreground">
                {movPeca.descricao} — Saldo atual:{" "}
                <strong>{movPeca.quantidade} {movPeca.unidade}</strong>
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de movimentação *</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["entrada", "saida", "ajuste"] as const).map((tipo) => {
                  const labels = { entrada: "Entrada", saida: "Saída", ajuste: "Ajuste" };
                  const icons = {
                    entrada: <ArrowDownCircle className="h-4 w-4 text-emerald-500" />,
                    saida: <ArrowUpCircle className="h-4 w-4 text-red-500" />,
                    ajuste: <RefreshCw className="h-4 w-4 text-blue-500" />,
                  };
                  return (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setMovForm({ ...movForm, tipo })}
                      className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition ${movForm.tipo === tipo ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
                    >
                      {icons[tipo]}
                      {labels[tipo]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>
                {movForm.tipo === "ajuste"
                  ? "Novo saldo absoluto"
                  : `Quantidade (${movForm.tipo === "entrada" ? "a entrar" : "a sair"})`}
              </Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                value={movForm.quantidade || ""}
                onChange={(e) => setMovForm({ ...movForm, quantidade: +e.target.value || 0 })}
                placeholder="0"
              />
              {movForm.tipo === "ajuste" && movPeca && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Saldo atual: {movPeca.quantidade} → Novo saldo: {movForm.quantidade}
                </p>
              )}
              {movForm.tipo === "saida" && movPeca && movForm.quantidade > movPeca.quantidade && (
                <p className="mt-1 text-xs text-red-500">
                  Quantidade solicitada excede o saldo disponível ({movPeca.quantidade}).
                </p>
              )}
            </div>

            <div>
              <Label>Motivo / Observação</Label>
              <Input
                value={movForm.motivo}
                onChange={(e) => setMovForm({ ...movForm, motivo: e.target.value })}
                placeholder="Ex.: Reposição, Uso em OS #123..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovPecaId(null)}>Cancelar</Button>
            <Button onClick={handleMovimentacao} disabled={movForm.quantidade <= 0}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({
  label, value, icon: Icon, tone, onClick, active,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <Card
      className={`overflow-hidden transition ${onClick ? "cursor-pointer hover:border-primary/50" : ""} ${active ? "border-primary" : ""}`}
      onClick={onClick}
    >
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
