const API_VERSION = import.meta.env.VITE_META_API_VERSION ?? "v22.0";
const PHONE_NUMBER_ID = import.meta.env.VITE_META_PHONE_NUMBER_ID ?? "";
const ACCESS_TOKEN = import.meta.env.VITE_META_ACCESS_TOKEN ?? "";

const META_BASE = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`;

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

function ptDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso.includes("T") ? iso : `${iso}T12:00:00`).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

export interface SendQuoteParams {
  quote: Record<string, any>;
  pdfBlob?: Blob;
}

export type SendQuoteResult =
  | { ok: true; via: "api" | "fallback" }
  | { ok: false; error: string };

// ── Upload PDF to Meta media endpoint ────────────────────────────────────────
async function uploadPdf(blob: Blob, filename: string): Promise<string | null> {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) return null;
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "application/pdf");
    form.append("file", blob, filename);

    const res = await fetch(`${META_BASE}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      body: form,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { id?: string };
    return json.id ?? null;
  } catch {
    return null;
  }
}

// ── Send via Meta Cloud API ──────────────────────────────────────────────────
async function sendViaApi(q: Record<string, any>, mediaId: string | null): Promise<boolean> {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) return false;
  const rawPhone = (q.clients?.whatsapp || q.clients?.phone || "").replace(/\D/g, "");
  if (!rawPhone) return false;
  const to = rawPhone.length >= 11 ? rawPhone : `55${rawPhone}`;

  const body: Record<string, any> = {
    messaging_product: "whatsapp",
    to,
    type: mediaId ? "document" : "text",
  };

  if (mediaId) {
    body.document = {
      id: mediaId,
      filename: `Orcamento_${q.number}.pdf`,
      caption: buildCaption(q),
    };
  } else {
    body.text = { body: buildCaption(q) };
  }

  const res = await fetch(`${META_BASE}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

// ── Fallback: open wa.me link in new tab ─────────────────────────────────────
function sendViaFallback(q: Record<string, any>): boolean {
  const rawPhone = (q.clients?.whatsapp || q.clients?.phone || "").replace(/\D/g, "");
  if (!rawPhone) return false;
  const to = rawPhone.length >= 11 ? rawPhone : `55${rawPhone}`;
  const text = encodeURIComponent(buildCaption(q));
  window.open(`https://wa.me/${to}?text=${text}`, "_blank");
  return true;
}

function buildCaption(q: Record<string, any>): string {
  const name = q.clients?.name ?? "";
  const vehicle = `${q.vehicles?.brand ?? ""} ${q.vehicles?.model ?? ""} ${q.vehicles?.plate ? `(${q.vehicles.plate})` : ""}`.trim();
  const lines = [
    `Olá${name ? ` ${name.split(" ")[0]}` : ""}! 😊`,
    "",
    `Segue o orçamento *#${q.number}* referente ao seu veículo:`,
    `🚗 *${vehicle || "Veículo"}*`,
    "",
    `🔧 Mão de obra: ${fmtBRL(q.labor_total)}`,
    `🔩 Peças: ${fmtBRL(q.parts_total)}`,
    ...(q.discount > 0 ? [`💸 Desconto: - ${fmtBRL(q.discount)}`] : []),
    `💰 *Total: ${fmtBRL(q.total)}*`,
    ...(q.valid_until ? [`📅 Válido até: ${ptDate(q.valid_until)}`] : []),
    "",
    "Qualquer dúvida estamos à disposição! 🔧",
  ];
  return lines.join("\n");
}

// ── Public function ──────────────────────────────────────────────────────────
export async function sendQuoteWhatsapp(params: SendQuoteParams): Promise<SendQuoteResult> {
  const { quote: q, pdfBlob } = params;

  const hasApiCredentials = !!(PHONE_NUMBER_ID && ACCESS_TOKEN);

  if (hasApiCredentials) {
    let mediaId: string | null = null;
    if (pdfBlob) {
      mediaId = await uploadPdf(pdfBlob, `Orcamento_${q.number}.pdf`);
    }
    const ok = await sendViaApi(q, mediaId);
    if (ok) return { ok: true, via: "api" };
  }

  // Fallback to wa.me (no PDF attachment)
  const opened = sendViaFallback(q);
  if (opened) return { ok: true, via: "fallback" };
  return { ok: false, error: "Cliente sem telefone/WhatsApp cadastrado" };
}
