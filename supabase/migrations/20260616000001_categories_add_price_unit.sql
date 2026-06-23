
-- Adiciona price e unit à tabela categories para suportar catálogo de
-- serviços e peças com preços padrão (migração do localStorage para Supabase).
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit  TEXT          NOT NULL DEFAULT 'un';

-- Seed: itens de serviço com preços padrão (catálogo de funilaria)
INSERT INTO public.categories (type, name, slug, color, active, price, unit) VALUES
  ('servico','Funilaria de Porta',          'funilaria-de-porta',           '#f59e0b', true, 300,  'un'),
  ('servico','Funilaria de Para-choque',    'funilaria-de-para-choque',     '#f59e0b', true, 200,  'un'),
  ('servico','Funilaria de Capô',           'funilaria-de-capo',            '#f59e0b', true, 400,  'un'),
  ('servico','Funilaria de Para-lama',      'funilaria-de-para-lama',       '#f59e0b', true, 280,  'un'),
  ('servico','Pintura de Para-choque',      'pintura-de-para-choque',       '#a855f7', true, 250,  'un'),
  ('servico','Pintura de Porta',            'pintura-de-porta',             '#a855f7', true, 350,  'un'),
  ('servico','Pintura de Capô',             'pintura-de-capo',              '#a855f7', true, 450,  'un'),
  ('servico','Pintura Completa',            'pintura-completa',             '#a855f7', true, 3500, 'un'),
  ('servico','Polimento',                   'polimento-servico',            '#06b6d4', true, 400,  'un'),
  ('servico','Cristalização',               'cristalizacao',                '#06b6d4', true, 350,  'un'),
  ('servico','Martelinho de Ouro',          'martelinho-de-ouro-servico',   '#22c55e', true, 200,  'un'),
  ('servico','Solda',                       'solda',                        '#f59e0b', true, 180,  'un'),
  ('servico','Alinhamento',                 'alinhamento',                  '#ef4444', true, 100,  'un'),
  ('servico','Balanceamento',               'balanceamento',                '#ef4444', true, 80,   'un'),
  ('servico','Troca de Para-lama',          'troca-de-para-lama',           '#3b82f6', true, 400,  'un')
ON CONFLICT (type, slug) DO NOTHING;

-- Seed: peças comuns com preços padrão
INSERT INTO public.categories (type, name, slug, color, active, price, unit) VALUES
  ('peca','Para-lama dianteiro esquerdo',   'para-lama-dianteiro-esq',  null, true,  350, 'un'),
  ('peca','Para-lama dianteiro direito',    'para-lama-dianteiro-dir',  null, true,  350, 'un'),
  ('peca','Para-choque dianteiro',          'para-choque-dianteiro',    null, true,  420, 'un'),
  ('peca','Para-choque traseiro',           'para-choque-traseiro',     null, true,  380, 'un'),
  ('peca','Capô',                           'capo',                     null, true,  600, 'un'),
  ('peca','Porta dianteira esquerda',       'porta-dianteira-esq',      null, true,  550, 'un'),
  ('peca','Porta dianteira direita',        'porta-dianteira-dir',      null, true,  550, 'un'),
  ('peca','Tinta automotiva (litro)',       'tinta-automotiva',         null, true,   85, 'L'),
  ('peca','Massa plástica (kg)',            'massa-plastica',            null, true,   45, 'kg'),
  ('peca','Lixa 180',                       'lixa-180',                 null, true,    3, 'un'),
  ('peca','Lixa 400',                       'lixa-400',                 null, true,    3, 'un'),
  ('peca','Primer (litro)',                 'primer',                   null, true,   60, 'L'),
  ('peca','Verniz (litro)',                 'verniz',                   null, true,   75, 'L')
ON CONFLICT (type, slug) DO NOTHING;
