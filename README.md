# Peixinho Online

Jogo multiplayer em Vite + React + TypeScript + Tailwind CSS e Supabase Realtime.

## Desenvolvimento

```bash
npm install
copy .env.example .env
npm run dev
```

Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env`. A chave `anon` é pública e apropriada para o browser; nunca coloque uma chave `service_role` no frontend.

Cada aba usa uma identidade de jogador independente em `sessionStorage`. Assim, duas abas no mesmo browser podem testar jogadores diferentes; atualizar a página na mesma aba preserva a identidade para reconexão.

Execute o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor do Supabase. O script cria `rooms`, `room_messages` e `suggestions`, as RPCs de atualização concorrente/timeout/pesca atômica, habilita RLS e adiciona as tabelas de sala/chat à publicação `supabase_realtime`.

Se o projeto já tinha a versão anterior do schema, execute o ficheiro novamente por inteiro: ele atualiza `join_room`, cria `update_room_state`/`expire_room_turn` e confirma a publicação realtime. No Supabase Dashboard, confirme em **Database > Publications > supabase_realtime** que `rooms` e `room_messages` estão selecionadas.

Regras desta versão: cada sala suporta até 8 jogadores e cada turno dura 30 segundos; pedir uma carta existente mantém a vez, enquanto uma falha abre uma pesca. Durante a pesca, todas as cartas restantes aparecem viradas para baixo e o jogador escolhe exatamente uma; a RPC `choose_room_card` valida a carta e remove-a atomicamente antes de avançar o estado. “Peixinho!” é reservado para quadras concluídas. Sugestões são gravadas em `suggestions` e o chat em `room_messages`; ambas as tabelas têm apenas as políticas públicas mínimas para este protótipo.

Para Vercel, use `npm run build`, output `dist`, e configure as mesmas duas variáveis como Environment Variables. Sem essas variáveis, a aplicação mostra uma mensagem de configuração em vez de quebrar.
