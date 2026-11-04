# Changelog

## 1.4.0 - 2026-11-04

- Applied the official deal: 7 cards for 2–3 players and 5 cards for 4 or more players.
- Restricted requests to ranks in the current player's hand.
- Draws now take the top card; matching the requested rank keeps the turn, otherwise it advances.
- Increased the room limit to 10 players and handled empty hands by refilling from the deck or skipping the player.

## 1.3.1 - 2026-11-04

- Removed the legacy fishing-selection flow completely from the client.
- Failed requests now draw one random card atomically in the request handler, process completed sets, and advance the turn without an intermediate UI state.

## 1.3.0 - 2026-11-04

- Removed the 30-second turn timer and automatic expiration behavior from the client.
- Restored automatic top-card drawing after a failed request.
- Added confirmation before leaving a lobby/game and before refreshing or closing a room page.
- Increased player names to 24 characters with controlled responsive wrapping.

## 1.2.0 - 2026-11-05

- Moved patch notes and suggestions to the main menu.
- Expanded rooms to support up to eight players.
- Added face-down selection from every remaining deck card during fishing, protected by an atomic Supabase RPC.
- Reworked the game layout for side player panels, a fixed central table, and a persistent next-turn indicator.

## 1.1.0 - 2026-11-04

- Added a 30-second synchronized turn timer with automatic turn loss.
- Added selectable fishing from up to three revealed cards.
- Clarified “Peixinho”: it is shown only when a player completes a four-of-a-kind.
- Added visible completed sets, automatic skipping of empty hands, and repeat turns after successful requests.
- Added per-room realtime chat and a synchronized suggestions table.
- Added in-game patch notes for this release.
