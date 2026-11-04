import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Clock3, Info, LogOut, MessageCircle, Play, Send, Sparkles, Trophy, UserPlus, Users, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { AppUser, ChatMessage, RoomSnapshot } from './supabase';
import { createRoom, expireTurn, joinRoom, readMessages, readRoom, sendMessage, signIn, submitSuggestion, supabaseConfigured, updateRoom, watchMessages, watchRoom } from './supabase';

type Player = { id: string; name: string; score: number };
type CompletedSet = { rank: string; cards: string[]; playerName: string; createdAt: number };
type PendingDraw = { playerId: string; options: string[] };
type Room = {
  roomId: string; hostId: string; status: 'lobby' | 'playing' | 'finished'; players: Player[];
  deck: string[]; hands: Record<string, string[]>; turnIndex: number; logs: string[];
  createdAt: number; turnStartedAt?: number; turnDurationMs?: number;
  completedSets?: Record<string, CompletedSet[]>; pendingDraw?: PendingDraw | null;
};

const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const suits = ['H', 'D', 'C', 'S'];
const TURN_DURATION_MS = 30_000;
const PATCH_NOTES = [
  'Turnos agora têm contador de 30 segundos; ao expirar, a vez avança automaticamente.',
  '“Peixinho!” só aparece quando uma quadra é completada; pedir uma carta inexistente apenas inicia a pesca.',
  'A pesca permite escolher uma carta entre até três cartas reveladas.',
  'Quadras concluídas ficam visíveis na mesa e o chat de sala foi adicionado.',
  'Jogadores sem cartas são ignorados automaticamente na rotação de turnos.',
];

const makeDeck = () => {
  const result = suits.flatMap((suit) => ranks.map((rank) => `${rank}-${suit}`));
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
const cardDetails = (card: string) => {
  const [rank, suit] = card.split('-');
  return { rank, icon: suit === 'H' ? '♥' : suit === 'D' ? '♦' : suit === 'C' ? '♣' : '♠', red: suit === 'H' || suit === 'D' };
};
const roomCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();
const cloneRoom = (room: Room): Room => JSON.parse(JSON.stringify(room)) as Room;
const activeTurn = (players: Player[], hands: Record<string, string[]>, current: number) => {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (current + offset) % players.length;
    if ((hands[players[index].id] ?? []).length > 0) return index;
  }
  return current;
};

