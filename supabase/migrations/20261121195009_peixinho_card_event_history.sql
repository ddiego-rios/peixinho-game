create or replace function public.start_room_game(room_id text, player_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_data jsonb;
  shuffled jsonb;
  hand jsonb;
  remaining jsonb;
  public_data jsonb;
  player jsonb;
  player_count int;
  cards_per_player int;
  player_index int := 0;
  first_turn int;
  first_player text;
  updated_at_value timestamptz := now();
begin
  select r.data into current_data from public.rooms as r where r.id = start_room_game.room_id for update;
  if current_data is null then raise exception 'Sala não encontrada'; end if;
  if current_data->>'hostId' <> player_id then raise exception 'Apenas o host pode iniciar'; end if;
  if current_data->>'status' <> 'lobby' then raise exception 'A partida já começou'; end if;
  player_count := jsonb_array_length(current_data->'players');
  -- A partida pode começar com qualquer sala válida a partir de dois jogadores.
  -- O limite máximo de dez jogadores pertence apenas ao ingresso na sala.
  if player_count < 2 then raise exception 'São necessários dois jogadores'; end if;
  if player_count > 10 then raise exception 'A sala excede o limite de dez jogadores'; end if;
  if not exists (select 1 from jsonb_array_elements(current_data->'players') as member(value) where member.value->>'id' = player_id) then
    raise exception 'O host não está presente na sala';
  end if;
  cards_per_player := case when player_count <= 3 then 7 else 5 end;
  select coalesce(jsonb_agg(deck_card order by random()), '[]'::jsonb) into shuffled
  from (select rank || '-' || suit as deck_card
        from unnest(array['2','3','4','5','6','7','8','9','10','J','Q','K','A']) rank
        cross join unnest(array['H','D','C','S']) suit) cards;
  delete from public.room_hands as rh where rh.room_id = start_room_game.room_id;
  delete from public.room_decks as rd where rd.room_id = start_room_game.room_id;
  for player in select players.value from jsonb_array_elements(current_data->'players') as players(value) loop
    select coalesce(jsonb_agg(dealt.card order by dealt.position), '[]'::jsonb) into hand
    from jsonb_array_elements(shuffled) with ordinality as dealt(card, position)
    where dealt.position > player_index * cards_per_player
      and dealt.position <= (player_index + 1) * cards_per_player;
    insert into public.room_hands(room_id, player_id, cards) values (start_room_game.room_id, player->>'id', hand);
    player_index := player_index + 1;
  end loop;
  select coalesce(jsonb_agg(undealt.card order by undealt.position), '[]'::jsonb) into remaining
  from jsonb_array_elements(shuffled) with ordinality as undealt(card, position)
  where undealt.position > player_count * cards_per_player;
  insert into public.room_decks(room_id, cards) values (start_room_game.room_id, remaining);
  first_turn := floor(random() * player_count);
  first_player := current_data->'players'->first_turn->>'name';
  public_data := current_data - 'hands' - 'deck' - 'lastAction';
  public_data := jsonb_set(public_data, '{status}', '"playing"');
  public_data := jsonb_set(public_data, '{deckCount}', to_jsonb(52 - player_count * cards_per_player));
  public_data := jsonb_set(public_data, '{handCounts}', (select jsonb_object_agg(value->>'id', cards_per_player) from jsonb_array_elements(current_data->'players')));
  public_data := jsonb_set(public_data, '{turnIndex}', to_jsonb(first_turn));
  public_data := jsonb_set(public_data, '{turnStartedAt}', to_jsonb(updated_at_value), true);
  public_data := jsonb_set(public_data, '{completedSets}', '{}'::jsonb);
  public_data := jsonb_set(public_data, '{rematchVotes}', '[]'::jsonb);
  public_data := jsonb_set(public_data, '{logs}', (current_data->'logs') || jsonb_build_array('O jogo começou! ' || first_player || ' começa.'));
  update public.rooms as r set data = public_data, updated_at = updated_at_value where r.id = start_room_game.room_id;
  select rh.cards into hand from public.room_hands as rh where rh.room_id = start_room_game.room_id and rh.player_id = start_room_game.player_id;
  return jsonb_build_object('data', public_data, 'hand', hand, 'drawnCard', null, 'updatedAt', updated_at_value);
end;
$$;

create or replace function public.play_room_turn(room_id text, player_id text, target_id text, requested_rank text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_data jsonb;
  my_cards jsonb;
  target_cards jsonb;
  deck_cards jsonb;
  got jsonb;
  drawn_card text := null;
  action_card_count int := 0;
  action_kind text;
  keep_turn boolean := false;
  completed_rank text;
  completed_cards jsonb;
  completed_count int := 0;
  current_index int;
  next_index int;
  offset_value int;
  all_empty boolean := false;
  turn_started_at timestamptz;
  public_data jsonb;
  updated_players jsonb;
  updated_at_value timestamptz := now();
begin
  select r.data into current_data from public.rooms as r where r.id = play_room_turn.room_id for update;
  if current_data is null then raise exception 'Sala não encontrada'; end if;
  if current_data->>'status' <> 'playing' then raise exception 'A partida não está ativa'; end if;
  turn_started_at := coalesce(nullif(current_data->>'turnStartedAt', '')::timestamptz, clock_timestamp());
  if clock_timestamp() >= turn_started_at + interval '60 seconds' then raise exception 'O tempo do turno acabou; aguardando a troca de vez'; end if;
  current_index := (current_data->>'turnIndex')::int;
  if current_data->'players'->current_index->>'id' <> player_id then raise exception 'Não é a sua vez'; end if;
  if target_id = player_id then raise exception 'Escolha outro jogador'; end if;
  if not exists (select 1 from public.room_hands as own_hand where own_hand.room_id = play_room_turn.room_id and own_hand.player_id = play_room_turn.player_id) then raise exception 'Jogador não encontrado'; end if;
  select own_hand.cards into my_cards from public.room_hands as own_hand where own_hand.room_id = play_room_turn.room_id and own_hand.player_id = play_room_turn.player_id for update;
  if not exists (select 1 from jsonb_array_elements_text(my_cards) as card(value) where split_part(value, '-', 1) = requested_rank) then raise exception 'Só pode pedir um valor que tenha na sua mão'; end if;
  select target_hand.cards into target_cards from public.room_hands as target_hand where target_hand.room_id = play_room_turn.room_id and target_hand.player_id = play_room_turn.target_id for update;
  if target_cards is null or jsonb_array_length(target_cards) = 0 then raise exception 'O jogador escolhido não tem cartas'; end if;
  select coalesce(jsonb_agg(value), '[]'::jsonb) into got from jsonb_array_elements_text(target_cards) as card(value) where split_part(value, '-', 1) = requested_rank;
  if jsonb_array_length(got) > 0 then
    target_cards := (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements_text(target_cards) as card(value) where split_part(value, '-', 1) <> requested_rank);
    my_cards := my_cards || got;
    keep_turn := true;
  else
    select deck.cards into deck_cards from public.room_decks as deck where deck.room_id = play_room_turn.room_id for update;
    if jsonb_array_length(deck_cards) > 0 then
      drawn_card := deck_cards->>0;
      deck_cards := deck_cards - 0;
      my_cards := my_cards || jsonb_build_array(drawn_card);
      keep_turn := drawn_card like (requested_rank || '-%');
      update public.room_decks as deck set cards = deck_cards, updated_at = updated_at_value where deck.room_id = play_room_turn.room_id;
    end if;
  end if;
  for completed_rank in select distinct split_part(value, '-', 1) from jsonb_array_elements_text(my_cards) as card(value) loop
    if (select count(*) from jsonb_array_elements_text(my_cards) as card(value) where split_part(value, '-', 1) = completed_rank) = 4 then
      select jsonb_agg(value) into completed_cards from jsonb_array_elements_text(my_cards) as card(value) where split_part(value, '-', 1) = completed_rank;
      my_cards := (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements_text(my_cards) as card(value) where split_part(value, '-', 1) <> completed_rank);
      current_data := jsonb_set(current_data, ARRAY['completedSets', player_id], coalesce(current_data->'completedSets'->player_id, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('rank', completed_rank, 'cards', completed_cards, 'playerName', current_data->'players'->current_index->>'name', 'createdAt', extract(epoch from clock_timestamp()) * 1000)));
      completed_count := completed_count + 1;
    end if;
  end loop;
  if jsonb_array_length(my_cards) = 0 then
    select deck.cards into deck_cards from public.room_decks as deck where deck.room_id = play_room_turn.room_id for update;
    if jsonb_array_length(deck_cards) > 0 then
      drawn_card := coalesce(drawn_card, deck_cards->>0);
      deck_cards := deck_cards - 0;
      my_cards := jsonb_build_array(drawn_card);
      update public.room_decks as deck set cards = deck_cards, updated_at = updated_at_value where deck.room_id = play_room_turn.room_id;
    end if;
  end if;
  update public.room_hands as own_hand set cards = my_cards, updated_at = updated_at_value where own_hand.room_id = play_room_turn.room_id and own_hand.player_id = play_room_turn.player_id;
  update public.room_hands as target_hand set cards = target_cards, updated_at = updated_at_value where target_hand.room_id = play_room_turn.room_id and target_hand.player_id = play_room_turn.target_id;
  select jsonb_agg(jsonb_set(player, '{score}', to_jsonb((player->>'score')::int + case when player->>'id' = player_id then completed_count else 0 end))) into updated_players from jsonb_array_elements(current_data->'players') player;
  current_data := jsonb_set(current_data, '{players}', updated_players);
  current_data := jsonb_set(current_data, '{handCounts}', (select jsonb_object_agg(rh.player_id, jsonb_array_length(rh.cards)) from public.room_hands rh where rh.room_id = play_room_turn.room_id));
  current_data := jsonb_set(current_data, '{deckCount}', to_jsonb((select jsonb_array_length(rd.cards) from public.room_decks rd where rd.room_id = play_room_turn.room_id)));
  action_card_count := jsonb_array_length(got);
  action_kind := case when action_card_count > 0 then 'transfer' when drawn_card is not null then 'draw' else 'miss' end;
  current_data := jsonb_set(current_data, '{lastAction}', jsonb_build_object('id', updated_at_value::text, 'actorId', player_id, 'targetId', target_id, 'kind', action_kind, 'cardCount', action_card_count, 'requestedRank', requested_rank, 'createdAt', extract(epoch from updated_at_value) * 1000), true);
  current_data := jsonb_set(current_data, '{logs}', (current_data->'logs') || jsonb_build_array(current_data->'players'->current_index->>'name' || ' pediu ' || requested_rank || ' a ' || (select player->>'name' from jsonb_array_elements(current_data->'players') player where player->>'id' = target_id) || case when action_card_count > 0 then '; ' || (select player->>'name' from jsonb_array_elements(current_data->'players') player where player->>'id' = target_id) || ' deu ' || action_card_count::text || case when action_card_count = 1 then ' carta a ' else ' cartas a ' end || (current_data->'players'->current_index->>'name') || '.' else '; não encontrou e pescou do topo do monte.' end));
  next_index := current_index;
  if not keep_turn or jsonb_array_length(my_cards) = 0 then
    for offset_value in 1..jsonb_array_length(current_data->'players') loop
      next_index := (current_index + offset_value) % jsonb_array_length(current_data->'players');
      exit when coalesce((current_data->'handCounts'->>(current_data->'players'->next_index->>'id'))::int, 0) > 0;
    end loop;
    current_data := jsonb_set(current_data, '{turnStartedAt}', to_jsonb(clock_timestamp()), true);
  end if;
  all_empty := (current_data->>'deckCount')::int = 0 and not exists (select 1 from public.room_hands rh where rh.room_id = play_room_turn.room_id and jsonb_array_length(rh.cards) > 0);
  current_data := jsonb_set(current_data, '{turnIndex}', to_jsonb(next_index));
  if all_empty then current_data := jsonb_set(current_data, '{status}', '"finished"'); end if;
  update public.rooms as r set data = current_data - 'hands' - 'deck', updated_at = updated_at_value where r.id = play_room_turn.room_id;
  select own_hand.cards into my_cards from public.room_hands as own_hand where own_hand.room_id = play_room_turn.room_id and own_hand.player_id = play_room_turn.player_id;
  return jsonb_build_object('data', current_data - 'hands' - 'deck', 'hand', my_cards, 'drawnCard', drawn_card, 'updatedAt', updated_at_value);
end;
$$;
