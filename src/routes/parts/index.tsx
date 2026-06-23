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
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, Package } from "lucide-react";
import { toast } from "sonner";
import { fmtBRL } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/parts/")({
  component: () => <AppLayout><PartsPage /></AppLayout>,
});

const UNITS = ["un", "pç", "m", "m²", "L", "kg", "cx", "jg"];

type PartRow = {
  id: string;
  name: string;
  price: number;
  unit: string;
  active: boolean;
  slug: string;
};

type FormState = { name: string; price: number; unit: string; active: boolean };
const EMPTY: FormState = { name: "", price: 0, unit: "un", active: true };

function PartsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PartRow | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY);

  const { data: parts = [], isLoading } = useQuery({
    queryKey: ["catalog-parts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, price, unit, active, slug")
        .eq("type", "peca")
        .order("name");
      if (error) {
        toast.error("Erro ao carregar peças: " + error.message);
        throw error;
      }
      return (data ?? []) as PartRow[];
    },
  });

  function slugify(name: string): string {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(p: PartRow) {
    setEditing(p);
    setForm({ name: p.name, price: p.price, unit: p.unit, active: p.active });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Informe o nome da peça"); return; }
    const slug = slugify(form.name);

    if (editing) {
      const { error } = await supabase
        .from("categories")
        .update({ name: form.name, price: form.price, unit: form.unit, active: form.active })
        .eq("id", editing.id);
      if (error) { toast.error("Erro ao atualizar: " + error.message); return; }
      toast.success("Peça atualizada");
    } else {
      const { error } = await supabase
        .from("categories")
        .insert({
          type: "peca",
          name: form.name,
          slug,
          price: form.price,
          unit: form.unit,
          active: form.active,
          created_by: user?.id ?? null,
        });
      if (error) {
        if (error.code === "23505") {
          toast.error("Já existe uma peça com esse nome.");
        } else {
          toast.error("Erro ao criar: " + error.message);
        }
        return;
      }
      toast.success("Peça cadastrada");
    }
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["catalog-parts"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta peça do catálogo?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success("Peça excluída");
    qc.invalidateQueries({ queryKey: ["catalog-parts"] });
  }

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabase.from("categories").update({ active }).eq("id", id);
    if (error) { toast.error("Erro ao atualizar status"); return; }
    qc.invalidateQueries({ queryKey: ["catalog-parts"] });
  }

  const filtered = parts.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const activeCount = parts.filter((p) => p.active).length;
  const avgPrice = parts.length > 0
    ? parts.reduce((acc, p) => acc + p.price, 0) / parts.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Peças</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de peças com preços padrão. Use no orçamento para agilizar o preenchimento.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />Nova peça
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar peça" : "Nova peça"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Para-lama dianteiro esquerdo"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Preço padrão (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: +e.target.value || 0 })}
                  />
                </div>
                <div>
                  <Label>Unidade</Label>
                  <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v })}
                />
                <Label>Ativo (aparece no orçamento)</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total cadastradas</p>
          <p className="text-2xl font-semibold">{parts.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Ativas</p>
          <p className="text-2xl font-semibold text-emerald-500">{activeCount}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Preço médio</p>
          <p className="text-2xl font-semibold">
            {parts.length > 0 ? fmtBRL(avgPrice) : "—"}
          </p>
        </CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar peça..."
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filtered.length} peça(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma peça cadastrada ainda.</p>
              <Button className="mt-4" size="sm" onClick={openCreate}>
                <Plus className="mr-2 h-3 w-3" />Cadastrar primeira peça
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Nome</th>
                    <th className="py-2 pr-3 text-center">Unidade</th>
                    <th className="py-2 pr-3 text-right">Preço padrão</th>
                    <th className="py-2 pr-3 text-center">Ativo</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((p) => (
                    <tr key={p.id} className={`hover:bg-muted/40 ${!p.active ? "opacity-50" : ""}`}>
                      <td className="py-3 pr-3 font-medium">{p.name}</td>
                      <td className="py-3 pr-3 text-center">
                        <Badge variant="outline" className="text-xs">{p.unit}</Badge>
                      </td>
                      <td className="py-3 pr-3 text-right font-mono">{fmtBRL(p.price)}</td>
                      <td className="py-3 pr-3 text-center">
                        <Switch
                          checked={p.active}
                          onCheckedChange={(v) => toggleActive(p.id, v)}
                        />
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
