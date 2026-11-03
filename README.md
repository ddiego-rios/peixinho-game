# Peixinho Online

Jogo multiplayer em Vite + React + TypeScript + Tailwind CSS e Supabase Realtime.

## Desenvolvimento

```bash
npm install
copy .env.example .env
npm run dev
```

Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env`. A chave `anon` é pública e apropriada para o browser; nunca coloque uma chave `service_role` no frontend.

Execute o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor do Supabase. O script cria a tabela `rooms`, habilita RLS com as políticas mínimas para o jogo e adiciona a tabela à publicação `supabase_realtime`.

Se o projeto já tinha a versão anterior do schema, execute o ficheiro novamente por inteiro: ele também cria/atualiza a função transacional `join_room`, que impede que dois joins simultâneos sobrescrevam jogadores, e confirma a publicação realtime. No Supabase Dashboard, confirme em **Database > Publications > supabase_realtime** que `rooms` está selecionada.

Para Vercel, use `npm run build`, output `dist`, e configure as mesmas duas variáveis como Environment Variables. Sem essas variáveis, a aplicação mostra uma mensagem de configuração em vez de quebrar.
