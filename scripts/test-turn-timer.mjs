import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec('create role anon; create role authenticated;');
  let schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  schema = schema.replace(/do \$\$[\s\S]*?alter publication supabase_realtime add table public\.(?:rooms|room_messages);[\s\S]*?\$\$;/gi, '');
  await db.exec(schema);

  const lobby = {
    roomId: 'TST1', hostId: 'p1', status: 'lobby',
    players: [{ id: 'p1', name: 'Player 1', score: 0 }, { id: 'p2', name: 'Player 2', score: 0 }],
    deckCount: 0, handCounts: { p1: 0, p2: 0 }, turnIndex: 0, logs: [], createdAt: Date.now(), completedSets: {},
  };
  await db.query('insert into public.rooms(id, data) values ($1, $2::jsonb)', ['TST1', JSON.stringify(lobby)]);
  const start = (await db.query('select public.start_room_game($1, $2) as result', ['TST1', 'p1'])).rows[0].result;
  assert.equal(start.data.status, 'playing');
  assert.equal(start.data.deckCount, 38);
  assert.ok(start.data.turnStartedAt);
  assert.equal((await db.query('select public.expire_room_turn($1) as result', ['TST1'])).rows[0].result.expired, false);
  const hands = (await db.query('select player_id, cards from public.room_hands where room_id = $1', ['TST1'])).rows;
  assert.deepEqual(hands.map((row) => row.cards.length), [7, 7]);

  await db.exec("update public.rooms set data = jsonb_set(data, '{turnStartedAt}', to_jsonb(clock_timestamp() - interval '61 seconds'), true) where id = 'TST1'");
  const expiredPlayer = start.data.players[start.data.turnIndex].id;
  const expiredHand = hands.find((row) => row.player_id === expiredPlayer).cards;
  const expiredTarget = expiredPlayer === 'p1' ? 'p2' : 'p1';
  await assert.rejects(
    db.query('select public.play_room_turn($1, $2, $3, $4)', ['TST1', expiredPlayer, expiredTarget, expiredHand[0].split('-')[0]]),
    /tempo do turno acabou/i,
    'the expired player must not play after the deadline',
  );

  const timeoutResults = await Promise.all([
    db.query('select public.expire_room_turn($1) as result', ['TST1']),
    db.query('select public.expire_room_turn($1) as result', ['TST1']),
  ]);
  const timeout = timeoutResults.map((item) => item.rows[0].result).find((result) => result.expired);
  assert.ok(timeout, 'one expiration request must advance the turn');
  assert.equal(timeoutResults.map((item) => item.rows[0].result).filter((result) => result.expired).length, 1);
  assert.notEqual(timeout.data.turnIndex, start.data.turnIndex);
  assert.match(timeout.data.logs.at(-1), /Tempo.*esgotado/);
  assert.ok(Date.parse(timeout.data.turnStartedAt) > Date.now() - 5000);
  assert.equal((await db.query('select public.expire_room_turn($1) as result', ['TST1'])).rows[0].result.expired, false);

  const currentPlayer = timeout.data.players[timeout.data.turnIndex].id;
  const targetPlayer = timeout.data.players.find((player) => player.id !== currentPlayer).id;
  const currentHands = (await db.query('select player_id, cards from public.room_hands where room_id = $1', ['TST1'])).rows;
  const ownCards = currentHands.find((row) => row.player_id === currentPlayer).cards;
  const targetCards = currentHands.find((row) => row.player_id === targetPlayer).cards;
  const requestedRank = ownCards[0].split('-')[0];
  const targetHasRank = targetCards.some((card) => card.startsWith(`${requestedRank}-`));
  const beforeDeckCount = timeout.data.deckCount;
  const played = (await db.query('select public.play_room_turn($1, $2, $3, $4) as result', ['TST1', currentPlayer, targetPlayer, requestedRank])).rows[0].result;
  assert.equal(played.data.status, 'playing');
  assert.ok(played.hand.length > 0);
  assert.equal(played.data.deckCount, beforeDeckCount - (targetHasRank ? 0 : 1));

  console.log('PASS: full SQL schema, deal, 60-second deadline, late-play rejection, single timeout advance, and next-player move.');
} finally {
  await db.close();
}
