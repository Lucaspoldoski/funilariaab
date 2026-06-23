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
import { Plus, Pencil, Trash2, Search, Wrench } from "lucide-react";
import { toast } from "sonner";
import { fmtBRL } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/services/")({
  component: () => <AppLayout><ServicesPage /></AppLayout>,
});

const CATEGORIES = ["Funilaria", "Pintura", "Polimento", "Mecânica", "Elétrica", "Outros"];

type ServiceRow = {
  id: string;
  name: string;
  price: number;
  color: string | null;
  active: boolean;
  slug: string;
};

type FormState = { name: string; price: number; category: string; active: boolean };
const EMPTY: FormState = { name: "", price: 0, category: "Funilaria", active: true };

function ServicesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ServiceRow | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["catalog-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, price, color, active, slug")
        .eq("type", "servico")
        .order("name");
      if (error) {
        toast.error("Erro ao carregar serviços: " + error.message);
        throw error;
      }
      return (data ?? []) as ServiceRow[];
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

  // Cada serviço tem uma cor mapeada pela categoria informada no nome
  function colorForCategory(cat: string): string {
    const map: Record<string, string> = {
      Funilaria: "#f59e0b", Pintura: "#a855f7", Polimento: "#06b6d4",
      Mecânica: "#ef4444", Elétrica: "#3b82f6", Outros: "#6b7280",
    };
    return map[cat] ?? "#6b7280";
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(svc: ServiceRow) {
    setEditing(svc);
    setForm({ name: svc.name, price: svc.price, category: "Funilaria", active: svc.active });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Informe o nome do serviço"); return; }
    const slug = slugify(form.name);
    const color = colorForCategory(form.category);

    if (editing) {
      const { error } = await supabase
        .from("categories")
        .update({ name: form.name, price: form.price, active: form.active, color })
        .eq("id", editing.id);
      if (error) { toast.error("Erro ao atualizar: " + error.message); return; }
      toast.success("Serviço atualizado");
    } else {
      const { error } = await supabase
        .from("categories")
        .insert({
          type: "servico",
          name: form.name,
          slug,
          price: form.price,
          active: form.active,
          color,
          created_by: user?.id ?? null,
        });
      if (error) {
        if (error.code === "23505") {
          toast.error("Já existe um serviço com esse nome.");
        } else {
          toast.error("Erro ao criar: " + error.message);
        }
        return;
      }
      toast.success("Serviço cadastrado");
    }
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["catalog-services"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este serviço do catálogo?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success("Serviço excluído");
    qc.invalidateQueries({ queryKey: ["catalog-services"] });
  }

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabase.from("categories").update({ active }).eq("id", id);
    if (error) { toast.error("Erro ao atualizar status"); return; }
    qc.invalidateQueries({ queryKey: ["catalog-services"] });
  }

  const filtered = services.filter((s) => {
    if (!q) return true;
    return s.name.toLowerCase().includes(q.toLowerCase());
  });

  const activeCount = services.filter((s) => s.active).length;
  const avgPrice = services.length > 0
    ? services.reduce((acc, s) => acc + s.price, 0) / services.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Serviços</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de serviços pré-cadastrados. Aparecem automaticamente no orçamento.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />Novo serviço
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar serviço" : "Novo serviço"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Pintura de Porta"
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
                  <Label>Categoria</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total cadastrados</p>
          <p className="text-2xl font-semibold">{services.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Ativos</p>
          <p className="text-2xl font-semibold text-emerald-500">{activeCount}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Inativos</p>
          <p className="text-2xl font-semibold text-muted-foreground">{services.length - activeCount}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Preço médio</p>
          <p className="text-2xl font-semibold">{services.length > 0 ? fmtBRL(avgPrice) : "—"}</p>
        </CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome..."
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filtered.length} serviço(s)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <Wrench className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum serviço encontrado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Nome</th>
                    <th className="py-2 pr-3 text-right">Preço padrão</th>
                    <th className="py-2 pr-3 text-center">Ativo</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((s) => (
                    <tr key={s.id} className={`hover:bg-muted/40 ${!s.active ? "opacity-50" : ""}`}>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2">
                          {s.color && (
                            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                          )}
                          <span className="font-medium">{s.name}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-right font-mono">{fmtBRL(s.price)}</td>
                      <td className="py-3 pr-3 text-center">
                        <Switch
                          checked={s.active}
                          onCheckedChange={(v) => toggleActive(s.id, v)}
                        />
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}>
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
