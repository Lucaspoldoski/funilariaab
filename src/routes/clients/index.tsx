import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
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
      const { data, error } = await supabase.from("clients").select("*, vehicles(count)").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = data.filter((c: any) =>
    !q || c.name?.toLowerCase().includes(q.toLowerCase()) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q.toLowerCase())
  );

  async function createClient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("clients").insert({
      name: String(fd.get("name")),
      document: String(fd.get("document") ?? "") || null,
      phone: String(fd.get("phone") ?? "") || null,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">Base de clientes da oficina.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo cliente</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
            <form onSubmit={createClient} className="space-y-3">
              <div><Label>Nome *</Label><Input name="name" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>CPF / CNPJ</Label><Input name="document" /></div>
                <div><Label>Telefone</Label><Input name="phone" /></div>
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
        <Input placeholder="Buscar..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card>
        <CardHeader><CardTitle>{filtered.length} cliente(s)</CardTitle></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum cliente cadastrado.</p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2 pr-3">Nome</th><th className="py-2 pr-3">Telefone</th><th className="py-2 pr-3">E-mail</th><th className="py-2 pr-3">Veículos</th></tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((c: any) => (
                    <tr key={c.id} className="hover:bg-muted/40">
                      <td className="py-3 pr-3 font-medium">{c.name}</td>
                      <td className="py-3 pr-3">{c.phone ?? "—"}</td>
                      <td className="py-3 pr-3">{c.email ?? "—"}</td>
                      <td className="py-3 pr-3">{c.vehicles?.[0]?.count ?? 0}</td>
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
