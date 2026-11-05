# Peixinho Online

Jogo multiplayer em Vite + React + TypeScript + Tailwind CSS e Supabase Realtime.

## Desenvolvimento

```bash
npm install
copy .env.example .env
npm run dev
```

Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env`. A chave `anon` é pública e apropriada para o browser; nunca coloque uma chave `service_role` no frontend.

Cada aba usa uma identidade/rejoin token de jogador independente em `sessionStorage`. Assim, duas abas no mesmo browser podem testar jogadores diferentes; atualizar a página na mesma aba preserva a identidade para reconexão. A saída intencional remove o jogador; um reload/fecho acidental não chama a remoção e permite reentrar com o mesmo token.

Os nomes dos jogadores aceitam até 24 caracteres e quebram de forma responsiva no lobby e nos cartões laterais da partida. As salas suportam até 10 jogadores.

Execute o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor do Supabase. O script cria `rooms`, `room_messages`, `suggestions`, `room_hands` e `room_decks`, as RPCs transacionais de jogo/atualização/saída, habilita RLS e adiciona as tabelas de sala/chat à publicação `supabase_realtime`. As mãos e o monte são privados no banco: o snapshot realtime contém apenas contagens; cada cliente recebe somente a própria mão através de RPC.

Se o projeto já tinha uma versão anterior do schema, execute o ficheiro novamente por inteiro. A migração copia as mãos/baralho legados para as tabelas privadas, remove `hands`/`deck` dos snapshots públicos, instala as RPCs `start_room_game`, `play_room_turn`, `rematch_room` e `read_my_hand`, e remove as RPCs legadas de timeout/seleção manual (`expire_room_turn` e `choose_room_card`). No Supabase Dashboard, confirme em **Database > Publications > supabase_realtime** que `rooms` e `room_messages` estão selecionadas. Não é necessário executar SQL adicional além deste ficheiro.

Regras desta versão: cada sala suporta até 10 jogadores e não há limite de tempo por turno. A partida distribui 7 cartas por jogador em salas com 2–3 jogadores e 5 cartas em salas com 4 ou mais. Só é permitido pedir um valor presente na própria mão. Se o alvo tiver esse valor, todas as cartas são transferidas e a vez continua; se não tiver, pesca-se automaticamente do topo do baralho, mantendo a vez apenas quando a carta pescada corresponde ao valor pedido. As cartas dos adversários são sempre renderizadas viradas para baixo e o log não revela o rank pescado; apenas o jogador local vê a sua carta recém-pescada destacada. O nome pode ser editado no menu e é atualizado atomicamente na sala. “Peixinho!” é reservado para quadras concluídas; as quatro cartas são retiradas da mão e, se o jogador ficar sem cartas, compra do monte quando possível ou é pulado. A saída intencional remove o jogador via RPC transacional; reload/fecho acidental preserva o token para reentrada. No fim, os jogadores podem votar para iniciar outra partida na mesma sala. Sugestões são gravadas em `suggestions` e o chat em `room_messages`, inclusive no lobby.

Para Vercel, use `npm run build`, output `dist`, e configure as mesmas duas variáveis como Environment Variables. Sem essas variáveis, a aplicação mostra uma mensagem de configuração em vez de quebrar.
