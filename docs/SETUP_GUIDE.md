# 📋 Guia de Configuração — Vercel + Supabase + Cloudflare R2

Este documento explica **passo a passo** como configurar cada plataforma para o portfolio 3D do JP Studio. Todos os passos usam **free tiers** — custo zero.

---

## 🎯 Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ARQUITETURA HÍBRIDA (CUSTO ZERO)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐               │
│  │    VERCEL    │     │   SUPABASE   │     │  CLOUDFLARE  │               │
│  │  (Hosting +  │     │ (PostgreSQL  │     │      R2      │               │
│  │   SSR/ISR)   │◄───►│  + Auth +    │     │  (Assets     │               │
│  │              │     │  Realtime)   │     │  pesados)    │               │
│  └──────────────┘     └──────────────┘     └──────────────┘               │
│         │                     │                     │                      │
│         ▼                     ▼                     ▼                      │
│  • Deploy automático     • Tabela cases        • GLB models (3D)          │
│  • ISR para cases        • Auth admin          • MP4 videos               │
│  • Edge Functions        • RLS (segurança)     • HDRI textures            │
│  • Preview deployments   • Dashboard CMS       • Imagens grandes          │
│  • Custom domains        • Realtime (futuro)   • 10GB grátis              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1️⃣ SUPABASE — PostgreSQL + Auth + Dashboard CMS

### 1.1 Criar Projeto

