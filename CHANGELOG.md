# Changelog

## 1.7.2 - 2026-11-06

- Removed the client-side room-capacity precheck that could reject a stale lobby snapshot.
- Clarified that starting requires only an authorized host and at least two players; ten players is only the maximum admission limit.
- Surface a clear message when another client has already started the match.

## 1.7.1 - 2026-11-06

- Fixed the lobby start action to refresh the latest room state before calling the server RPC.
- Added visible start-in-progress state and surfaced actionable host/player validation errors instead of swallowing them.
- Added server validation that the requesting host is still present before dealing cards.

## 1.7.0 - 2026-11-05

- Moved hands and deck cards out of the public room snapshot into private Supabase tables with RLS.
- Added transactional server-side start, play, draw, quadra, finish and rematch operations that return only the current player's hand.
- Removed direct client room updates for game state and preserved public counts/logs without exposing drawn-card ranks.

## 1.6.1 - 2026-11-05

- Added atomic player-name editing with validation and no duplicate player entries.
- Preserved the session identity across accidental reloads so the same player can rejoin a lobby or active room.
- Changed unload handling so only an intentional leave removes the player from the room.

## 1.6.0 - 2026-11-05

- Hid the rank of freshly drawn cards from other players and removed that rank from shared draw logs.
- Added a local highlight for the player's newly drawn card.
- Added realtime lobby chat, help rules, synchronized winners and rematch voting.
- Added transactional room leave cleanup and a retry on page unload.

## 1.5.1 - 2026-11-05

- Added a lightweight Peixinho SVG favicon and browser metadata.
- Added a compact Peixinho mark to the game header.

## 1.5.0 - 2026-11-05

- Moved players to a compact responsive side panel and kept the header focused on room status and next turn.
- Replaced the large center set display with a compact per-player peixinho scoreboard.
- Added a collapsible, compact quadra grid with accessible card details.
- Limited the history view to recent entries with an internal scroll area and soft fade.

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
