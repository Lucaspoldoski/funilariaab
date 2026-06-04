import * as React from "react";
import { X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type DiagramMark = { view: string; x: number; y: number; label: string };

const VIEWS = [
  { key: "frontal", label: "Frontal" },
  { key: "traseira", label: "Traseira" },
  { key: "esquerda", label: "Lat. Esq." },
  { key: "direita", label: "Lat. Dir." },
  { key: "superior", label: "Superior" },
] as const;

export function VehicleDiagram({
  value,
  onChange,
  readOnly = false,
}: {
  value: DiagramMark[];
  onChange?: (m: DiagramMark[]) => void;
  readOnly?: boolean;
}) {
  const [view, setView] = React.useState<string>("frontal");
  const ref = React.useRef<HTMLDivElement>(null);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (readOnly || !onChange) return;
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    const label = prompt("Descreva o dano nesta área:") ?? "";
    if (label.trim()) onChange([...value, { view, x, y, label }]);
  }

  const marks = value.filter((m) => m.view === view);

  return (
    <div className="space-y-3">
      <Tabs value={view} onValueChange={setView}>
        <TabsList className="flex-wrap">
          {VIEWS.map((v) => {
            const count = value.filter((m) => m.view === v.key).length;
            return (
              <TabsTrigger key={v.key} value={v.key}>
                {v.label} {count > 0 && <span className="ml-1 rounded-full bg-red-500/20 px-1.5 text-xs text-red-600">{count}</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div
        ref={ref}
        onClick={handleClick}
        className={`relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-muted/30 ${readOnly ? "" : "cursor-crosshair"}`}
      >
        <CarSvg view={view} />
        {marks.map((m, i) => {
          const idx = value.indexOf(m) + 1;
          return (
            <div
              key={i}
              className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
              style={{ left: `${m.x}%`, top: `${m.y}%` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-red-500 text-xs font-bold text-white shadow-lg">
                {idx}
              </div>
              {!readOnly && (
                <button
                  onClick={() => onChange?.(value.filter((x) => x !== m))}
                  className="rounded-full bg-black/70 p-0.5 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {value.length > 0 && (
        <ol className="space-y-0.5 rounded-md border bg-muted/30 p-2 text-xs">
          {value.map((m, i) => (
            <li key={i}>
              <b>{i + 1}.</b> [{VIEWS.find((v) => v.key === m.view)?.label}] {m.label}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function CarSvg({ view }: { view: string }) {
  const stroke = "currentColor";
  const common = "h-full w-full text-muted-foreground/60";
  if (view === "superior") {
    return (
      <svg viewBox="0 0 400 300" className={common}>
        <rect x="80" y="40" width="240" height="220" rx="40" fill="none" stroke={stroke} strokeWidth="2" />
        <rect x="110" y="80" width="180" height="60" rx="10" fill="none" stroke={stroke} strokeWidth="1.5" />
        <rect x="110" y="160" width="180" height="60" rx="10" fill="none" stroke={stroke} strokeWidth="1.5" />
        <line x1="200" y1="40" x2="200" y2="260" stroke={stroke} strokeWidth="1" strokeDasharray="4" />
      </svg>
    );
  }
  if (view === "esquerda" || view === "direita") {
    return (
      <svg viewBox="0 0 400 200" className={common}>
        <path d="M30 140 L60 90 L150 70 L260 70 L320 100 L370 110 L370 140 Z" fill="none" stroke={stroke} strokeWidth="2" />
        <circle cx="100" cy="150" r="22" fill="none" stroke={stroke} strokeWidth="2" />
        <circle cx="300" cy="150" r="22" fill="none" stroke={stroke} strokeWidth="2" />
        <line x1="170" y1="70" x2="180" y2="115" stroke={stroke} strokeWidth="1" />
        <line x1="240" y1="70" x2="230" y2="115" stroke={stroke} strokeWidth="1" />
      </svg>
    );
  }
  if (view === "traseira") {
    return (
      <svg viewBox="0 0 400 280" className={common}>
        <path d="M60 230 L60 100 Q60 70 100 70 L300 70 Q340 70 340 100 L340 230 Z" fill="none" stroke={stroke} strokeWidth="2" />
        <rect x="90" y="90" width="220" height="80" fill="none" stroke={stroke} strokeWidth="1.5" />
        <rect x="70" y="200" width="40" height="20" fill="none" stroke={stroke} strokeWidth="1.5" />
        <rect x="290" y="200" width="40" height="20" fill="none" stroke={stroke} strokeWidth="1.5" />
      </svg>
    );
  }
  // frontal
  return (
    <svg viewBox="0 0 400 280" className={common}>
      <path d="M60 230 L60 110 Q60 70 110 70 L290 70 Q340 70 340 110 L340 230 Z" fill="none" stroke={stroke} strokeWidth="2" />
      <rect x="100" y="90" width="200" height="70" fill="none" stroke={stroke} strokeWidth="1.5" />
      <ellipse cx="100" cy="200" rx="30" ry="15" fill="none" stroke={stroke} strokeWidth="1.5" />
      <ellipse cx="300" cy="200" rx="30" ry="15" fill="none" stroke={stroke} strokeWidth="1.5" />
      <rect x="160" y="200" width="80" height="20" fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}