1. Acesse **[supabase.com](https://supabase.com)** → "Start your project" → Login (GitHub recomendado)
2. Clique **"New Project"**
   - **Organization**: Selecione ou crie uma
   - **Name**: `jp-studio-portfolio`
   - **Database Password**: Gere uma senha forte (salve no 1Password/Bitwarden)
   - **Region**: **South America (São Paulo)** — menor latência para Brasil
   - **Pricing Plan**: **Free** (já selecionado por padrão)
3. Clique **"Create new project"** → Aguarde ~2 minutos

### 1.2 Obter Credenciais

1. No dashboard do projeto → **Settings** (ícone engrenagem) → **API**
2. Copie:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon/public key** → `VITE_SUPABASE_ANON_KEY`

### 1.3 Criar Tabela `portfolio_cases`

Vá em **SQL Editor** → **"New query"** → Cole e execute:

```sql
-- ============================================================================
-- JP Studio Portfolio — Schema da tabela cases
-- ============================================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enum para categoria
CREATE TYPE case_category AS ENUM (
  'branding', 'web', 'mobile', 'motion', '3d', 'print', 'photography', 'other'
);

-- Enum para status
CREATE TYPE case_status AS ENUM ('published', 'draft', 'archived');

-- Enum para tipo de asset
CREATE TYPE asset_type AS ENUM ('image', 'video', 'model3d', 'iframe', 'lottie');

-- Enum para formato 3D
CREATE TYPE model3d_format AS ENUM ('glb', 'gltf', 'usdz');

-- ============================================================================
-- TABELA PRINCIPAL: portfolio_cases
-- ============================================================================
CREATE TABLE portfolio_cases (
  -- Identidade
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL, -- URL-friendly, ex: "jp-studio-branding"
  title TEXT NOT NULL,
  short_description TEXT NOT NULL, -- Max 160 chars para SEO/card
  category case_category NOT NULL DEFAULT 'other',
  tags TEXT[] DEFAULT '{}',
  featured BOOLEAN DEFAULT FALSE,
  "order" INTEGER DEFAULT 0, -- Ordenação manual (maior = primeiro)
  
  -- Cover (asset principal do card)
  cover_type asset_type NOT NULL DEFAULT 'image',
  cover_src TEXT NOT NULL, -- Path no R2: "cases/jp-studio/cover.webp"
  cover_poster TEXT, -- Para video
  cover_alt TEXT NOT NULL,
  cover_width INTEGER,
  cover_height INTEGER,
  
  -- Gallery (JSONB para flexibilidade)
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  /* Exemplo gallery item:
     {
       "type": "image|video|model3d|iframe|lottie",
       "src": "cases/jp-studio/01-logo.webp",
       "poster": "cases/jp-studio/01-poster.webp",
       "alt": "Logo animado",
       "width": 1920,
       "height": 1080,
       "format": "glb|gltf|usdz",
       "environment": "hdri/studio_soft_2k.hdr",
       "cameraPosition": [0, 0, 5],
       "cameraTarget": [0, 0, 0]
     }
  */
  
  -- Conteúdo rico
  description TEXT NOT NULL, -- Markdown/HTML longo
  challenge TEXT,
  solution TEXT,
  results JSONB DEFAULT '[]'::jsonb, -- Array de {label, value, description}
  
  -- Técnico
  tech_stack JSONB DEFAULT '[]'::jsonb, -- Array de {name, icon, color}
  role TEXT,
  duration TEXT,
  team_size INTEGER,
  
  -- Links
  live_url TEXT,
  repo_url TEXT,
  case_study_url TEXT,
  
  -- Cliente
  client_name TEXT,
  client_logo TEXT, -- Path no R2
  
  -- Metadados
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  status case_status DEFAULT 'published',
  
  -- 3D Scene (opcional)
  scene3d_enabled BOOLEAN DEFAULT FALSE,
  scene3d_model_url TEXT, -- Path no R2
  scene3d_entry_animation TEXT DEFAULT 'flyIn', -- flyIn|dissolve|scaleUp|none
  scene3d_hotspots JSONB DEFAULT '[]'::jsonb
);

-- ============================================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================================
CREATE INDEX idx_cases_status ON portfolio_cases(status);
CREATE INDEX idx_cases_featured ON portfolio_cases(featured) WHERE featured = TRUE;
CREATE INDEX idx_cases_category ON portfolio_cases(category);
CREATE INDEX idx_cases_published_at ON portfolio_cases(published_at DESC);
CREATE INDEX idx_cases_order ON portfolio_cases("order" DESC);
CREATE INDEX idx_cases_slug ON portfolio_cases(slug);

-- Full-text search (português)
ALTER TABLE portfolio_cases ADD COLUMN search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('portuguese', 
      COALESCE(title, '') || ' ' || 
      COALESCE(short_description, '') || ' ' || 
      COALESCE(description, '') || ' ' || 
      COALESCE(array_to_string(tags, ' '), '')
    )
  ) STORED;

CREATE INDEX idx_cases_search ON portfolio_cases USING GIN(search_vector);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE portfolio_cases ENABLE ROW LEVEL SECURITY;

-- Política: Público lê apenas published
CREATE POLICY "Public read published cases" ON portfolio_cases
  FOR SELECT USING (status = 'published');

-- Política: Authenticated (admin/editor) lê tudo
CREATE POLICY "Authenticated read all cases" ON portfolio_cases
  FOR SELECT USING (auth.role() = 'authenticated');

-- Política: Apenas admins podem inserir/atualizar/deletar
-- (Configure auth.users com role 'admin' via Supabase Dashboard ou custom claims)
CREATE POLICY "Admins write cases" ON portfolio_cases
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- ============================================================================
-- TRIGGER PARA updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON portfolio_cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DADOS DE EXEMPLO (OPCIONAL - remova em produção)
-- ============================================================================
INSERT INTO portfolio_cases (
  slug, title, short_description, category, tags, featured, "order",
  cover_type, cover_src, cover_alt,
  gallery, description, challenge, solution, results,
  tech_stack, role, duration, team_size,
  live_url, repo_url, client_name, status
) VALUES (
  'jp-studio-branding',
  'JP Studio — Identidade Visual & Digital',
  'Rebranding completo do estúdio de beleza: logo, paleta, site 3D, agendamento online.',
  'branding',
  ARRAY['identidade visual', 'web design', '3d', 'typescript', 'react'],
  TRUE, 10,
  'image', 'cases/jp-studio/cover.webp', 'JP Studio branding cover - logo animado em 3D',
  '[
    {"type": "image", "src": "cases/jp-studio/01-logo.webp", "alt": "Logo animado", "width": 1920, "height": 1080},
    {"type": "video", "src": "cases/jp-studio/03-hero-demo.mp4", "poster": "cases/jp-studio/03-poster.webp", "alt": "Hero 3D interativo", "width": 1920, "height": 1080},
    {"type": "model3d", "src": "cases/jp-studio/hero-scene.glb", "format": "glb", "alt": "Cena 3D do hero", "environment": "hdri/studio_soft_2k.hdr"}
  ]'::jsonb,
  'Projeto end-to-end para o JP Studio, unindo marca física e digital. O desafio era traduzir a delicadeza do atendimento presencial para uma experiência web premium com agendamento inteligente.',
  'O estúdio tinha apenas Instagram e WhatsApp. Precisava de: (1) identidade visual coesa, (2) vitrine de produtos/serviços, (3) agendamento online que respeitasse regras de negócio complexas, (4) performance mobile impecável.',
  'Criamos design system com tokens (cores, tipografia, espaçamento), site em TanStack Start + Supabase, motor de agendamento puro em TypeScript (zero dependência de backend para cálculo de slots), hero 3D com partículas GPU. Tudo deployado no Cloudflare Workers.',
  '[{"label": "Agendamentos online", "value": "+340%", "description": "Nos primeiros 3 meses vs WhatsApp only"}, {"label": "Tempo médio agendamento", "value": "45s", "description": "Da landing ao comprovante"}, {"label": "LCP mobile", "value": "1.8s", "description": "Com hero 3D ativo"}, {"label": "Taxa de conclusão", "value": "87%", "description": "Usuários que iniciam e finalizam"}]'::jsonb,
  '[{"name": "React 19", "icon": "atom", "color": "#61DAFB"}, {"name": "TanStack Start", "icon": "route", "color": "#FF6B6B"}, {"name": "Three.js / R3F", "icon": "box", "color": "#000000"}, {"name": "Supabase", "icon": "database", "color": "#3ECF8E"}, {"name": "Tailwind CSS", "icon": "palette", "color": "#06B6D4"}, {"name": "TypeScript", "icon": "code", "color": "#3178C6"}, {"name": "Cloudflare Workers", "icon": "cloud", "color": "#F38020"}]'::jsonb,
  'Tech Lead & Full-stack Developer',
  '8 semanas',
  2,
  'https://jpstudio.com.br',
  'https://github.com/jpstudio/site',
  'JP Studio',
  'published'
);
```

Clique **"Run"** → Verifique se aparece "Success. No rows returned"

### 1.4 Configurar Auth para Admin (Opcional - para CMS futuro)

1. **Authentication** → **Settings** → **Email Auth** → Enable "Email confirmations" OFF (para desenvolvimento)
2. **Authentication** → **Users** → **"Add user"** → Crie seu usuário admin
3. No usuário criado → **Raw User Meta Data** → Edite:
   ```json
   { "role": "admin" }
   ```
4. Salve

---

## 2️⃣ CLOUDFLARE R2 — Storage para Assets Pesados (10GB Free)

### 2.1 Criar Bucket

1. Acesse **[dash.cloudflare.com](https://dash.cloudflare.com)** → Login
2. Menu lateral → **R2 Object Storage** → **"Create bucket"**
3. **Bucket name**: `portfolio-assets`
4. **Region**: **Automatic** (Cloudflare escolhe o mais próximo)
5. **"Create bucket"**

### 2.2 Tornar Bucket Público (para assets do portfolio)

1. Entre no bucket `portfolio-assets`
2. Aba **Settings** → **Public access** → **"Allow public read"**
3. Confirme

> **Nota**: Isso torna TODOS os objetos públicos. Para assets sensíveis, use **Signed URLs** (Workers) no futuro.

### 2.3 (Opcional) Custom Domain para CDN

**Recomendado** para URLs bonitas: `https://cdn.seudominio.com/cases/...`

1. No bucket → **Settings** → **Custom domain** → **"Connect domain"**
2. Digite: `cdn.seudominio.com` (subdomínio seu)
3. Cloudflare cria registros DNS automaticamente (se DNS gerenciado pela Cloudflare)
4. Se DNS externo: adicione CNAME apontando para `xxxx.r2.dev`

### 2.4 Upload de Assets (HDRI, Models, Images)

**Estrutura recomendada no bucket:**
```
portfolio-assets/
├── hdri/
│   └── studio_soft_2k.hdr          # HDRI do Poly Haven (2k)
├── textures/
│   ├── noise-curl.png              # 256x256 RGBA
│   └── particle-gradient.png       # 16x1 gradient
├── models/
│   └── (GLB/GLTF/USDZ dos cases)
├── images/
│   └── hero-fallback.webp          # Fallback reduced-motion
└── cases/
    ├── jp-studio/
    │   ├── cover.webp
    │   ├── 01-logo.webp
    │   ├── 03-hero-demo.mp4
    │   ├── 03-poster.webp
    │   └── hero-scene.glb
    └── beautybox/
        ├── cover.mp4
        ├── cover-poster.webp
        ├── 01-pdp.webp
        ├── 02-ar.webp
        └── lipstick.glb
```

**Como fazer upload:**
- **Dashboard**: Arraste arquivos no bucket (bom para poucos arquivos)
- **CLI (wrangler)**: `wrangler r2 object put portfolio-assets/cases/jp-studio/cover.webp --file=./cover.webp`
- **S3 Client**: Use AWS CLI, Cyberduck, Transmit, etc. com endpoint S3-compatível

### 2.5 Obter URL Pública

- **Sem custom domain**: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com/portfolio-assets/...`
- **Com custom domain**: `https://cdn.seudominio.com/...`

> Configure `VITE_R2_PUBLIC_URL=https://cdn.seudominio.com` no `.env.local`

---

## 3️⃣ VERCEL — Hosting + SSR/ISR + Preview Deployments

### 3.1 Conectar Repositório

1. Acesse **[vercel.com](https://vercel.com)** → Login (GitHub)
2. **"Add New..."** → **"Project"**
3. **Import Git Repository** → Selecione seu repo `jp-studio-portfolio`
4. **Configure Project**:
   - **Framework Preset**: **Vite** (detecta automaticamente)
   - **Root Directory**: `./` (raiz)
   - **Build Command**: `npm run build` (padrão)
   - **Output Directory**: `dist` (padrão Vite)
   - **Install Command**: `npm install` (padrão)

### 3.2 Variáveis de Ambiente no Vercel

**Settings** → **Environment Variables** → Adicione:

| Name | Value | Environment |
|------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://seu-projeto.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | `sua-anon-key` | Production, Preview, Development |
| `VITE_R2_PUBLIC_URL` | `https://cdn.seudominio.com` | Production, Preview, Development |
| `VITE_PORTFOLIO_HDRI_URL` | `/portfolio/hdri/studio_soft_2k.hdr` | All |
| `VITE_PORTFOLIO_ASSET_BASE` | `/portfolio/` | All |

> **Importante**: Variáveis `VITE_*` são expostas ao bundle do cliente (público). **NUNCA** coloque secrets (service_role key) aqui.

### 3.3 Configurar `vercel.json` (Opcional - para SPA + ISR)

Crie `vercel.json` na raiz:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/portfolio/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/(.*)\\.glb",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" },
        { "key": "Content-Type", "value": "model/gltf-binary" }
      ]
    },
    {
      "source": "/(.*)\\.hdr",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ],
  "crons": []
}
```

### 3.4 Deploy

1. Clique **"Deploy"** → Aguarde build (~2-3 min)
2. Vercel dá URL: `https://jp-studio-portfolio.vercel.app`
3. **Custom Domain**: Settings → Domains → Add `portfolio.jpsudio.com.br` (ou seu domínio)

