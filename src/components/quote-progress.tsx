import * as React from "react";
import { Check, User, Car, Camera, Wrench, DollarSign, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = { key: string; label: string; icon: React.ElementType; done: boolean };

export function QuoteProgress({
  client, vehicle, photos, items, financial,
}: { client: boolean; vehicle: boolean; photos: boolean; items: boolean; financial: boolean }) {
  const steps: Step[] = [
    { key: "client", label: "Cliente", icon: User, done: client },
    { key: "vehicle", label: "Veículo", icon: Car, done: vehicle },
    { key: "photos", label: "Fotos", icon: Camera, done: photos },
    { key: "items", label: "Serviços", icon: Wrench, done: items },
    { key: "financial", label: "Financeiro", icon: DollarSign, done: financial },
  ];
  const allDone = steps.every((s) => s.done);
  const completed = steps.filter((s) => s.done).length;

  return (
    <div className="sticky top-0 z-20 -mx-2 mb-4 rounded-lg border bg-card/95 px-3 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto sm:gap-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <React.Fragment key={s.key}>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border-2 transition",
                      s.done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-muted-foreground/30 bg-muted text-muted-foreground",
                    )}
                  >
                    {s.done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className={cn("hidden text-xs font-medium sm:inline", s.done ? "text-foreground" : "text-muted-foreground")}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={cn("h-px flex-1 min-w-2", s.done ? "bg-emerald-500" : "bg-muted-foreground/20")} />
                )}
              </React.Fragment>
            );
          })}
        </div>
        <div className="flex-shrink-0 text-xs text-muted-foreground">
          {completed}/5
        </div>
      </div>
      {allDone && (
        <div className="mt-2 flex items-center justify-center gap-2 rounded-md bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <Sparkles className="h-3 w-3" /> ORÇAMENTO PRONTO PARA ENVIO
        </div>
      )}
    </div>
  );
}
