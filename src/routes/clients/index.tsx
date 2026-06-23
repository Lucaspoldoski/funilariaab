import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Search, MessageCircle, ChevronRight, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/clients/")({ component: () => <AppLayout><ClientsPage /></AppLayout> });

function ClientsPage() {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data = [] } = useQuery({
    queryKey: ["clients-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, vehicles(count), quotes(count)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = (data as any[]).filter((c) =>
    !q ||
    c.name?.toLowerCase().includes(q.toLowerCase()) ||
    c.phone?.includes(q) ||
    c.email?.toLowerCase().includes(q.toLowerCase()) ||
    (c as any).document?.includes(q)
  );

  async function createClient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("clients").insert({
      name: String(fd.get("name")),
      document: String(fd.get("document") ?? "") || null,
      phone: String(fd.get("phone") ?? "") || null,
      whatsapp: String(fd.get("whatsapp") ?? "") || null,
      email: String(fd.get("email") ?? "") || null,
      address: String(fd.get("address") ?? "") || null,
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Cliente cadastrado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["clients-full"] });
    qc.invalidateQueries({ queryKey: ["clients"] });
  }

  function openWhatsapp(e: React.MouseEvent, c: any) {
    e.preventDefault();
    e.stopPropagation();
    const num = (c.whatsapp || c.phone || "").replace(/\D/g, "");
    if (!num) { toast.error("Cliente sem WhatsApp/telefone"); return; }
    window.open(`https://wa.me/${num.length >= 11 ? num : `55${num}`}`, "_blank");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">Base de clientes da oficina.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Novo cliente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
            <form onSubmit={createClient} className="space-y-3">
              <div>
                <Label>Nome *</Label>
                <Input name="name" required placeholder="Nome completo" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>CPF / CNPJ</Label><Input name="document" /></div>
                <div><Label>Telefone</Label><Input name="phone" /></div>
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input name="whatsapp" placeholder="(11) 99999-0000" />
              </div>
              <div><Label>E-mail</Label><Input name="email" type="email" /></div>
              <div><Label>Endereço</Label><Input name="address" /></div>
              <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone, CPF..."
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filtered.length} cliente(s)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-10 text-center">
              <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {q ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado."}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((c: any) => (
                <Link
                  key={c.id}
                  to="/clients/$id"
                  params={{ id: c.id }}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-muted/40 transition"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                    {(c.name ?? "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.phone ?? c.email ?? "Sem contato"}
                      {c.document && ` · ${c.document}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 text-xs text-muted-foreground">
                    <span>{c.vehicles?.[0]?.count ?? 0} veíc.</span>
                    <span>{c.quotes?.[0]?.count ?? 0} orç.</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => openWhatsapp(e, c)}
                      title="Abrir WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