### 3.5 Preview Deployments (Automático)

- Cada `git push` em branch/PR → **Preview URL** automática
- Comente no PR: "Preview: https://jp-studio-portfolio-git-feature-xyz.vercel.app"
- Perfeito para revisão com cliente/designer

---

## 4️⃣ CONFIGURAÇÃO LOCAL — `.env.local`

Copie `.env.example` para `.env.local` e preencha:

```bash
cp .env.example .env.local
```

```env
# .env.local — NUNCA COMMITE ESTE ARQUIVO

# Supabase
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Cloudflare R2 (public bucket URL)
VITE_R2_PUBLIC_URL=https://cdn.seudominio.com

# Assets locais (servidos pelo Vite/Vercel)
VITE_PORTFOLIO_HDRI_URL=/portfolio/hdri/studio_soft_2k.hdr
VITE_PORTFOLIO_ASSET_BASE=/portfolio/
```

### 4.1 Baixar HDRI (Poly Haven)

1. Acesse **[polyhaven.com/hdri](https://polyhaven.com/hdri)** → Busque **"Studio Small"**
2. Clique no HDRI → **Download** → **2k** → **.hdr**
3. Salve em: `public/portfolio/hdri/studio_soft_2k.hdr`

### 4.2 Instalar Dependências e Rodar

```bash
# Na raiz do projeto
npm install

# Desenvolvimento
npm run dev
# Abre http://localhost:5173
# Teste Particle System: http://localhost:5173/dev/particles
```

---

## 5️⃣ FLUXO DE DESENVOLVIMENTO COMPLETO

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WORKFLOW DIÁRIO (CUSTO ZERO)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. CODE LOCAL                                                             │
│     git checkout -b feature/hero-3d                                        │
│     npm run dev                                                            │
│     # Testa em http://localhost:5173/dev/particles                         │
│                                                                             │
│  2. COMMIT & PUSH                                                          │
│     git add . && git commit -m "feat: hero particle system"                │
│     git push origin feature/hero-3d                                        │
│                                                                             │
│  3. VERCEL PREVIEW (AUTOMÁTICO)                                            │
│     # Vercel cria: https://jp-studio-portfolio-git-hero-3d.vercel.app      │
│     # Compartilhe com designer/cliente para review                         │
│                                                                             │
│  4. SUPABASE DASHBOARD (CMS)                                               │
│     # Acesse https://supabase.com/dashboard/project/.../editor             │
│     # Table Editor → portfolio_cases → Adicione/edite cases visualmente   │
│     # Mudanças refletem INSTANTANEAMENTE no preview (ISR)                  │
│                                                                             │
│  5. CLOUDFLARE R2 (ASSETS)                                                 │
│     # Upload via dashboard ou CLI:                                         │
│     wrangler r2 object put portfolio-assets/cases/new-case/cover.webp     │
│        --file=./cover.webp                                                 │
│                                                                             │
│  6. MERGE → PRODUCTION                                                     │
│     # PR approved → Merge → Vercel deploya production automaticamente     │
│     # URL final: https://portfolio.jpsudio.com.br                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6️⃣ COMANDOS ÚTEIS (CLI)

### Supabase CLI (para migrações locais)
```bash
# Install
npm i -g supabase

# Login
supabase login

# Link project
supabase link --project-ref SEU_PROJECT_REF

# Pull schema (para versionar migrações)
supabase db pull

# Push migrations
supabase db push
```

### Cloudflare Wrangler (para R2)
```bash
# Install
npm i -g wrangler

# Login
wrangler login

# Configure R2 binding (wrangler.toml)
# name = "portfolio-assets"
# bucket_name = "portfolio-assets"

# Upload file
wrangler r2 object put portfolio-assets/cases/jp-studio/cover.webp --file=./cover.webp

# List objects
wrangler r2 object list portfolio-assets --prefix=cases/
```

### Vercel CLI
```bash
# Install
npm i -g vercel

# Login
vercel login

# Deploy manual (se precisar)
vercel --prod

# Pull env vars para local
vercel env pull .env.local
```

---

## 7️⃣ CHECKLIST DE CONFIGURAÇÃO ✅

### Supabase
- [ ] Projeto criado (região São Paulo)
- [ ] Tabela `portfolio_cases` criada com SQL acima
- [ ] RLS habilitado + políticas configuradas
- [ ] Usuário admin criado com `role: admin`
- [ ] Credenciais copiadas (URL + anon key)

### Cloudflare R2
- [ ] Bucket `portfolio-assets` criado
- [ ] Public access habilitado ("Allow public read")
- [ ] (Opcional) Custom domain `cdn.seudominio.com` configurado
- [ ] HDRI + textures + models de exemplo uploadados
- [ ] URL pública anotada

### Vercel
- [ ] Repositório conectado
- [ ] Variáveis de ambiente configuradas (5 vars)
- [ ] `vercel.json` criado (opcional)
- [ ] Primeiro deploy funcionando
- [ ] (Opcional) Custom domain configurado

### Local
- [ ] `.env.local` criado com todas as vars
- [ ] `npm install` rodou sem erros
- [ ] `npm run dev` abre em localhost:5173
- [ ] `/dev/particles` carrega e mostra partículas
- [ ] Stats overlay mostra FPS, tier, controles funcionam

---

## 8️⃣ CUSTOS — RESUMO FREE TIER

| Serviço | Limite Free | Suficiente para Portfolio? |
|---------|-------------|---------------------------|
| **Vercel Hobby** | 100GB bandwidth/mês, 100GB-hrs serverless | ✅ Sim (portfolio pessoal) |
| **Supabase Free** | 500MB DB, 1GB storage, 2GB bandwidth, 50k MAU | ✅ Sim (~500 cases) |
| **Cloudflare R2** | 10GB storage, 1M Class A ops, Unlimited egress | ✅ Sim (~200 cases com 3D) |
| **Cloudflare Workers** | 100k requests/dia | ✅ Sim (só se usar edge functions) |
| **Total** | **$0/mês** | **Para sempre** |

---

## 9️⃣ PRÓXIMOS PASSOS (FASE 2+)

Após Fase 1 validada:

1. **Fase 2**: Hero 3D completo + Scroll sync → Integra `ParticleSystem` no `Hero3D.tsx`
2. **Fase 3**: Cases Grid → Conecta `getCases()` do Supabase no grid responsivo
3. **Fase 4**: Case Detail → Página imersiva com carrossel 3D, hotspots, métricas
4. **Fase 5**: Polish → Auto-quality, reduced-motion, View Transitions, Lighthouse ≥ 90
5. **Fase 6**: Deploy final → Smoke tests, monitoring, analytics

---

## 🆘 TROUBLESHOOTING COMUM

| Problema | Solução |
|----------|---------|
| **CORS error no Supabase** | Settings → API → CORS origins → Adicione `http://localhost:5173` e `https://seu-preview.vercel.app` |
| **R2 assets não carregam** | Verifique se bucket tem "Allow public read" OU use Signed URLs via Worker |
| **Vercel build falha** | Cheque `npm run build` local primeiro; veja logs no Vercel dashboard |
| **Partículas não aparecem** | Console do browser → erros de shader? WebGL2 suportado? `gl.getExtension('OES_texture_float')` |
| **FPS baixo mobile** | `usePerformance` baixa tier automaticamente; verifique `prefers-reduced-motion` |
| **ISR não revalida** | Vercel → Settings → Functions → "Invalidate cache on deploy" ou use `revalidatePath` via API route |

---

## 📞 SUPORTE E RECURSOS

- **Supabase Docs**: https://supabase.com/docs
- **Cloudflare R2 Docs**: https://developers.cloudflare.com/r2/
- **Vercel Docs**: https://vercel.com/docs
- **Three.js/R3F**: https://docs.pmnd.rs/react-three-fiber
- **TanStack Router**: https://tanstack.com/router

---

*Documento vivo — Atualize conforme novas decisões técnicas.*
*Responsável: Dev Lead*