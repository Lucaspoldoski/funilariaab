import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

function ComingSoon({ title, desc }: { title: string; desc: string }) {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Construction className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium">Em construção</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Este módulo faz parte do roadmap e será entregue nas próximas iterações. A fundação (banco, autenticação e modelos) já está pronta para suportá-lo.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

export const Route = createFileRoute("/calendar")({
  component: () => <ComingSoon title="Agenda" desc="Calendário visual com entrada, previsão de entrega e agendamentos." />,
});
