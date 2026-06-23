// Tipos legados mantidos para compatibilidade — catálogo agora vive na tabela
// `categories` do Supabase (type='servico' / type='peca').

export function uuid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Mantidos apenas para não quebrar imports existentes (não há mais chamadas ativas)
export type CatalogService = { id: string; name: string; price: number; category: string; active: boolean };
export type CatalogPart    = { id: string; name: string; defaultPrice: number; unit: string; active: boolean };

export function loadServices(): CatalogService[] { return []; }
export function saveServices(_: CatalogService[]): void {}
export function loadParts(): CatalogPart[] { return []; }
export function saveParts(_: CatalogPart[]): void {}
