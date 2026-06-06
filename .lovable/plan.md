# Reestruturação do Módulo de Orçamentos

Transformar `/quotes/new` (e `/quotes/$id` em modo edição) em uma central de atendimento completa, com progresso visual, busca inteligente, vistoria com fotos anotadas vinculadas ao orçamento, e ações rápidas (WhatsApp, PDF, aprovar, converter em OS).

## 1. Banco de dados (migração)

Adicionar campos faltantes para suportar o fluxo completo:

**`clients`** — adicionar: `cep`, `neighborhood`, `city`, `state`, `notes` (já existe `address`).

**`vehicles`** — adicionar: `version`, `fuel`, `renavam` (já existem placa, marca, modelo, ano, cor, km, chassi).

**`quotes`** — adicionar: `payment_method`, `payment_terms`, `warranty`, `delivery_forecast` (date).

**`vehicle_photos`** — adicionar coluna opcional `quote_id uuid` (FK → quotes), assim cada foto pode pertencer ao orçamento (não só ao veículo). Atualizar RLS para também permitir acesso via dono do orçamento.

## 2. Componentes novos

- **`PhotoAnnotator`** (`src/components/photo-annotator.tsx`) — modal que recebe um `File`/URL, desenha em `<canvas>` com ferramentas: círculo, seta, retângulo, texto, marcador livre, cores. Ao salvar, exporta PNG anotado e faz upload no bucket `vehicle-photos`, gravando em `vehicle_photos` com `quote_id` e `vehicle_id`.
- **`QuoteProgress`** — barra no topo com 5 checkpoints (Cliente, Veículo, Fotos, Serviços, Financeiro) usando ícones e estado verde quando completo. Mostra "ORÇAMENTO PRONTO PARA ENVIO" quando todos verdes.
- **`ClientCard`** / **`VehicleCard`** — cartões resumidos pós-seleção (telefone, whatsapp, último orçamento, nº de veículos / placa, modelo, ano, cor).
- **`QuickActionsBar`** — barra fixa no rodapé: Salvar Rascunho, Gerar PDF, Imprimir, WhatsApp, Aprovar, Converter em OS.

## 3. Reescrita de `src/routes/quotes.new.tsx` (e `quotes.$id.tsx`)

Layout único com accordions/cards, mantendo o que já funciona:

1. **Progresso visual** no topo (sticky).
2. **Cliente** — busca incremental (nome/telefone/CPF/placa). Mostra `ClientCard` com agregados (último orçamento, qtd veículos via subquery) ou form expandido com novos campos de endereço.
3. **Veículo** — busca por placa/modelo. `VehicleCard` ou form com `version`, `fuel`, `renavam`.
4. **Vistoria** — `VehicleDiagram` existente (já cobre vistas e marcação). Adicionar campo de observação por marca.
5. **Fotos do orçamento** — botão "Tirar Foto" (input `capture="environment"` no mobile) + upload. Cada foto abre `PhotoAnnotator` antes de salvar; fotos ficam ligadas ao `quote_id`.
6. **Serviços** — categorias rápidas + itens personalizados (já existe; expandir categorias para incluir Higienização, Mecânica etc).
7. **Peças** — como já existe.
8. **Resumo financeiro** — somar M.O. + Peças − Desconto. Adicionar `payment_method`, `payment_terms`, `warranty`, `delivery_forecast`.
9. **Barra de ações fixa** com:
   - **WhatsApp**: abre `https://wa.me/<num>?text=...` com link do PDF.
   - **PDF**: gera com `jspdf` (já comum no projeto) ou `window.print()` numa rota dedicada.
   - **Aprovar / Converter em OS**: cria registro em `service_orders` + `service_order_items` espelhando o orçamento, marca `quotes.status = 'aprovado'`, navega para a OS.

## 4. Segurança / RLS

- Atualizar RLS de `vehicle_photos` para permitir SELECT/INSERT pelo dono do orçamento referenciado.
- Mantida a regra atual de manager/admin.

## 5. Compatibilidade

- Não remover campos existentes; apenas adicionar.
- `vehicle_photos.vehicle_id` continua obrigatório (fotos ainda pertencem ao veículo); `quote_id` é apenas vínculo extra.
- Rotas, autenticação e demais módulos intactos.

## Detalhes técnicos

- WhatsApp: usar `client.whatsapp || client.phone`, sanitizar para dígitos, prefixo `55`.
- PDF: usar `jspdf` + `jspdf-autotable` (instalar via `bun add`).
- Annotator: implementação custom em canvas; salvar como `image/jpeg` qualidade 0.85.
- Auto-save: debounce de 2s no `saveDraft(false)` após mudanças, usando `useEffect`.
- Photo capture mobile: `<input type="file" accept="image/*" capture="environment" />`.