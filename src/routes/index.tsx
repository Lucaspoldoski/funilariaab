import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText, CheckCircle2, Clock, DollarSign, Plus, MessageCircle, Car,
} from "lucide-react";
import { fmtBRL, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/")({ component: () => <AppLayout><Dashboard /></AppLayout> });

const STATUS_TONE: Record<string, string> = {
  pendente: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  aprovado: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  recusado: "bg-red-500/15 text-red-600 dark:text-red-400",
  expirado: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente", aprovado: "Aprovado", recusado: "Recusado", expirado: "Expirado",
};

function Dashboard() {
  const { data: quotes = [] } = useQuery({
    queryKey: ["quotes-dash"],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotes")
        .select("id, number, status, total, created_at, valid_until, clients(name, phone, whatsapp), vehicles(brand, model, plate)")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = (quotes as any[]).filter((q) => q.created_at?.slice(0, 10) === today).length;
  const approved = (quotes as any[]).filter((q) => q.status === "aprovado");
  const pending = (quotes as any[]).filter((q) => q.status === "pendente");
  const totalQuoted = (quotes as any[]).reduce((s, q) => s + Number(q.total || 0), 0);

  const stats = [
    { label: "Orçamentos hoje", value: todayCount, icon: FileText, tone: "text-primary" },
    { label: "Aprovados", value: approved.length, icon: CheckCircle2, tone: "text-emerald-500" },
    { label: "Pendentes", value: pending.length, icon: Clock, tone: "text-amber-500" },
    { label: "Valor total orçado", value: fmtBRL(totalQuoted), icon: DollarSign, tone: "text-primary" },
  ];

  function whatsapp(q: any) {
    const num = (q.clients?.whatsapp || q.clients?.phone || "").replace(/\D/g, "");
    if (!num) return;
    const text = encodeURIComponent(
      `Olá ${q.clients?.name ?? ""}, segue seu orçamento #${q.number}. Valor: ${fmtBRL(q.total)}${q.valid_until ? ` (válido até ${fmtDate(q.valid_until)})` : ""}.`,
    );
    window.open(`https://wa.me/${num.length >= 11 ? num : `55${num}`}?text=${text}`, "_blank");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Central de Orçamentos</h1>
          <p className="text-sm text-muted-foreground">Acompanhe o pipeline comercial e atenda em segundos.</p>
        </div>
        <Button asChild size="lg" className="h-12 px-6 text-base shadow-lg">
          <Link to="/quotes/new"><Plus className="mr-2 h-5 w-5" /> NOVO ORÇAMENTO</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                <s.icon className={`h-4 w-4 ${s.tone}`} />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Últimos orçamentos</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link to="/quotes">Ver todos</Link></Button>
          </div>
        </CardHeader>
        <CardContent>
          {quotes.length === 0 ? (
            <div className="py-10 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhum orçamento ainda. Comece criando o primeiro.</p>
              <Button asChild className="mt-4"><Link to="/quotes/new"><Plus className="mr-2 h-4 w-4" />Criar Orçamento</Link></Button>
            </div>
          ) : (
            <div className="divide-y">
              {(quotes as any[]).slice(0, 10).map((q) => (
                <div key={q.id} className="flex items-center gap-3 py-3">
                  <Link to="/quotes/$id" params={{ id: q.id }} className="flex flex-1 items-center gap-3 min-w-0 hover:opacity-80">
                    <div className="font-mono text-sm font-medium text-primary">#{q.number}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{q.clients?.name ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {q.vehicles ? <><Car className="mr-1 inline h-3 w-3" />{q.vehicles.brand} {q.vehicles.model} · {q.vehicles.plate}</> : "—"}
                      </p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="text-sm font-semibold">{fmtBRL(q.total)}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(q.created_at)}</p>
                    </div>
                    <Badge variant="outline" className={STATUS_TONE[q.status]}>{STATUS_LABEL[q.status]}</Badge>
                  </Link>
                  <Button variant="ghost" size="icon" onClick={() => whatsapp(q)} title="WhatsApp">
                    <MessageCircle className="h-4 w-4 text-emerald-600" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
