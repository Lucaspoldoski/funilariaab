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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import type { CategoryType } from "@/hooks/use-categories";

export const Route = createFileRoute("/settings")({
  component: () => (
    <AppLayout>
      <AdminGuard>
        <SettingsPage />
      </AdminGuard>
    </AppLayout>
  ),
});

const TABS: { type: CategoryType; label: string; description: string }[] = [
  { type: "servico", label: "Serviços", description: "Categorias de serviços (funilaria, pintura...)" },
  { type: "despesa", label: "Despesas", description: "Centros de custo / categorias de despesa" },
  { type: "receita", label: "Receitas", description: "Tipos de entradas financeiras" },
  { type: "forma_pagamento", label: "Formas de pagamento", description: "PIX, cartão, boleto..." },
  { type: "peca", label: "Peças", description: "Categorias de peças" },
  { type: "prioridade", label: "Prioridades", description: "Níveis de prioridade do serviço" },
];

function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Configurações do sistema</h1>
          <p className="text-sm text-muted-foreground">Centralize categorias, formas de pagamento e padrões da empresa.</p>
        </div>
      </div>

      <Tabs defaultValue="servico">
        <TabsList className="flex-wrap">
          {TABS.map((t) => <TabsTrigger key={t.type} value={t.type}>{t.label}</TabsTrigger>)}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.type} value={t.type}>
            <CategoryManager type={t.type} title={t.label} description={t.description} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function CategoryManager({ type, title, description }: { type: CategoryType; title: string; description: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#6366f1");

  const { data: cats = [] } = useQuery({
    queryKey: ["categories-all", type],
    queryFn: async () => (await supabase.from("categories").select("*").eq("type", type).order("name")).data ?? [],
  });

  // Counters: how many items use this category (across known tables)
  const { data: counts = {} } = useQuery({
    queryKey: ["category-counts", type],
    queryFn: async () => {
      const ids = (cats as any[]).map((c) => c.id);
      if (ids.length === 0) return {};
      const result: Record<string, number> = {};
      const tables = ["service_order_items", "quote_items", "financial_transactions"];
      for (const id of ids) result[id] = 0;
      for (const tbl of tables) {
        const { data } = await supabase.from(tbl as any).select("category_id").in("category_id", ids);
        (data ?? []).forEach((r: any) => { if (r.category_id) result[r.category_id] = (result[r.category_id] ?? 0) + 1; });
      }
      return result;
    },
    enabled: cats.length > 0,
  });

  async function create() {
    const clean = name.trim();
    if (!clean) return;
    const { error } = await supabase.from("categories").insert({ type, name: clean, slug: clean.toLowerCase(), color });
    if (error) {
      if (error.code === "23505") toast.error("Já existe uma categoria com esse nome");
      else toast.error(error.message);
      return;
    }
    toast.success("Categoria criada");
    setName(""); setOpen(false);
    qc.invalidateQueries({ queryKey: ["categories-all", type] });
    qc.invalidateQueries({ queryKey: ["categories", type] });
  }

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabase.from("categories").update({ active }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["categories-all", type] });
    qc.invalidateQueries({ queryKey: ["categories", type] });
  }

  async function remove(id: string, count: number) {
    if (count > 0) return toast.error(`Esta categoria está em uso em ${count} registro(s). Desative em vez de excluir.`);
    if (!confirm("Excluir esta categoria?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["categories-all", type] });
    qc.invalidateQueries({ queryKey: ["categories", type] });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Nova categoria</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova categoria</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
                <div><Label>Cor</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-24 p-1" /></div>
              </div>
              <DialogFooter><Button onClick={create}>Criar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {cats.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma categoria. Clique em "Nova categoria" para começar.</p>
        ) : (
          <div className="space-y-1">
            {(cats as any[]).map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border bg-card px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color ?? "#94a3b8" }} />
                  <span className={c.active ? "font-medium" : "font-medium text-muted-foreground line-through"}>{c.name}</span>
                  <Badge variant="outline" className="text-xs">{(counts as any)[c.id] ?? 0} vínculo(s)</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={c.active} onCheckedChange={(v) => toggleActive(c.id, v)} />
                  <Button variant="ghost" size="icon" onClick={() => remove(c.id, (counts as any)[c.id] ?? 0)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
