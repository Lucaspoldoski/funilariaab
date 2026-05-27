import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/reports")({
  component: () => (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
        <Card><CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Construction className="h-6 w-6" /></div>
          <p className="text-sm font-medium">Em construção</p>
        </CardContent></Card>
      </div>
    </AppLayout>
  ),
});
