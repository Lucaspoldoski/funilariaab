import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/app-layout";
import { AdminGuard } from "@/components/admin-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDateTime } from "@/lib/format";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/audit")({
  component: () => (
    <AppLayout>
      <AdminGuard roles={["admin"]}>
        <AuditPage />
      </AdminGuard>
    </AppLayout>
  ),
});

const TABLE_LABEL: Record<string, string> = {
  clients: "Cliente", vehicles: "Veículo", service_orders: "OS", quotes: "Orçamento", financial_transactions: "Financeiro",
};

const ACTION_TONE: Record<string, string> = {
  INSERT: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  UPDATE: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  DELETE: "bg-red-500/15 text-red-600 dark:text-red-400",
};

function AuditPage() {
  const [search, setSearch] = React.useState("");
  const [tableFilter, setTableFilter] = React.useState<string>("all");

  const { data = [] } = useQuery({
    queryKey: ["audit", tableFilter],
    queryFn: async () => {
      let q = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500);
      if (tableFilter !== "all") q = q.eq("table_name", tableFilter);
      const { data } = await q;
      return data ?? [];
    },
  });

  const filtered = (data as any[]).filter((r) => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Auditoria do sistema</h1>
          <p className="text-sm text-muted-foreground">Histórico de criações, edições e exclusões. Apenas administradores.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as tabelas</SelectItem>
                {Object.entries(TABLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem registros de auditoria.</p>
          ) : (
            <CardTitle className="sr-only">Logs</CardTitle>
          )}
          <div className="space-y-1">
            {filtered.map((r) => (
              <details key={r.id} className="rounded-md border bg-card">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <Badge variant="outline" className={ACTION_TONE[r.action]}>{r.action}</Badge>
                  <Badge variant="outline">{TABLE_LABEL[r.table_name] ?? r.table_name}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{(r.record_id ?? "").slice(0, 8)}</span>
                  <span className="text-muted-foreground">por</span>
                  <span className="font-medium">{r.user_email ?? "—"}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</span>
                </summary>
                <div className="grid gap-2 border-t p-3 text-xs sm:grid-cols-2">
                  {r.old_data && <pre className="overflow-x-auto rounded bg-muted p-2"><b>Antes:</b>{"\n"}{JSON.stringify(r.old_data, null, 2)}</pre>}
                  {r.new_data && <pre className="overflow-x-auto rounded bg-muted p-2"><b>Depois:</b>{"\n"}{JSON.stringify(r.new_data, null, 2)}</pre>}
                </div>
              </details>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
