import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Printer, MessageCircle, Wrench, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { fmtBRL, fmtDate, fmtDateTime } from "@/lib/format";
import { VehicleDiagram, type DiagramMark } from "@/components/vehicle-diagram";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/quotes/$id")({
  component: () => (
    <AppLayout>
      <QuoteDetail />
    </AppLayout>
  ),
});

const STATUS_LABEL: Record<string, string> = { pendente: "Pendente", aprovado: "Aprovado", recusado: "Recusado", expirado: "Expirado" };
const STATUS_TONE: Record<string, string> = {
  pendente: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  aprovado: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  recusado: "bg-red-500/15 text-red-600 dark:text-red-400",
  expirado: "bg-muted text-muted-foreground",
};

function QuoteDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [converting, setConverting] = React.useState(false);
  const [photoUrls, setPhotoUrls] = React.useState<Record<string, string>>({});

  const { data: quote } = useQuery({
    queryKey: ["quote", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*, clients(*), vehicles(*)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["quote-items", id],
    queryFn: async () => (await supabase.from("quote_items").select("*").eq("quote_id", id).order("created_at")).data ?? [],
  });
  const { data: photos = [] } = useQuery({
    queryKey: ["quote-photos", id, quote?.vehicle_id],
    enabled: !!quote?.vehicle_id,
    queryFn: async () => (await supabase
      .from("vehicle_photos")
      .select("*")
      .or(`quote_id.eq.${id},and(quote_id.is.null,vehicle_id.eq.${quote!.vehicle_id!})`)
      .order("created_at")).data ?? [],
  });

  React.useEffect(() => {
    (async () => {
      const map: Record<string, string> = {};
      await Promise.all((photos as any[]).map(async (p) => {
        const { data } = await supabase.storage.from("vehicle-photos").createSignedUrl(p.path, 3600);
        if (data?.signedUrl) map[p.id] = data.signedUrl;
      }));
      setPhotoUrls(map);
    })();
  }, [photos]);

  if (!quote) return <p className="text-muted-foreground">Carregando...</p>;
  const q = quote as any;
  const services = (items as any[]).filter((i) => i.item_type === "servico");
  const parts = (items as any[]).filter((i) => i.item_type === "peca");
  const diagram: DiagramMark[] = Array.isArray(q.diagram_marks) ? q.diagram_marks : [];

  async function updateStatus(s: string) {
    const { error } = await supabase.from("quotes").update({ status: s as any }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["quote", id] });
  }

  function whatsapp() {
    const num = (q.clients?.whatsapp || q.clients?.phone || "").replace(/\D/g, "");
    if (!num) return toast.error("Cliente sem telefone/WhatsApp cadastrado");
    const url = window.location.href;
    const text = encodeURIComponent(
      `Olá ${q.clients?.name ?? ""}, segue seu orçamento #${q.number} de reparo automotivo.\n` +
      `Veículo: ${q.vehicles?.brand ?? ""} ${q.vehicles?.model ?? ""} (${q.vehicles?.plate ?? ""})\n` +
      `Valor: ${fmtBRL(q.total)}${q.valid_until ? ` (válido até ${fmtDate(q.valid_until)})` : ""}\n` +
      `Detalhes: ${url}\n\nQualquer dúvida estamos à disposição.`
    );
    window.open(`https://wa.me/${num.length >= 11 ? num : `55${num}`}?text=${text}`, "_blank");
  }

  async function convertToOrder() {
    if (q.converted_order_id) {
      navigate({ to: "/orders/$id", params: { id: q.converted_order_id } });
      return;
    }
    if (!confirm("Aprovar este orçamento e gerar uma Ordem de Serviço?")) return;
    setConverting(true);
    try {
      const { data: order, error } = await supabase.from("service_orders").insert({
        client_id: q.client_id, vehicle_id: q.vehicle_id,
        description: q.description || q.notes || null,
        labor_total: q.labor_total, parts_total: q.parts_total, discount: q.discount, total: q.total,
        status: "aprovada", created_by: user?.id,
      }).select("id").single();
      if (error) { toast.error(error.message); return; }
      if (items.length) {
        const { error: e2 } = await supabase.from("service_order_items").insert(
          (items as any[]).map((i) => ({
            order_id: order.id, item_type: i.item_type, description: i.description,
            quantity: i.quantity, unit_price: i.unit_price, total: i.total,
          }))
        );
        if (e2) toast.error(e2.message);
      }
      await supabase.from("quotes").update({ status: "aprovado", converted_order_id: order.id }).eq("id", id);
      toast.success("Ordem de Serviço criada");
      navigate({ to: "/orders/$id", params: { id: order.id } });
    } finally {
      setConverting(false);
    }
  }

  async function remove() {
    if (!confirm("Excluir este orçamento?")) return;
    await supabase.from("quote_items").delete().eq("quote_id", id);
    const { error } = await supabase.from("quotes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Orçamento excluído");
    navigate({ to: "/quotes" });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon"><Link to="/quotes"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Orçamento #{q.number}</h1>
            <p className="text-sm text-muted-foreground">{fmtDateTime(q.created_at)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={q.status} onValueChange={updateStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Imprimir / PDF</Button>
          <Button variant="outline" onClick={whatsapp}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button>
          <Button onClick={convertToOrder} disabled={converting}>
            <Wrench className="mr-2 h-4 w-4" />{q.converted_order_id ? "Ver OS" : "Aprovar e gerar OS"}
          </Button>
          <Button variant="outline" size="icon" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Printable document */}
      <div className="space-y-4 print:space-y-2">
        <Card className="print:border-0 print:shadow-none">
          <CardContent className="p-6 print:p-2">
            <div className="mb-4 flex items-start justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Wrench className="h-5 w-5" /></div>
                  <div>
                    <p className="text-lg font-bold">Funilaria Pro</p>
                    <p className="text-xs text-muted-foreground">Serviços de funilaria e pintura</p>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase text-muted-foreground">Orçamento</p>
                <p className="text-2xl font-bold">#{q.number}</p>
                <Badge variant="outline" className={STATUS_TONE[q.status]}>{STATUS_LABEL[q.status]}</Badge>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Cliente</p>
                <p className="text-base font-semibold">{q.clients?.name}</p>
                <p className="text-sm text-muted-foreground">
                  {q.clients?.document && <>CPF/CNPJ: {q.clients.document}<br /></>}
                  {q.clients?.phone && <>Tel: {q.clients.phone}<br /></>}
                  {q.clients?.whatsapp && <>WhatsApp: {q.clients.whatsapp}<br /></>}
                  {q.clients?.email}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Veículo</p>
                <p className="text-base font-semibold">{q.vehicles?.brand} {q.vehicles?.model} {q.vehicles?.year}</p>
                <p className="text-sm font-mono text-muted-foreground">{q.vehicles?.plate} {q.vehicles?.color && `· ${q.vehicles.color}`}</p>
                <p className="text-xs text-muted-foreground">
                  {q.vehicles?.mileage && <>{q.vehicles.mileage} km · </>}
                  {q.vehicles?.insurer && <>Seguradora: {q.vehicles.insurer} </>}
                  {q.vehicles?.claim_number && <>· Sinistro: {q.vehicles.claim_number}</>}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {services.length > 0 && (
          <Card className="print:border-0 print:shadow-none">
            <CardHeader className="print:py-2"><CardTitle className="text-base">Serviços</CardTitle></CardHeader>
            <CardContent>
              <ItemTable items={services} />
            </CardContent>
          </Card>
        )}

        {parts.length > 0 && (
          <Card className="print:border-0 print:shadow-none">
            <CardHeader className="print:py-2"><CardTitle className="text-base">Peças</CardTitle></CardHeader>
            <CardContent>
              <ItemTable items={parts} />
            </CardContent>
          </Card>
        )}

        {photos.length > 0 && (
          <Card className="print:border-0 print:shadow-none">
            <CardHeader className="print:py-2"><CardTitle className="text-base">Fotos da vistoria</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
                {(photos as any[]).map((p) => {
                  const shapes: any[] = Array.isArray(p.marks) ? p.marks : [];
                  return (
                    <div key={p.id} className="relative overflow-hidden rounded-md border break-inside-avoid">
                      {photoUrls[p.id] && <img src={photoUrls[p.id]} alt="" className="aspect-square w-full object-cover" />}
                      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {shapes.map((s, i) => {
                          if (s.kind === "circle") return <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="none" stroke="#ef4444" strokeWidth="0.5" />;
                          if (s.kind === "rect") return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill="none" stroke="#ef4444" strokeWidth="0.5" />;
                          if (s.kind === "arrow") return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#ef4444" strokeWidth="0.6" />;
                          return null;
                        })}
                      </svg>
                      {shapes.map((s, i) => {
                        const pos = s.kind === "point" ? { x: s.x, y: s.y } : s.kind === "arrow" ? { x: s.x1, y: s.y1 } : { x: s.x, y: s.y };
                        return (
                          <div key={i} className="absolute z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-red-500 text-[10px] font-bold text-white" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
                            {i + 1}
                          </div>
                        );
                      })}
                      {p.damage_description && (
                        <p className="border-t bg-muted/40 px-2 py-1 text-[11px]">{p.damage_description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {diagram.length > 0 && (
          <Card className="print:border-0 print:shadow-none break-inside-avoid">
            <CardHeader className="print:py-2"><CardTitle className="text-base">Diagrama de danos</CardTitle></CardHeader>
            <CardContent>
              <VehicleDiagram value={diagram} readOnly />
            </CardContent>
          </Card>
        )}

        <Card className="print:border-0 print:shadow-none">
          <CardContent className="p-6 print:p-2">
            <div className="ml-auto max-w-sm space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Mão de obra</span><span>{fmtBRL(q.labor_total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Peças</span><span>{fmtBRL(q.parts_total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span>- {fmtBRL(q.discount)}</span></div>
              <div className="flex justify-between border-t pt-2 text-lg font-semibold"><span>Total</span><span>{fmtBRL(q.total)}</span></div>
              {q.valid_until && <p className="pt-2 text-xs text-muted-foreground">Válido até {fmtDate(q.valid_until)}</p>}
            </div>

            <div className="mt-6 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
              {q.payment_method && <div><p className="text-xs uppercase text-muted-foreground">Forma de pagamento</p><p>{q.payment_method}</p></div>}
              {q.payment_terms && <div><p className="text-xs uppercase text-muted-foreground">Condições</p><p>{q.payment_terms}</p></div>}
              {q.warranty && <div><p className="text-xs uppercase text-muted-foreground">Garantia</p><p>{q.warranty}</p></div>}
              {q.delivery_forecast && <div><p className="text-xs uppercase text-muted-foreground">Previsão de entrega</p><p>{fmtDate(q.delivery_forecast)}</p></div>}
            </div>

            {q.notes && (
              <div className="mt-6 border-t pt-4">
                <p className="text-xs uppercase text-muted-foreground">Observações</p>
                <p className="text-sm whitespace-pre-wrap">{q.notes}</p>
              </div>
            )}

            <div className="mt-12 grid grid-cols-2 gap-12 pt-6 text-center text-sm">
              <div>
                <div className="mx-auto mb-1 h-px w-3/4 bg-foreground/60" />
                <p className="text-xs text-muted-foreground">Cliente</p>
              </div>
              <div>
                <div className="mx-auto mb-1 h-px w-3/4 bg-foreground/60" />
                <p className="text-xs text-muted-foreground">Responsável</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {q.converted_order_id && (
        <Card className="border-emerald-500/50 bg-emerald-500/5 print:hidden">
          <CardContent className="flex items-center justify-between p-4 text-sm">
            <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Orçamento aprovado e convertido em Ordem de Serviço.</span>
            <Button asChild size="sm"><Link to="/orders/$id" params={{ id: q.converted_order_id }}>Ver OS</Link></Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ItemTable({ items }: { items: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-muted-foreground">
        <tr><th className="py-1">Descrição</th><th className="py-1 text-right">Qtd</th><th className="py-1 text-right">Unitário</th><th className="py-1 text-right">Total</th></tr>
      </thead>
      <tbody className="divide-y">
        {items.map((i) => (
          <tr key={i.id}>
            <td className="py-2">{i.description}</td>
            <td className="py-2 text-right">{i.quantity}</td>
            <td className="py-2 text-right">{fmtBRL(i.unit_price)}</td>
            <td className="py-2 text-right font-medium">{fmtBRL(i.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
