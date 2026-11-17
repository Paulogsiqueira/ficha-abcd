# Ficha ABCD

PWA para registrar o treino ABCD no iPhone: séries, cargas, descanso com apito, sugestão de progressão, gráficos de evolução e histórico. Funciona offline na academia e sincroniza com o Supabase quando há conexão.

Stack: Vite + JavaScript, vite-plugin-pwa (service worker e manifest), Supabase (auth por e-mail e senha + tabela `docs` com RLS). Deploy no GitHub Pages por GitHub Actions.

## 1. Supabase (5 min)

1. Crie um projeto em https://supabase.com (plano Free).
2. **SQL Editor → New query**: cole o conteúdo de `supabase.sql` e clique em **Run**.
3. **Authentication → URL Configuration**: em **Site URL**, coloque o endereço do app no Pages (passo 2), por exemplo `https://SEU-USUARIO.github.io/ficha-abcd/`. É para onde o link de confirmação de e-mail leva.
   - Para pular a confirmação: **Authentication → Sign In / Providers → Email** e desligue **Confirm email**.
4. **Project Settings → API**: copie a **Project URL** e a chave **anon / publishable**. Essa chave pode ficar pública; quem protege os dados é o RLS.

## 2. GitHub Pages (5 min)

```bash
git init && git add . && git commit -m "Ficha ABCD"
git branch -M main
git remote add origin git@github.com:SEU-USUARIO/ficha-abcd.git
git push -u origin main
```

No repositório:

1. **Settings → Pages → Source**: `GitHub Actions`.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = chave anon / publishable
3. **Actions → Publicar no GitHub Pages → Run workflow** (ou faça um novo push).

O app fica em `https://SEU-USUARIO.github.io/ficha-abcd/`. O GitHub Pages gratuito exige repositório público; seus treinos não ficam no repositório, só no Supabase.

## 3. Instalar no iPhone

1. Abra o endereço no **Safari** (precisa ser o Safari).
2. **Compartilhar → Adicionar à Tela de Início → Adicionar**.
3. Abra pelo ícone, toque em **Criar conta** e depois entre.
4. **Ajustes → Importar backup** e escolha o `ficha-backup-AAAA-MM-DD.json`.

## Desenvolvimento local

```bash
cp .env.example .env.local   # preencha as duas variáveis
npm install
npm run dev
```

## Como os dados ficam guardados

- Tabela `docs (user_id, path, data jsonb)`. `path` é `plano/atual` (a ficha) ou `sessoes/<id>` (cada treino).
- O app guarda uma cópia no aparelho e uma fila de gravações. Sem internet, tudo continua funcionando e a fila é enviada quando a conexão volta.
- **Ajustes → Exportar backup** baixa tudo em JSON.

## Limitações no iPhone X (iOS 16)

- Sem vibração (o Safari não permite) e sem alerta com a tela bloqueada.
- O apito toca com a chave lateral fora do modo silencioso e segue o volume de mídia.
- A tela pode apagar durante o descanso: aumente **Ajustes → Tela e Brilho → Bloqueio Automático**.
- Projetos Free do Supabase pausam após 7 dias sem uso; é só reativar no painel.
