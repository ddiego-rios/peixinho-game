import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

export type AppUser = { uid: string };
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

export type RoomSnapshot = { data: Record<string, unknown> | null; updatedAt: string | null };
type RoomRow = { id: string; data: Record<string, unknown>; updated_at: string };
const roomRow = (id: string) => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  return supabase.from('rooms').select('id,data').eq('id', id).single();
};

export const readRoom = async (id: string) => {
  const { data, error } = await roomRow(id);
  if (error && error.code !== 'PGRST116') throw error;
  const row = data as RoomRow | null;
  return { data: row?.data ?? null, updatedAt: row?.updated_at ?? null } satisfies RoomSnapshot;
};

export const createRoom = async (id: string, data: object) => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { error } = await supabase.from('rooms').insert({ id, data });
  if (error) throw error;
};

export const updateRoom = async (id: string, data: object) => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { error } = await supabase.from('rooms').update({ data, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
};

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
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error(`Supabase Realtime falhou para a sala ${id}: ${status}`);
      }
    });
  return () => { void supabase.removeChannel(channel); };
};
