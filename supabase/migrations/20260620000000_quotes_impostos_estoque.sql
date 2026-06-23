-- ============================================================
-- MIGRATION: Impostos em orçamentos + RPC de baixa de estoque
-- ============================================================

-- 1. Campo de imposto no orçamento
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS percentual_impostos NUMERIC(5,2) NOT NULL DEFAULT 0;

-- 2. RPC para baixa atômica de estoque ao converter orçamento em OS
CREATE OR REPLACE FUNCTION public.deduct_quote_parts(
  p_quote_id UUID,
  p_user_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item     RECORD;
  v_stock    RECORD;
  v_new_qty  NUMERIC;
  v_results  JSONB := '[]'::JSONB;
  v_entry    JSONB;
BEGIN
  FOR v_item IN
    SELECT qi.description, qi.quantity
    FROM   public.quote_items qi
    WHERE  qi.quote_id = p_quote_id
      AND  qi.item_type = 'peca'
  LOOP
    -- Exact match first, then case-insensitive
    SELECT id, descricao, quantidade
    INTO   v_stock
    FROM   public.estoque_pecas
    WHERE  descricao = v_item.description
    LIMIT  1;

    IF NOT FOUND THEN
      SELECT id, descricao, quantidade
      INTO   v_stock
      FROM   public.estoque_pecas
      WHERE  LOWER(descricao) = LOWER(v_item.description)
      LIMIT  1;
    END IF;

    IF NOT FOUND THEN
      v_entry := jsonb_build_object(
        'item', v_item.description, 'status', 'nao_encontrado'
      );
      v_results := v_results || v_entry;
      CONTINUE;
    END IF;

    v_new_qty := v_stock.quantidade - v_item.quantity;

    IF v_new_qty < 0 THEN
      v_entry := jsonb_build_object(
        'item', v_item.description,
        'status', 'estoque_insuficiente',
        'disponivel', v_stock.quantidade,
        'necessario', v_item.quantity
      );
      v_results := v_results || v_entry;
      CONTINUE;
    END IF;

    -- Deduct
    UPDATE public.estoque_pecas
    SET    quantidade = v_new_qty
    WHERE  id = v_stock.id;

    -- Register movement
    INSERT INTO public.movimentacao_estoque (
      peca_id, tipo, quantidade,
      quantidade_anterior, quantidade_nova,
      motivo, created_by
    ) VALUES (
      v_stock.id, 'saida', v_item.quantity,
      v_stock.quantidade, v_new_qty,
      'Orçamento convertido em OS (id: ' || p_quote_id || ')',
      p_user_id
    );

    v_entry := jsonb_build_object(
      'item', v_item.description,
      'status', 'ok',
      'deducted', v_item.quantity
    );
    v_results := v_results || v_entry;
  END LOOP;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_quote_parts(UUID, UUID) TO authenticated;
