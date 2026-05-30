import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Trash2, X, Camera, MousePointer, Circle, Square, ArrowUpRight, Eye } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type Shape =
  | { kind: "point"; x: number; y: number; label: string }
  | { kind: "circle"; x: number; y: number; r: number; label: string }
  | { kind: "rect"; x: number; y: number; w: number; h: number; label: string }
  | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number; label: string };

const PHASES = [
  { value: "antes", label: "Antes", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { value: "durante", label: "Durante", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { value: "depois", label: "Depois", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { value: "outro", label: "Outros", color: "bg-muted text-muted-foreground" },
] as const;

type Phase = (typeof PHASES)[number]["value"];

export function VehiclePhotos({ vehicleId }: { vehicleId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [uploading, setUploading] = React.useState(false);
  const [uploadPhase, setUploadPhase] = React.useState<Phase>("antes");
  const [viewing, setViewing] = React.useState<any | null>(null);
  const [urls, setUrls] = React.useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = React.useState<Phase | "all" | "compare">("all");

  const { data: photos = [] } = useQuery({
    queryKey: ["vehicle-photos", vehicleId],
    queryFn: async () => {
      const { data } = await supabase
        .from("vehicle_photos")
        .select("*")
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  React.useEffect(() => {
    (async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        (photos as any[]).map(async (p) => {
          const { data } = await supabase.storage.from("vehicle-photos").createSignedUrl(p.path, 3600);
          if (data?.signedUrl) map[p.id] = data.signedUrl;
        }),
      );
      setUrls(map);
    })();
  }, [photos]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: máx 10MB`); continue; }
      const ext = file.name.split(".").pop();
      const path = `${vehicleId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("vehicle-photos").upload(path, file);
      if (upErr) { toast.error(upErr.message); continue; }
      const { error } = await supabase.from("vehicle_photos").insert({ vehicle_id: vehicleId, path, uploaded_by: user?.id, phase: uploadPhase });
      if (error) toast.error(error.message);
    }
    setUploading(false);
    e.target.value = "";
    qc.invalidateQueries({ queryKey: ["vehicle-photos", vehicleId] });
    toast.success("Fotos enviadas");
  }

  async function deletePhoto(p: any) {
    if (!confirm("Excluir esta foto?")) return;
    await supabase.storage.from("vehicle-photos").remove([p.path]);
    await supabase.from("vehicle_photos").delete().eq("id", p.id);
    qc.invalidateQueries({ queryKey: ["vehicle-photos", vehicleId] });
  }

  const filtered = (photos as any[]).filter((p) => activeTab === "all" || activeTab === "compare" || p.phase === activeTab);
  const counts = (photos as any[]).reduce((acc: Record<string, number>, p) => { acc[p.phase] = (acc[p.phase] ?? 0) + 1; return acc; }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="all">Todas ({photos.length})</TabsTrigger>
            {PHASES.map((p) => <TabsTrigger key={p.value} value={p.value}>{p.label} ({counts[p.value] ?? 0})</TabsTrigger>)}
            <TabsTrigger value="compare">Antes / Depois</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Select value={uploadPhase} onValueChange={(v) => setUploadPhase(v as Phase)}>
            <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{PHASES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <label>
            <input type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handleUpload} disabled={uploading} />
            <Button asChild variant="default" size="sm" disabled={uploading}>
              <span className="cursor-pointer"><Camera className="mr-2 h-4 w-4" />{uploading ? "Enviando..." : "Câmera / Upload"}</span>
            </Button>
          </label>
        </div>
      </div>

      {activeTab === "compare" ? (
        <CompareView photos={photos as any[]} urls={urls} />
      ) : photos.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed py-12 text-center">
          <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhuma foto. Use o botão "Câmera / Upload" para começar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p) => {
            const phase = PHASES.find((x) => x.value === p.phase);
            const shapes: Shape[] = Array.isArray(p.marks) ? p.marks : [];
            return (
              <div key={p.id} className="group relative overflow-hidden rounded-lg border bg-muted">
                {urls[p.id] ? (
                  <img src={urls[p.id]} alt="" className="aspect-square w-full cursor-pointer object-cover transition group-hover:scale-105" onClick={() => setViewing(p)} />
                ) : (
                  <div className="aspect-square animate-pulse bg-muted" />
                )}
                <Badge className={cn("absolute left-2 top-2 text-[10px]", phase?.color)}>{phase?.label}</Badge>
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => setViewing(p)}><Eye className="h-3 w-3" /></Button>
                  <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => deletePhoto(p)}><Trash2 className="h-3 w-3" /></Button>
                </div>
                {shapes.length > 0 && (
                  <Badge variant="secondary" className="absolute bottom-2 left-2 text-[10px]">{shapes.length} marcação(ões)</Badge>
                )}
                {p.damage_description && (
                  <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5 text-[11px] text-white">
                    {p.damage_description}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle>Vistoria fotográfica</DialogTitle></DialogHeader>
          {viewing && (
            <PhotoEditor
              photo={viewing}
              url={urls[viewing.id]}
              onSaved={() => { qc.invalidateQueries({ queryKey: ["vehicle-photos", vehicleId] }); setViewing(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompareView({ photos, urls }: { photos: any[]; urls: Record<string, string> }) {
  const antes = photos.filter((p) => p.phase === "antes");
  const depois = photos.filter((p) => p.phase === "depois");
  if (!antes.length || !depois.length) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Adicione fotos nas fases "Antes" e "Depois" para comparar.</p>;
  }
  return (
    <div className="space-y-4">
      {antes.slice(0, Math.min(antes.length, depois.length)).map((a, i) => {
        const d = depois[i];
        return (
          <div key={a.id} className="grid grid-cols-2 gap-2">
            <div className="relative overflow-hidden rounded-lg border">
              <Badge className="absolute left-2 top-2 z-10 bg-amber-500 text-white">Antes</Badge>
              {urls[a.id] && <img src={urls[a.id]} alt="" className="aspect-video w-full object-cover" />}
            </div>
            <div className="relative overflow-hidden rounded-lg border">
              <Badge className="absolute left-2 top-2 z-10 bg-emerald-500 text-white">Depois</Badge>
              {d && urls[d.id] && <img src={urls[d.id]} alt="" className="aspect-video w-full object-cover" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Tool = "point" | "circle" | "rect" | "arrow";

function PhotoEditor({ photo, url, onSaved }: { photo: any; url?: string; onSaved: () => void }) {
  const [shapes, setShapes] = React.useState<Shape[]>(Array.isArray(photo.marks) ? photo.marks : []);
  const [tool, setTool] = React.useState<Tool>("point");
  const [phase, setPhase] = React.useState<Phase>(photo.phase);
  const [damage, setDamage] = React.useState(photo.damage_description ?? "");
  const [service, setService] = React.useState(photo.service_needed ?? "");
  const [parts, setParts] = React.useState(photo.parts_needed ?? "");
  const [notes, setNotes] = React.useState(photo.technical_notes ?? "");
  const [saving, setSaving] = React.useState(false);
  const [drag, setDrag] = React.useState<{ x: number; y: number } | null>(null);
  const imgRef = React.useRef<HTMLDivElement>(null);

  function getPos(e: React.MouseEvent<HTMLDivElement>) {
    const r = imgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  }

  function onDown(e: React.MouseEvent<HTMLDivElement>) {
    const p = getPos(e);
    if (tool === "point") {
      const label = prompt("Descreva esta marcação:") ?? "";
      if (label) setShapes([...shapes, { kind: "point", x: p.x, y: p.y, label }]);
      return;
    }
    setDrag(p);
  }
  function onUp(e: React.MouseEvent<HTMLDivElement>) {
    if (!drag) return;
    const p = getPos(e);
    const label = prompt("Descreva esta marcação:") ?? "";
    if (label) {
      if (tool === "circle") {
        const r = Math.hypot(p.x - drag.x, p.y - drag.y);
        setShapes([...shapes, { kind: "circle", x: drag.x, y: drag.y, r, label }]);
      } else if (tool === "rect") {
        setShapes([...shapes, { kind: "rect", x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y), label }]);
      } else if (tool === "arrow") {
        setShapes([...shapes, { kind: "arrow", x1: drag.x, y1: drag.y, x2: p.x, y2: p.y, label }]);
      }
    }
    setDrag(null);
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("vehicle_photos")
      .update({
        marks: shapes as any,
        phase,
        damage_description: damage || null,
        service_needed: service || null,
        parts_needed: parts || null,
        technical_notes: notes || null,
      })
      .eq("id", photo.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Vistoria salva");
    onSaved();
  }

  const TOOLS: { key: Tool; icon: React.ElementType; label: string }[] = [
    { key: "point", icon: MousePointer, label: "Ponto" },
    { key: "circle", icon: Circle, label: "Círculo" },
    { key: "rect", icon: Square, label: "Retângulo" },
    { key: "arrow", icon: ArrowUpRight, label: "Seta" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1 rounded-md border bg-muted/30 p-1">
          {TOOLS.map((t) => (
            <Button key={t.key} type="button" size="sm" variant={tool === t.key ? "default" : "ghost"} onClick={() => setTool(t.key)}>
              <t.icon className="mr-1 h-3 w-3" />{t.label}
            </Button>
          ))}
        </div>
        <div
          ref={imgRef}
          className="relative cursor-crosshair overflow-hidden rounded-md border bg-black select-none"
          onMouseDown={onDown}
          onMouseUp={onUp}
        >
          {url && <img src={url} alt="" className="w-full" draggable={false} />}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {shapes.map((s, i) => {
              if (s.kind === "circle") return <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="none" stroke="#ef4444" strokeWidth="0.5" />;
              if (s.kind === "rect") return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill="none" stroke="#ef4444" strokeWidth="0.5" />;
              if (s.kind === "arrow") return (
                <g key={i}>
                  <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#ef4444" strokeWidth="0.6" />
                  <circle cx={s.x2} cy={s.y2} r="0.8" fill="#ef4444" />
                </g>
              );
              return null;
            })}
          </svg>
          {shapes.map((s, i) => {
            const pos = s.kind === "point" ? { x: s.x, y: s.y } : s.kind === "arrow" ? { x: s.x1, y: s.y1 } : { x: s.x + (s.kind === "rect" ? s.w / 2 : 0), y: s.y + (s.kind === "rect" ? s.h / 2 : 0) };
            return (
              <div key={i} className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-red-500 text-xs font-bold text-white shadow-lg">{i + 1}</div>
                <button onClick={(e) => { e.stopPropagation(); setShapes(shapes.filter((_, k) => k !== i)); }} className="rounded-full bg-black/70 p-0.5 text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
        {shapes.length > 0 && (
          <ol className="max-h-24 space-y-0.5 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs">
            {shapes.map((s, i) => <li key={i}><b>{i + 1}.</b> {s.label}</li>)}
          </ol>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-xs">Fase</Label>
          <Select value={phase} onValueChange={(v) => setPhase(v as Phase)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PHASES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Descrição do dano</Label><Input value={damage} onChange={(e) => setDamage(e.target.value)} placeholder="Paralama amassado..." /></div>
        <div><Label className="text-xs">Serviço a realizar</Label><Input value={service} onChange={(e) => setService(e.target.value)} placeholder="Funilaria + Pintura" /></div>
        <div><Label className="text-xs">Peças necessárias</Label><Input value={parts} onChange={(e) => setParts(e.target.value)} placeholder="Paralama dianteiro" /></div>
        <div><Label className="text-xs">Observações técnicas</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Necessário alinhamento" /></div>
        <Button className="w-full" onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar vistoria"}</Button>
      </div>
    </div>
  );
}
