import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// jspdf-autotable augments jsPDF with lastAutoTable at runtime
interface JsPDFWithAutoTable extends jsPDF {
  lastAutoTable: { finalY: number };
}

const BLUE: [number, number, number] = [37, 99, 235];
const SLATE: [number, number, number] = [100, 116, 139];
const GRAY_BG: [number, number, number] = [248, 249, 250];
const TEXT_DARK: [number, number, number] = [30, 30, 30];
const TEXT_MID: [number, number, number] = [80, 80, 80];
const TEXT_LIGHT: [number, number, number] = [140, 140, 140];

const fmtBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

const STATUS_PT: Record<string, string> = {
  rascunho: "Rascunho", pendente: "Pendente", em_analise: "Em análise",
  aguardando_aprovacao: "Em análise", enviado: "Enviado", aprovado: "Aprovado",
  recusado: "Reprovado", expirado: "Expirado", finalizado: "Finalizado",
};

async function urlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function ptDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso.includes("T") ? iso : `${iso}T12:00:00`).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

export interface QuotePdfParams {
  quote: Record<string, any>;
  items: Record<string, any>[];
  photoUrls?: Record<string, string>;
  photos?: Record<string, any>[];
}

export async function generateQuotePdf(params: QuotePdfParams): Promise<Blob> {
  const { quote: q, items, photoUrls = {}, photos = [] } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }) as JsPDFWithAutoTable;
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 14;
  const CW = PW - M * 2;
  let y = M;

  // ── helpers ────────────────────────────────────────────────────────────────
  function checkPage(needed = 30) {
    if (y + needed > PH - 18) {
      addFooter();
      doc.addPage();
      y = M;
    }
  }

  function setColor(rgb: [number, number, number]) {
    doc.setTextColor(...rgb);
  }

  function setFill(rgb: [number, number, number]) {
    doc.setFillColor(...rgb);
  }

  function addFooter() {
    const pgNum = (doc.internal as any).getNumberOfPages();
    doc.setFontSize(7);
    setColor(TEXT_LIGHT);
    doc.text("Documento gerado por Funilaria Pro", M, PH - 6);
    doc.text(`Página ${pgNum}`, PW - M, PH - 6, { align: "right" });
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(M, PH - 10, PW - M, PH - 10);
  }

  // ── 1. HEADER ──────────────────────────────────────────────────────────────
  setFill(BLUE);
  doc.roundedRect(M, y, 45, 16, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("FUNILARIA PRO", M + 22.5, y + 7, { align: "center" });
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("Serviços de funilaria e pintura automotiva", M + 22.5, y + 12.5, { align: "center" });

  // Quote number (right)
  setColor(TEXT_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(`#${q.number ?? "—"}`, PW - M, y + 10, { align: "right" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  setColor(TEXT_MID);
  doc.text("ORÇAMENTO", PW - M, y + 15.5, { align: "right" });

  y += 22;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.4);
  doc.line(M, y, PW - M, y);
  y += 5;

  // ── 2. CLIENT + VEHICLE side by side ──────────────────────────────────────
  const halfW = (CW - 5) / 2;

  // Client box
  setFill(GRAY_BG);
  doc.roundedRect(M, y, halfW, 38, 2, 2, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  setColor(SLATE);
  doc.text("CLIENTE", M + 4, y + 6);
  doc.setFontSize(9);
  setColor(TEXT_DARK);
  doc.text(q.clients?.name ?? "—", M + 4, y + 13, { maxWidth: halfW - 8 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  setColor(TEXT_MID);
  const cLines = [
    q.clients?.document ? `CPF/CNPJ: ${q.clients.document}` : null,
    q.clients?.phone ? `Tel: ${q.clients.phone}` : null,
    q.clients?.whatsapp ? `WhatsApp: ${q.clients.whatsapp}` : null,
    q.clients?.email ?? null,
    q.clients?.address ?? null,
  ].filter(Boolean) as string[];
  cLines.slice(0, 5).forEach((line, i) => doc.text(line, M + 4, y + 19 + i * 4));

  // Vehicle box
  const vX = M + halfW + 5;
  setFill(GRAY_BG);
  doc.roundedRect(vX, y, halfW, 38, 2, 2, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  setColor(SLATE);
  doc.text("VEÍCULO", vX + 4, y + 6);
  doc.setFontSize(9);
  setColor(TEXT_DARK);
  doc.text(
    `${q.vehicles?.brand ?? ""} ${q.vehicles?.model ?? ""} ${q.vehicles?.year ?? ""}`.trim() || "—",
    vX + 4, y + 13, { maxWidth: halfW - 8 }
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  setColor(TEXT_MID);
  const vLines = [
    q.vehicles?.plate ? `Placa: ${q.vehicles.plate}` : null,
    q.vehicles?.color ? `Cor: ${q.vehicles.color}` : null,
    q.vehicles?.mileage ? `KM: ${q.vehicles.mileage.toLocaleString("pt-BR")}` : null,
    q.vehicles?.chassis ? `Chassi: ${q.vehicles.chassis}` : null,
    q.vehicles?.insurer ? `Seguradora: ${q.vehicles.insurer}` : null,
  ].filter(Boolean) as string[];
  vLines.slice(0, 5).forEach((line, i) => doc.text(line, vX + 4, y + 19 + i * 4));

  y += 43;

  // ── 3. INFO BAR ───────────────────────────────────────────────────────────
  setFill(BLUE);
  doc.rect(M, y, CW, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.8);
  doc.setFont("helvetica", "normal");
  doc.text(`Emitido: ${ptDate(q.created_at)}`, M + 4, y + 6.5);
  doc.text(`Validade: ${ptDate(q.valid_until)}`, M + CW / 2, y + 6.5, { align: "center" });
  doc.text(`Status: ${STATUS_PT[q.status] ?? q.status}`, M + CW - 4, y + 6.5, { align: "right" });

  y += 15;

  // ── 4. SERVICES TABLE ─────────────────────────────────────────────────────
  const serviceItems = items.filter((i) => i.item_type === "servico");
  const partItems = items.filter((i) => i.item_type === "peca");

  if (serviceItems.length > 0) {
    checkPage(20);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    setColor(BLUE);
    doc.text("▌ SERVIÇOS / MÃO DE OBRA", M, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [["Descrição", "Qtd", "Unitário", "Total"]],
      body: serviceItems.map((i) => [
        i.description ?? "—",
        String(i.quantity),
        fmtBRL(i.unit_price),
        fmtBRL(i.total),
      ]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: GRAY_BG },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 16, halign: "right" },
        2: { cellWidth: 30, halign: "right" },
        3: { cellWidth: 32, halign: "right", fontStyle: "bold" },
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── 5. PARTS TABLE ───────────────────────────────────────────────────────
  if (partItems.length > 0) {
    checkPage(20);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    setColor(SLATE);
    doc.text("▌ PEÇAS", M, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [["Descrição", "Qtd", "Unitário", "Total"]],
      body: partItems.map((i) => [
        i.description ?? "—",
        String(i.quantity),
        fmtBRL(i.unit_price),
        fmtBRL(i.total),
      ]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: SLATE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: GRAY_BG },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 16, halign: "right" },
        2: { cellWidth: 30, halign: "right" },
        3: { cellWidth: 32, halign: "right", fontStyle: "bold" },
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── 6. FINANCIAL SUMMARY ─────────────────────────────────────────────────
  checkPage(48);
  const sumW = 76;
  const sumX = PW - M - sumW;

  setFill(BLUE);
  doc.roundedRect(sumX, y, sumW, 6, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text("RESUMO FINANCEIRO", sumX + sumW / 2, y + 4.2, { align: "center" });
  y += 8;

  const finRows: [string, string][] = [
    ["Mão de obra:", fmtBRL(q.labor_total)],
    ["Peças:", fmtBRL(q.parts_total)],
  ];
  if ((q.discount ?? 0) > 0) finRows.push(["Desconto:", `- ${fmtBRL(q.discount)}`]);
  if ((q.percentual_impostos ?? 0) > 0) {
    const taxAmt = Math.max(0, (q.labor_total ?? 0) + (q.parts_total ?? 0) - (q.discount ?? 0)) * ((q.percentual_impostos ?? 0) / 100);
    finRows.push([`Impostos (${q.percentual_impostos}%):`, fmtBRL(taxAmt)]);
  }

  finRows.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setColor(TEXT_MID);
    doc.text(label, sumX + 4, y);
    setColor(TEXT_DARK);
    doc.text(value, sumX + sumW - 4, y, { align: "right" });
    y += 5.5;
  });

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(sumX, y, sumX + sumW, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  setColor(BLUE);
  doc.text("TOTAL:", sumX + 4, y);
  doc.text(fmtBRL(q.total), sumX + sumW - 4, y, { align: "right" });
  y += 10;

  // ── 7. NOTES ─────────────────────────────────────────────────────────────
  if (q.notes?.trim()) {
    checkPage(28);
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(252, 211, 77);
    doc.setLineWidth(0.4);
    const noteLines = doc.splitTextToSize(q.notes.trim(), CW - 12);
    const noteH = Math.min(noteLines.length, 5) * 4.5 + 12;
    doc.roundedRect(M, y, CW, noteH, 2, 2, "FD");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(120, 80, 0);
    doc.text("OBSERVAÇÕES / CONDIÇÕES:", M + 4, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 40, 0);
    doc.text(noteLines.slice(0, 5), M + 4, y + 11);
    y += noteH + 6;
  }

  // ── 8. PHOTOS ─────────────────────────────────────────────────────────────
  const photosWithUrls = photos.filter((p) => photoUrls[p.id]);
  if (photosWithUrls.length > 0) {
    addFooter();
    doc.addPage();
    y = M;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    setColor(BLUE);
    doc.text(`▌ FOTOS DA VISTORIA (${photosWithUrls.length})`, M, y);
    y += 6;

    const imgW = (CW - 6) / 3;
    const imgH = imgW * 0.75;
    let col = 0;

    for (const photo of photosWithUrls) {
      if (col === 3) { col = 0; y += imgH + 3; }
      if (y + imgH > PH - 20) {
        addFooter();
        doc.addPage();
        y = M;
        col = 0;
      }
      const x = M + col * (imgW + 3);
      try {
        const b64 = await urlToBase64(photoUrls[photo.id]);
        if (b64) {
          const ext = b64.startsWith("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(b64, ext, x, y, imgW, imgH);
          doc.setDrawColor(200, 200, 200);
          doc.rect(x, y, imgW, imgH);
          if (photo.damage_description) {
            doc.setFillColor(0, 0, 0);
            doc.rect(x, y + imgH - 6, imgW, 6, "F");
            doc.setFontSize(6);
            doc.setTextColor(255, 255, 255);
            const desc = doc.splitTextToSize(photo.damage_description, imgW - 4);
            doc.text(desc[0], x + imgW / 2, y + imgH - 2, { align: "center" });
          }
        } else {
          setFill(GRAY_BG);
          doc.rect(x, y, imgW, imgH, "F");
          doc.setFontSize(6.5);
          setColor(TEXT_LIGHT);
          doc.text("Foto indisponível", x + imgW / 2, y + imgH / 2, { align: "center" });
        }
      } catch {
        setFill(GRAY_BG);
        doc.rect(x, y, imgW, imgH, "F");
      }
      col++;
    }
    y += imgH + 8;
  }

  // ── 9. SIGNATURE LINES ────────────────────────────────────────────────────
  const sigY = Math.max(y + 10, PH - 38);
  if (sigY + 28 > PH - 12) {
    addFooter();
    doc.addPage();
    y = PH - 40;
  } else {
    y = sigY;
  }

  doc.setLineWidth(0.3);
  doc.setDrawColor(160, 160, 160);
  const sigLineW = (CW - 20) / 2;
  doc.line(M, y, M + sigLineW, y);
  doc.line(M + sigLineW + 20, y, PW - M, y);
  doc.setFontSize(7.5);
  setColor(TEXT_MID);
  doc.setFont("helvetica", "normal");
  doc.text("Assinatura do Cliente", M + sigLineW / 2, y + 5, { align: "center" });
  doc.text("Responsável Técnico", M + sigLineW + 20 + sigLineW / 2, y + 5, { align: "center" });

  // Footer last page
  addFooter();

  return doc.output("blob");
}

export function downloadPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
