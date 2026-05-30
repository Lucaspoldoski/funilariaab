import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Printer, FileSignature, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtBRL, fmtDateTime } from "@/lib/format";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";

export const Route = createFileRoute("/orders/$id")({ component: () => <AppLayout><OrderDetail /></AppLayout> });

const STATUSES = ["rascunho","aprovada","em_execucao","concluida","cancelada"];
const LABEL: Record<string, string> = { rascunho: "Rascunho", aprovada: "Aprovada", em_execucao: "Em execução", concluida: "Concluída", cancelada: "Cancelada" };

function OrderDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sigRef = React.useRef<SignaturePadHandle>(null);

  const { data: order } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_orders").select("*, vehicles(*), clients(*)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["order-items", id],
    queryFn: async () => {
      const { data } = await supabase.from("service_order_items").select("*").eq("order_id", id).order("created_at");
      return data ?? [];
    },
  });

  if (!order) return <p className="text-muted-foreground">Carregando...</p>;

  async function updateStatus(s: string) {
    const { error } = await supabase.from("service_orders").update({ status: s as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado");
    qc.invalidateQueries({ queryKey: ["order", id] });

    if (s === "concluida") {
      await supabase.from("financial_transactions").insert({
        type: "receita", status: "pendente", category: "OS",
        description: `OS #${order!.number} - ${(order as any)!.clients?.name ?? ""}`,
        amount: order!.total, order_id: id, client_id: order!.client_id, vehicle_id: order!.vehicle_id,
      });
      toast.success("Recebível gerado no financeiro");
    }
  }

  async function saveSignature() {
    const data = sigRef.current?.toDataURL();
    if (!data) return toast.error("Assine antes de salvar");
    const { error } = await supabase.from("service_orders").update({ signature_data: data, signed_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Assinatura salva");
    qc.invalidateQueries({ queryKey: ["order", id] });
  }

  async function remove() {
    if (!confirm("Excluir esta OS?")) return;
    const { error } = await supabase.from("service_orders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("OS excluída");
    navigate({ to: "/orders" });
  }

  const o = order as any;


  return (
    <div className="mx-auto max-w-5xl space-y-6 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon"><Link to="/orders"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">OS #{o.number}</h1>
            <p className="text-sm text-muted-foreground">{fmtDateTime(o.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={o.status} onValueChange={updateStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{LABEL[s]}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
          <Button variant="outline" size="icon" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="mb-6 flex flex-wrap justify-between gap-4 border-b pb-4">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Cliente</p>
              <p className="text-base font-semibold">{o.clients?.name}</p>
              <p className="text-sm text-muted-foreground">{o.clients?.phone} {o.clients?.email && `· ${o.clients?.email}`}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase text-muted-foreground">Veículo</p>
              <p className="text-base font-semibold">{o.vehicles?.brand} {o.vehicles?.model}</p>
              <p className="text-sm font-mono text-muted-foreground">{o.vehicles?.plate}</p>
            </div>
          </div>

          {o.description && (
            <div className="mb-4">
              <p className="text-xs uppercase text-muted-foreground">Descrição</p>
              <p className="text-sm whitespace-pre-wrap">{o.description}</p>
            </div>
          )}

          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Tipo</th><th className="py-2">Descrição</th><th className="py-2 text-right">Qtd</th><th className="py-2 text-right">Preço</th><th className="py-2 text-right">Total</th></tr>
            </thead>
            <tbody className="divide-y">
              {(items as any[]).map(it => (
                <tr key={it.id}>
                  <td className="py-2"><Badge variant="outline">{it.item_type === "servico" ? "Serviço" : "Peça"}</Badge></td>
                  <td className="py-2">{it.description}</td>
                  <td className="py-2 text-right">{it.quantity}</td>
                  <td className="py-2 text-right">{fmtBRL(it.unit_price)}</td>
                  <td className="py-2 text-right font-medium">{fmtBRL(it.total)}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Sem itens.</td></tr>}
            </tbody>
          </table>

          <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Mão de obra</span><span>{fmtBRL(o.labor_total)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Peças</span><span>{fmtBRL(o.parts_total)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span>-{fmtBRL(o.discount)}</span></div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span>{fmtBRL(o.total)}</span></div>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileSignature className="h-4 w-4" /> Assinatura do cliente</CardTitle></CardHeader>
        <CardContent>
          {o.signature_data ? (
            <div>
              <img src={o.signature_data} alt="Assinatura" className="h-40 rounded-md border bg-white object-contain p-2" />
              <p className="mt-2 text-xs text-muted-foreground">Assinado em {fmtDateTime(o.signed_at)}</p>
            </div>
          ) : (
            <>
              <SignaturePad ref={sigRef} />
              <div className="mt-2 flex justify-end print:hidden">
                <Button onClick={saveSignature}>Salvar assinatura</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
