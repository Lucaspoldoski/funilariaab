import * as React from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

export type SignaturePadHandle = { toDataURL: () => string | null; clear: () => void; isEmpty: () => boolean };

export const SignaturePad = React.forwardRef<SignaturePadHandle, { className?: string }>(({ className }, ref) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const empty = React.useRef(true);

  React.useImperativeHandle(ref, () => ({
    toDataURL: () => (empty.current ? null : canvasRef.current?.toDataURL("image/png") ?? null),
    clear: () => clearCanvas(),
    isEmpty: () => empty.current,
  }));

  function clearCanvas() {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    empty.current = true;
  }

  React.useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio; c.height = rect.height * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#0f172a";
    clearCanvas();
  }, []);

  function pos(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e: React.PointerEvent) {
    drawing.current = true; empty.current = false;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  function up() { drawing.current = false; }

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        className="h-40 w-full touch-none rounded-md border bg-white"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
      />
      <div className="mt-2 flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={clearCanvas}>
          <Eraser className="mr-2 h-3 w-3" /> Limpar
        </Button>
      </div>
    </div>
  );
});
SignaturePad.displayName = "SignaturePad";
