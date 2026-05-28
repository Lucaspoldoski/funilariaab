import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

type Mark = { x: number; y: number; label: string };

export function VehiclePhotos({ vehicleId }: { vehicleId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [uploading, setUploading] = React.useState(false);
  const [viewing, setViewing] = React.useState<any | null>(null);
  const [urls, setUrls] = React.useState<Record<string, string>>({});

  const { data: photos = [] } = useQuery({
    queryKey: ["vehicle-photos", vehicleId],
    queryFn: async () => {
      const { data } = await supabase.from("vehicle_photos").select("*").eq("vehicle_id", vehicleId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  React.useEffect(() => {
    (async () => {
      const map: Record<string, string> = {};
      for (const p of photos as any[]) {
        const { data } = await supabase.storage.from("vehicle-photos").createSignedUrl(p.path, 3600);
        if (data?.signedUrl) map[p.id] = data.signedUrl;
      }
      setUrls(map);
    })();
  }, [photos]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      const ext = file.name.split(".").pop();
      const path = `${vehicleId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("vehicle-photos").upload(path, file);
      if (upErr) { toast.error(upErr.message); continue; }
      const { error } = await supabase.from("vehicle_photos").insert({ vehicle_id: vehicleId, path, uploaded_by: user?.id });
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{photos.length} foto(s)</p>
        <label>
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
          <Button asChild variant="outline" size="sm" disabled={uploading}>
            <span><Upload className="mr-2 h-3 w-3" />{uploading ? "Enviando..." : "Enviar fotos"}</span>
          </Button>
        </label>
      </div>

      {photos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma foto enviada ainda.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(photos as any[]).map(p => (
            <div key={p.id} className="group relative overflow-hidden rounded-md border bg-muted">
              {urls[p.id] ? (
                <img src={urls[p.id]} alt="" className="aspect-square w-full cursor-pointer object-cover" onClick={() => setViewing(p)} />
              ) : (
                <div className="aspect-square animate-pulse bg-muted" />
              )}
              <Button variant="destructive" size="icon" className="absolute right-1 top-1 h-7 w-7 opacity-0 transition group-hover:opacity-100" onClick={() => deletePhoto(p)}>
                <Trash2 className="h-3 w-3" />
              </Button>
              {Array.isArray(p.marks) && p.marks.length > 0 && (
                <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{p.marks.length} marcação(ões)</div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Marcar áreas danificadas</DialogTitle></DialogHeader>
          {viewing && <PhotoMarker photo={viewing} url={urls[viewing.id]} onClose={() => setViewing(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["vehicle-photos", vehicleId] }); setViewing(null); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PhotoMarker({ photo, url, onSaved }: { photo: any; url?: string; onClose: () => void; onSaved: () => void }) {
  const [marks, setMarks] = React.useState<Mark[]>(Array.isArray(photo.marks) ? photo.marks : []);
  const imgRef = React.useRef<HTMLDivElement>(null);

  function addMark(e: React.MouseEvent<HTMLDivElement>) {
    const r = imgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    const label = prompt("Descreva o dano nesta área:") ?? "";
    if (!label) return;
    setMarks([...marks, { x, y, label }]);
  }

  async function save() {
    const { error } = await supabase.from("vehicle_photos").update({ marks }).eq("id", photo.id);
    if (error) return toast.error(error.message);
    toast.success("Marcações salvas"); onSaved();
  }

  return (
    <div className="space-y-3">
      <div ref={imgRef} className="relative cursor-crosshair overflow-hidden rounded-md border bg-black" onClick={addMark}>
        {url && <img src={url} alt="" className="w-full" />}
        {marks.map((m, i) => (
          <div key={i} className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1" style={{ left: `${m.x}%`, top: `${m.y}%` }}>
            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-red-500 text-xs font-bold text-white shadow-lg">{i + 1}</div>
            <button onClick={(e) => { e.stopPropagation(); setMarks(marks.filter((_, k) => k !== i)); }} className="rounded-full bg-black/70 p-0.5 text-white">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      {marks.length > 0 && (
        <ol className="max-h-32 space-y-1 overflow-y-auto text-sm">
          {marks.map((m, i) => <li key={i}><span className="font-medium">{i + 1}.</span> {m.label}</li>)}
        </ol>
      )}
      <p className="text-xs text-muted-foreground">Clique na imagem para adicionar uma marcação.</p>
      <div className="flex justify-end gap-2"><Button onClick={save}>Salvar marcações</Button></div>
    </div>
  );
}
