import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

export type AppUser = { uid: string };
export type RoomSnapshot = { data: Record<string, unknown> | null; updatedAt: string | null };
export type ChatMessage = { id: string; room_id: string; sender_id: string; sender_name: string; body: string; created_at: string };
export type PrivateRoomResult = { data: Record<string, unknown>; hand: string[]; drawnCard?: string | null; updatedAt: string };
type SupabaseError = { message?: string; code?: string; details?: string; hint?: string };

const formatSupabaseError = (error: SupabaseError, operation: string) => {
  const parts = [error.message, error.details, error.hint].filter(Boolean);
  const suffix = error.code ? ` [${error.code}]` : '';
  const message = `${operation}: ${parts.join(' — ') || 'erro desconhecido'}${suffix}`;
  console.error(`[Peixinho] ${message}`, error);
  return new Error(message);
};

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(url && anonKey);
const supabase = supabaseConfigured ? createClient(url, anonKey) : null;

export function signIn(): AppUser {
  const key = 'peixinho-player-id';
  const existing = window.sessionStorage.getItem(key);
  if (existing) return { uid: existing };
  const uid = crypto.randomUUID();
  window.sessionStorage.setItem(key, uid);
  return { uid };
}

type RoomRow = { id: string; data: Record<string, unknown>; updated_at: string };

export const readRoom = async (id: string): Promise<RoomSnapshot> => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.from('rooms').select('id,data,updated_at').eq('id', id).single();
  if (error && error.code !== 'PGRST116') throw formatSupabaseError(error, 'Falha ao ler a sala');
  const row = data as RoomRow | null;
  return { data: row?.data ?? null, updatedAt: row?.updated_at ?? null };
};

export const createRoom = async (id: string, data: object) => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { error } = await supabase.from('rooms').insert({ id, data });
  if (error) throw formatSupabaseError(error, 'Falha ao atualizar a sala');
};

export const updateRoom = async (id: string, expectedUpdatedAt: string | null, data: object) => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data: result, error } = await supabase.rpc('update_room_state', {
    room_id: id,
    expected_updated_at: expectedUpdatedAt,
    next_data: data,
  });
  if (error) throw formatSupabaseError(error, 'Falha ao atualizar o estado da sala');
  return result as { data: Record<string, unknown>; updatedAt: string };
};

const callPrivateRoomRpc = async (name: string, args: Record<string, unknown>) => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw formatSupabaseError(error, `Falha ao executar ${name}`);
  return data as PrivateRoomResult;
};

export const readMyHand = async (roomId: string, playerId: string) => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.rpc('read_my_hand', { room_id: roomId, player_id: playerId });
  if (error) throw formatSupabaseError(error, 'Falha ao ler a mão');
  return (data ?? []) as string[];
};

export const startRoomGame = (roomId: string, playerId: string) =>
  callPrivateRoomRpc('start_room_game', { room_id: roomId, player_id: playerId });

export const playRoomTurn = (roomId: string, playerId: string, targetId: string, requestedRank: string) =>
  callPrivateRoomRpc('play_room_turn', { room_id: roomId, player_id: playerId, target_id: targetId, requested_rank: requestedRank });

export const rematchRoom = (roomId: string, playerId: string) =>
  callPrivateRoomRpc('rematch_room', { room_id: roomId, player_id: playerId });

export const joinRoom = async (id: string, playerId: string, playerName: string) => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.rpc('join_room', {
    room_id: id,
    player_id: playerId,
    player_name: playerName,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
};

export const updatePlayerName = async (id: string, playerId: string, playerName: string) => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.rpc('update_player_name', {
    room_id: id,
    player_id: playerId,
    player_name: playerName,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
};

export const leaveRoom = async (id: string, playerId: string) => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.rpc('leave_room', { room_id: id, player_id: playerId });
  if (error) throw error;
  return data as Record<string, unknown> | null;
};

export const sendMessage = async (roomId: string, senderId: string, senderName: string, body: string) => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { error } = await supabase.from('room_messages').insert({ room_id: roomId, sender_id: senderId, sender_name: senderName, body });
  if (error) throw error;
};

export const readMessages = async (roomId: string) => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.from('room_messages').select('id,room_id,sender_id,sender_name,body,created_at').eq('room_id', roomId).order('created_at', { ascending: true }).limit(100);
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
};

export const watchMessages = (roomId: string, callback: (message: ChatMessage) => void): (() => void) => {
  if (!supabase) return () => undefined;
  const channel = supabase.channel(`room-messages:${roomId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` }, (payload) => callback(payload.new as ChatMessage)).subscribe();
  return () => { void supabase.removeChannel(channel); };
};

export const submitSuggestion = async (roomId: string | null, playerId: string, body: string) => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { error } = await supabase.from('suggestions').insert({ room_id: roomId, player_id: playerId, body });
  if (error) throw error;
};

export const watchRoom = (id: string, callback: (snapshot: RoomSnapshot) => void): (() => void) => {
  if (!supabase) return () => undefined;
  let channel: RealtimeChannel;
  channel = supabase.channel(`room:${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${id}` }, (payload) => {
      if (payload.eventType === 'DELETE') callback({ data: null, updatedAt: new Date().toISOString() });
      else {
        const row = payload.new as RoomRow;
        callback({ data: row.data, updatedAt: row.updated_at });
      }
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error(`Supabase Realtime falhou para a sala ${id}: ${status}`);
    });
  return () => { void supabase.removeChannel(channel); };
};
