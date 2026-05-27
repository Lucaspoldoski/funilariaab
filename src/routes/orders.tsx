import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/orders")({
  component: () => (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ordens de Serviço</h1>
          <p className="text-sm text-muted-foreground">Geração de OS com peças, serviços e assinatura digital.</p>
        </div>
        <Card><CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Construction className="h-6 w-6" /></div>
          <p className="text-sm font-medium">Em construção</p>
          <p className="max-w-md text-xs text-muted-foreground">Próxima entrega: OS, orçamentos com PDF/WhatsApp, fotos com marcação, módulo financeiro e calendário inteligente.</p>
        </CardContent></Card>
      </div>
    </AppLayout>
  ),
});
