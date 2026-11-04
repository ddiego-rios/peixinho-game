# Changelog

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