function Card({ card, hidden, selected, onClick }: { card?: string; hidden?: boolean; selected?: boolean; onClick?: () => void }) {
  if (hidden) return <div className="flex h-20 w-12 items-center justify-center rounded-lg border-2 border-white/80 bg-gradient-to-br from-blue-500 to-blue-800 shadow-lg sm:h-24 sm:w-16"><div className="h-12 w-8 rounded border border-blue-200/60 opacity-70" /></div>;
  const details = cardDetails(card!);
  return <button type="button" onClick={onClick} aria-pressed={selected} className={clsx('flex h-20 w-12 select-none flex-col justify-between rounded-lg bg-white p-1 text-left shadow-lg transition duration-200 sm:h-24 sm:w-16 sm:p-2', onClick && 'cursor-pointer hover:-translate-y-2 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300', selected ? 'ring-4 ring-yellow-400 -translate-y-4 shadow-yellow-400/30' : 'border border-white/70', details.red ? 'text-red-500' : 'text-slate-800')}><b className="text-xs">{details.rank} {details.icon}</b><span className="self-center text-2xl opacity-80 sm:text-3xl">{details.icon}</span><b className="self-end rotate-180 text-xs">{details.rank} {details.icon}</b></button>;
}
function Shell({ children }: { children: React.ReactNode }) { return <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#166534,_#052e16_70%)] p-4">{children}</main>; }
function Panel({ children }: { children: React.ReactNode }) { return <section className="w-full max-w-md rounded-3xl border border-white/60 bg-white/95 p-6 shadow-2xl shadow-black/30 sm:p-8">{children}</section>; }

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [name, setName] = useState('');
  const [roomCodeState, setRoomCodeState] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [roomUpdatedAt, setRoomUpdatedAt] = useState<string | null>(null);
  const [view, setView] = useState<'login' | 'menu' | 'lobby' | 'game'>('login');
  const [error, setError] = useState('');
  const [opponent, setOpponent] = useState<Player | null>(null);
  const [rank, setRank] = useState<string | null>(null);
  const [panel, setPanel] = useState<'log' | 'chat' | 'notes' | 'suggestions'>('log');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const currentUserId = user?.uid ?? '';
  const [remainingMs, setRemainingMs] = useState(TURN_DURATION_MS);
  const logEnd = useRef<HTMLDivElement>(null);
  const latestRoomUpdate = useRef<string | null>(null);

  useEffect(() => { setUser(signIn()); }, []);
  useEffect(() => {
    if (!user || !roomCodeState || !supabaseConfigured) return;
    let active = true;
    latestRoomUpdate.current = null;
    const applyRoom = (snapshot: RoomSnapshot) => {
      if (!active) return;
      if (snapshot.updatedAt && latestRoomUpdate.current && snapshot.updatedAt < latestRoomUpdate.current) return;
      if (snapshot.updatedAt) latestRoomUpdate.current = snapshot.updatedAt;
      setRoomUpdatedAt(snapshot.updatedAt);
      const next = snapshot.data as unknown as Room | null;
      setRoom(next);
      if (!next) { setView('menu'); setError('A sala não existe.'); }
      else setView(next.status === 'lobby' ? 'lobby' : 'game');
    };
    const stopRoom = watchRoom(roomCodeState, applyRoom);
    void readRoom(roomCodeState).then(applyRoom).catch(() => setError('Erro ao carregar a sala.'));
    void readMessages(roomCodeState).then(setMessages).catch(() => undefined);
    const stopMessages = watchMessages(roomCodeState, (message) => setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message].slice(-100)));
    return () => { active = false; stopRoom(); stopMessages(); };
  }, [user, roomCodeState]);
  useEffect(() => { logEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [room?.logs, messages]);
  useEffect(() => {
    if (!room?.turnStartedAt || room.status !== 'playing') return;
    const tick = () => setRemainingMs(Math.max(0, (room.turnStartedAt! + (room.turnDurationMs ?? TURN_DURATION_MS)) - Date.now()));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [room?.turnStartedAt, room?.turnDurationMs, room?.status]);
  useEffect(() => {
    if (!room || !user || room.status !== 'playing' || remainingMs > 0) return;
    void expireTurn(room.roomId, roomUpdatedAt, room.turnStartedAt ?? 0).catch(() => undefined);
  }, [remainingMs, room, roomUpdatedAt, user]);

  const online = () => {
    if (!supabaseConfigured || !user) { setError('Configure o Supabase no .env para jogar online.'); return false; }
    return true;
  };
  const persist = async (next: Room) => {
    await updateRoom(next.roomId, roomUpdatedAt, next);
  };
  const create = async () => {
    if (!name.trim() || !online()) return;
    const id = roomCode();
    const initial: Room = { roomId: id, hostId: user!.uid, status: 'lobby', players: [{ id: user!.uid, name: name.trim(), score: 0 }], deck: [], hands: {}, turnIndex: 0, logs: [`${name.trim()} criou a sala.`], createdAt: Date.now(), completedSets: {}, pendingDraw: null };
    try { await createRoom(id, initial); setRoomCodeState(id); } catch { setError('Não foi possível criar a sala.'); }
  };
  const join = async (input: string) => {
    if (!name.trim() || !online()) return;
    const id = input.trim().toUpperCase();
    if (!id) return setError('Digite um código de sala.');
    try {
      const snapshot = await readRoom(id);
      const existing = snapshot.data as unknown as Room | null;
      if (!existing) return setError('Sala não encontrada.');
      if (existing.status !== 'lobby') return setError('O jogo já começou.');
      if (existing.players.length >= 6 && !existing.players.some((player) => player.id === user!.uid)) return setError('A sala está cheia.');
      await joinRoom(id, user!.uid, name.trim());
      setError(''); setRoomCodeState(id);
    } catch (joinError) {
      const message = joinError instanceof Error ? joinError.message : '';
      setError(message.includes('cheia') ? 'A sala está cheia.' : message.includes('começou') ? 'O jogo já começou.' : 'Não foi possível entrar na sala.');
    }
  };
  const start = async () => {
    if (!room || room.hostId !== user?.uid) return;
    const next = cloneRoom(room); const cards = makeDeck(); next.players = next.players.map((player) => ({ ...player, score: 0 })); next.hands = {};
    next.players.forEach((player) => { next.hands[player.id] = cards.splice(-5); });
    next.status = 'playing'; next.deck = cards; next.turnIndex = 0; next.turnStartedAt = Date.now(); next.turnDurationMs = TURN_DURATION_MS; next.completedSets = {}; next.pendingDraw = null; next.logs = [...next.logs, 'O jogo começou! Cada turno dura 30 segundos.'].slice(-40);
    try { await persist(next); } catch { setError('Não foi possível iniciar o jogo.'); }
  };
  const addCompletedSets = (next: Room, player: Player, hand: string[]) => {
    const counts: Record<string, string[]> = {};
    hand.forEach((card) => { const cardRank = card.split('-')[0]; counts[cardRank] = [...(counts[cardRank] ?? []), card]; });
    const completed = Object.entries(counts).filter(([, cards]) => cards.length === 4);
    const remaining = hand.filter((card) => !completed.some(([completedRank]) => completedRank === card.split('-')[0]));
    if (completed.length) {
      next.completedSets = next.completedSets ?? {};
      next.completedSets[player.id] = [...(next.completedSets[player.id] ?? []), ...completed.map(([completedRank, cards]) => ({ rank: completedRank, cards, playerName: player.name, createdAt: Date.now() }))];
      next.logs.push(`Peixinho! ${player.name} completou ${completed.length} quadra(s) de ${completed.map(([completedRank]) => completedRank).join(', ')}! 🎉`);
    }
    return { remaining, points: completed.length };
  };
  const finishOrAdvance = (next: Room, current: number, keepTurn: boolean) => {
    const allEmpty = next.deck.length === 0 && Object.values(next.hands).every((hand) => hand.length === 0);
    next.status = allEmpty ? 'finished' : 'playing';
    if (!allEmpty) next.turnIndex = keepTurn && (next.hands[next.players[current].id] ?? []).length ? current : activeTurn(next.players, next.hands, current);
    next.turnStartedAt = Date.now(); next.pendingDraw = null;
  };
  const play = async () => {
    if (!room || !user || !opponent || !rank || room.status !== 'playing' || room.players[room.turnIndex]?.id !== currentUserId || room.pendingDraw) return;
    const next = cloneRoom(room); const target = next.players.find((player) => player.id === opponent.id)!; const mine = next.hands[currentUserId] ?? []; const targetHand = next.hands[target.id] ?? [];
    const got = targetHand.filter((card) => card.startsWith(`${rank}-`));
    if (got.length) {
      next.hands[target.id] = targetHand.filter((card) => !card.startsWith(`${rank}-`)); mine.push(...got); next.logs.push(`${name} pediu ${rank} a ${target.name} e recebeu ${got.length} carta(s).`);
      const result = addCompletedSets(next, { ...next.players.find((player) => player.id === currentUserId)! }, mine); next.hands[currentUserId] = result.remaining;
      const playerIndex = next.players.findIndex((player) => player.id === currentUserId); next.players[playerIndex].score += result.points;
      finishOrAdvance(next, playerIndex, true);
    } else {
      next.logs.push(`${name} pediu ${rank} a ${target.name}; não encontrou. Escolha uma carta para pescar.`);
      next.pendingDraw = { playerId: currentUserId, options: next.deck.slice(-Math.min(3, next.deck.length)).reverse() };
    }
    setRank(null); setOpponent(null);
    try { await persist(next); } catch { setError('A jogada não foi sincronizada. Tente novamente.'); }
  };
  const chooseDraw = async (card: string) => {
    if (!room?.pendingDraw || room.pendingDraw.playerId !== currentUserId || !room.deck.includes(card)) return;
    const next = cloneRoom(room); const cardIndex = next.deck.lastIndexOf(card); next.deck.splice(cardIndex, 1); next.hands[currentUserId] = [...(next.hands[currentUserId] ?? []), card]; next.logs.push(`${name} pescou uma carta do baralho.`);
    const result = addCompletedSets(next, { ...next.players.find((player) => player.id === currentUserId)! }, next.hands[currentUserId]); next.hands[currentUserId] = result.remaining;
    const playerIndex = next.players.findIndex((player) => player.id === currentUserId); next.players[playerIndex].score += result.points; finishOrAdvance(next, playerIndex, false);
    try { await persist(next); } catch { setError('A pesca não foi sincronizada.'); }
  };
  const sendChat = async () => {
    const body = chatText.trim();
    if (!body || !user || !roomCodeState) return;
    try { await sendMessage(roomCodeState, currentUserId, name, body); setChatText(''); } catch { setError('Não foi possível enviar a mensagem.'); }
  };
  const saveSuggestion = async () => {
    const body = suggestion.trim();
    if (!body || !user || !roomCodeState) return;
    try { await submitSuggestion(roomCodeState, currentUserId, body); setSuggestion(''); setError('Sugestão enviada. Obrigado!'); } catch { setError('Não foi possível enviar a sugestão.'); }
  };
  const leave = () => { setRoomCodeState(''); setRoom(null); setView('menu'); setPanel('log'); };

  if (!supabaseConfigured) return <Shell><Panel><h1 className="text-center text-4xl font-black text-green-800">PEIXINHO</h1><p className="mt-4 text-center text-gray-600">Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no ficheiro `.env` para jogar online.</p></Panel></Shell>;
  if (!user) return <Shell><Panel><div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-green-700" /><p className="mt-4 text-center">Conectando...</p></Panel></Shell>;
  if (view === 'login') return <Shell><Panel><div className="mb-6 text-center"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-700 text-3xl shadow-lg shadow-green-900/30">🐟</div><h1 className="text-4xl font-black tracking-tight text-green-900">PEIXINHO</h1><p className="mt-2 text-sm text-gray-500">O clássico jogo de cartas online</p></div><label className="text-sm font-semibold text-gray-700">Seu nome<input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && name.trim() && setView('menu')} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100" maxLength={12} /></label><button onClick={() => name.trim() ? setView('menu') : setError('Digite um nome!')} className="mt-5 w-full rounded-xl bg-green-600 py-3 font-bold text-white shadow-lg shadow-green-600/25 transition hover:bg-green-700">Continuar</button><p role="alert" className="mt-3 text-center text-sm text-red-500">{error}</p></Panel></Shell>;
  if (view === 'menu') return <Shell><Panel><div className="mb-8 flex items-start justify-between"><div><p className="text-sm font-semibold uppercase tracking-wider text-green-600">Peixinho Online</p><h2 className="mt-1 text-2xl font-black text-gray-900">Olá, {name}!</h2></div><button onClick={() => setView('login')} aria-label="Alterar nome"><LogOut size={20} /></button></div><button onClick={create} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 font-bold text-white"><UserPlus size={20} />Criar Nova Sala</button><div className="my-6 flex items-center gap-3 text-xs font-bold tracking-widest text-gray-400"><span className="h-px flex-1 bg-gray-200" />OU<span className="h-px flex-1 bg-gray-200" /></div><div className="flex gap-2"><input id="join" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center font-mono uppercase tracking-[0.3em]" maxLength={4} placeholder="CÓDIGO" aria-label="Código da sala" onKeyDown={(event) => event.key === 'Enter' && join(event.currentTarget.value)} /><button onClick={() => join((document.getElementById('join') as HTMLInputElement).value)} aria-label="Entrar na sala" className="rounded-xl bg-green-600 px-6 text-white"><ArrowRight size={20} /></button></div><p role="alert" className="mt-3 text-center text-sm text-red-500">{error}</p></Panel></Shell>;
  if (view === 'lobby' && room) return <Shell><Panel><div className="mb-6 flex items-start justify-between"><div><p className="text-sm font-semibold uppercase tracking-wider text-green-600">Sala pronta</p><h2 className="mt-1 text-3xl font-black text-gray-900">Lobby</h2><p className="mt-2 text-sm text-gray-500">Código: <b className="rounded-lg bg-gray-100 px-2 py-1 font-mono tracking-widest text-gray-800">{room.roomId}</b></p></div><button onClick={leave} className="rounded-lg px-3 py-2 text-sm font-semibold text-red-500">Sair</button></div><div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-4"><h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-800"><Users size={18} className="text-green-600" />Jogadores <span className="ml-auto rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">{room.players.length}/6</span></h3>{room.players.map((player) => <div key={player.id} className="mb-2 flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-600">{player.name[0]}</span><span className="font-medium text-gray-800">{player.name}</span>{player.id === room.hostId && <span className="ml-auto rounded-full bg-yellow-100 px-2 py-1 text-xs font-bold text-yellow-700">HOST</span>}</div>)}</div>{room.hostId === currentUserId ? <button disabled={room.players.length < 2} onClick={start} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-4 font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-400"><Play size={20} />{room.players.length < 2 ? 'Aguardando jogadores...' : 'Iniciar Jogo'}</button> : <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-center font-medium text-blue-800">Aguardando o host iniciar a partida...</div>}</Panel></Shell>;
  if (!room) return null;

  const mine = room.hands[currentUserId] ?? [];
  const myTurn = room.players[room.turnIndex]?.id === currentUserId && room.status === 'playing';
  const me = room.players.find((player) => player.id === currentUserId);
  const others = room.players.filter((player) => player.id !== currentUserId);
  const available = [...new Set(mine.map((card) => card.split('-')[0]))];
  const sorted = [...mine].sort((a, b) => ranks.indexOf(a.split('-')[0]) - ranks.indexOf(b.split('-')[0]));
  const seconds = Math.ceil(remainingMs / 1000);
  const activeMessages = panel === 'chat' ? messages : room.logs.map((log, index) => ({ id: `${index}-${log}`, body: log, sender_name: '', created_at: '' } as ChatMessage));

  return <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_#166534,_#14532d_55%,_#052e16)] text-white">
    <header className="border-b border-white/10 bg-green-950/90 p-3 shadow-xl backdrop-blur sm:p-4"><div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-2"><div className="mb-1 flex w-full items-center justify-between"><span className="rounded-full bg-green-900 px-3 py-1 font-mono text-xs font-semibold text-green-200 sm:text-sm">Sala: {roomCodeState}</span><button onClick={leave} aria-label="Sair da sala" className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white"><LogOut size={16} /></button></div>{others.map((player) => <button key={player.id} onClick={() => myTurn && (room.hands[player.id] ?? []).length && setOpponent(player)} className={clsx('min-w-[118px] rounded-2xl border border-white/5 bg-green-900/80 p-3 text-left shadow-lg transition hover:bg-green-800', opponent?.id === player.id && 'border-blue-400 bg-green-700 ring-4 ring-blue-500/60')}><div className="flex items-center justify-between gap-2"><b className="truncate">{player.name}</b><span className="text-xs text-yellow-300"><Trophy size={14} className="inline" /> {player.score}</span></div><div className="mt-2 flex items-end justify-center gap-1"><Card hidden /><small className="rounded-full bg-black/30 px-2 py-1 text-xs">{room.hands[player.id]?.length ?? 0}</small></div></button>)}</div></header>
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-3 sm:p-5 md:flex-row"><div className="flex min-h-[300px] flex-1 flex-col items-center justify-center rounded-3xl border border-white/10 bg-black/10 p-5 shadow-inner"><div className="rounded-3xl border border-white/10 bg-green-950/30 p-6"><Card hidden /></div><span className="mt-4 rounded-full border border-white/10 bg-black/40 px-4 py-1 text-sm font-semibold text-green-100">{room.deck.length} cartas no baralho</span><strong className={clsx('mt-5 flex items-center gap-2 rounded-full px-6 py-2 text-center shadow-lg', room.status === 'finished' ? 'bg-yellow-400 text-yellow-950' : myTurn ? 'bg-blue-600 text-white' : 'bg-black/40 text-green-50')}><Clock3 size={16} />{room.status === 'finished' ? 'FIM DE JOGO!' : myTurn ? `${seconds}s · É a sua vez!` : `Vez de ${room.players[room.turnIndex]?.name}`}</strong>{Object.values(room.completedSets ?? {}).flat().length > 0 && <div className="mt-5 w-full max-w-lg rounded-2xl border border-yellow-300/20 bg-yellow-400/10 p-3"><h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-yellow-200"><Sparkles size={16} /> Quadras feitas</h3><div className="flex flex-wrap gap-3">{Object.values(room.completedSets ?? {}).flat().map((set) => <div key={`${set.createdAt}-${set.rank}`} className="flex items-center gap-2 rounded-xl bg-black/20 p-2 text-xs"><div className="flex -space-x-3">{set.cards.map((card) => <Card key={card} card={card} />)}</div><span>{set.playerName}<br /><b>Quadra de {set.rank}</b></span></div>)}</div></div>}</div><div className="flex h-[360px] flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/25 p-4 shadow-inner md:h-auto md:max-w-md"><div className="mb-3 flex gap-1 border-b border-white/10 pb-3"><button onClick={() => setPanel('log')} className={clsx('rounded-lg px-3 py-2 text-sm font-semibold', panel === 'log' && 'bg-white/15')}>Histórico</button><button onClick={() => setPanel('chat')} className={clsx('flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold', panel === 'chat' && 'bg-white/15')}><MessageCircle size={15} />Chat</button><button onClick={() => setPanel('notes')} className={clsx('rounded-lg px-3 py-2 text-sm font-semibold', panel === 'notes' && 'bg-white/15')}>Notas</button><button onClick={() => setPanel('suggestions')} className={clsx('rounded-lg px-3 py-2 text-sm font-semibold', panel === 'suggestions' && 'bg-white/15')}>Ideias</button></div>{panel === 'notes' ? <div className="space-y-3 overflow-y-auto text-sm text-green-50"><h3 className="flex items-center gap-2 font-bold text-yellow-300"><Sparkles size={16} /> Patch notes v1.1</h3>{PATCH_NOTES.map((note) => <p key={note} className="rounded-xl bg-white/5 p-3">{note}</p>)}</div> : panel === 'suggestions' ? <div className="space-y-3"><p className="text-sm text-green-100">Envie uma ideia para melhorar o jogo.</p><textarea value={suggestion} onChange={(event) => setSuggestion(event.target.value)} className="h-28 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white outline-none" placeholder="A sua sugestão..." /><button onClick={saveSuggestion} disabled={!suggestion.trim()} className="w-full rounded-xl bg-blue-600 py-2 font-bold disabled:bg-gray-500">Enviar sugestão</button></div> : <div className="flex flex-1 flex-col overflow-y-auto">{activeMessages.map((message) => <div key={message.id} className="mb-2 text-sm leading-relaxed text-green-50/90">{panel === 'chat' && <b className="text-cyan-200">{message.sender_name}: </b>}{message.body}</div>)}<div ref={logEnd} /></div>}{panel === 'chat' && <div className="mt-3 flex gap-2"><input value={chatText} onChange={(event) => setChatText(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void sendChat()} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Mensagem..." aria-label="Mensagem do chat" /><button onClick={() => void sendChat()} aria-label="Enviar mensagem" className="rounded-xl bg-blue-600 px-3"><Send size={16} /></button></div>}</div></div>
    <footer className="border-t border-white/10 bg-green-950/90 p-4 shadow-[0_-12px_40px_rgba(0,0,0,0.25)] backdrop-blur"><div className="mx-auto flex max-w-6xl flex-col items-center gap-4">{myTurn && <div className="flex w-full flex-wrap justify-center gap-2 rounded-2xl border border-gray-200/80 bg-white p-3 text-gray-700 shadow-2xl sm:w-auto"><select value={opponent?.id ?? ''} onChange={(event) => setOpponent(others.find((player) => player.id === event.target.value) ?? null)} aria-label="Escolher jogador" className="rounded-lg border border-gray-200 bg-gray-100 p-2"><option value="">Selecione jogador</option>{others.map((player) => <option key={player.id} value={player.id} disabled={!(room.hands[player.id]?.length)}>{player.name}</option>)}</select>{available.map((item) => <button type="button" key={item} onClick={() => setRank(item)} aria-pressed={rank === item} className={clsx('h-10 w-10 rounded-lg border-2 font-bold transition', rank === item ? 'border-blue-600 bg-blue-600 text-white shadow-lg' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100')}>{item}</button>)}<button onClick={() => void play()} disabled={!opponent || !rank || Boolean(room.pendingDraw)} className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white disabled:bg-gray-300">Pedir!</button></div>}{room.pendingDraw?.playerId === currentUserId && <div className="w-full rounded-2xl border border-blue-200 bg-white p-4 text-center text-gray-700 shadow-2xl"><p className="mb-3 font-bold">Escolha uma carta para pescar:</p><div className="flex justify-center gap-3">{room.pendingDraw.options.map((card) => <Card key={card} card={card} onClick={() => void chooseDraw(card)} />)}</div></div>}{room.pendingDraw && room.pendingDraw.playerId !== currentUserId && <p className="rounded-full bg-black/30 px-4 py-2 text-sm text-green-100">O outro jogador está a escolher uma carta da pesca...</p>}<div className="flex min-h-[120px] flex-wrap justify-center gap-2">{sorted.map((card, index) => <Card key={`${card}-${index}`} card={card} selected={rank === card.split('-')[0]} onClick={myTurn ? () => setRank(card.split('-')[0]) : undefined} />)}</div></div></footer>
  </div>;
}
