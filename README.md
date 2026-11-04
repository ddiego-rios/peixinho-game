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

Os nomes dos jogadores aceitam até 24 caracteres e quebram de forma responsiva no lobby e nos cartões laterais da partida.

Execute o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor do Supabase. O script cria `rooms`, `room_messages` e `suggestions`, a RPC de atualização concorrente, habilita RLS e adiciona as tabelas de sala/chat à publicação `supabase_realtime`.

Se o projeto já tinha uma versão anterior do schema, execute o ficheiro novamente por inteiro: além de atualizar `join_room`, ele remove as RPCs legadas de timeout e seleção manual (`expire_room_turn` e `choose_room_card`). No Supabase Dashboard, confirme em **Database > Publications > supabase_realtime** que `rooms` e `room_messages` estão selecionadas.

Regras desta versão: cada sala suporta até 8 jogadores e não há limite de tempo por turno; pedir uma carta existente mantém a vez, enquanto uma falha compra automaticamente uma carta do topo do baralho e passa a vez. “Peixinho!” é reservado para quadras concluídas. Ao sair de uma sala ou fechar/recarregar a página dentro de uma sala, o browser pede confirmação. Sugestões são gravadas em `suggestions` e o chat em `room_messages`.

Para Vercel, use `npm run build`, output `dist`, e configure as mesmas duas variáveis como Environment Variables. Sem essas variáveis, a aplicação mostra uma mensagem de configuração em vez de quebrar.
