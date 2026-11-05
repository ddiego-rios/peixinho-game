import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Info, LogOut, MessageCircle, Play, Send, Sparkles, Trophy, UserPlus, Users, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { AppUser, ChatMessage, RoomSnapshot } from './supabase';
import { createRoom, joinRoom, leaveRoom, readMessages, readRoom, sendMessage, signIn, submitSuggestion, supabaseConfigured, updatePlayerName, updateRoom, watchMessages, watchRoom } from './supabase';

type Player = { id: string; name: string; score: number };
type CompletedSet = { rank: string; cards: string[]; playerName: string; createdAt: number };
type Room = {
  roomId: string; hostId: string; status: 'lobby' | 'playing' | 'finished'; players: Player[];
  deck: string[]; hands: Record<string, string[]>; turnIndex: number; logs: string[];
  createdAt: number;
  completedSets?: Record<string, CompletedSet[]>;
  rematchVotes?: string[];
};

const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const suits = ['H', 'D', 'C', 'S'];
const PATCH_NOTES = [
  'Mesa reorganizada com jogadores numa barra lateral, placar compacto e histórico com scroll interno.',
  'Quadras e peixinhos podem ser recolhidos e consultados numa grade compacta.',
  'Distribuição oficial: 7 cartas para 2–3 jogadores e 5 cartas para 4 ou mais jogadores.',
  'Só é possível pedir valores que estejam na sua própria mão.',
  'Se a pesca trouxer o valor pedido, a vez continua; caso contrário, a vez passa ao próximo jogador.',
  'A pesca acontece automaticamente quando um pedido não encontra cartas; uma carta do topo é adicionada à mão.',
  '“Peixinho!” só aparece quando uma quadra é completada.',
  'Pedidos encontrados transferem as cartas e mantêm a vez; pedidos sem cartas avançam para o próximo jogador.',
  'Quadras concluídas ficam visíveis na mesa e o chat de sala foi adicionado.',
  'Jogadores sem cartas são ignorados automaticamente na rotação de turnos.',
  'As cartas dos outros jogadores permanecem sempre viradas para baixo; apenas a sua pesca recente é destacada para si.',
  'No fim da partida, todos os jogadores podem votar para jogar novamente sem criar outra sala.',
  'O nome pode ser alterado no menu sem criar um segundo jogador na sala.',
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

function Card({ card, hidden, selected, highlighted, onClick }: { card?: string; hidden?: boolean; selected?: boolean; highlighted?: boolean; onClick?: () => void }) {
  if (hidden) return <div className="flex h-20 w-12 items-center justify-center rounded-lg border-2 border-white/80 bg-gradient-to-br from-blue-500 to-blue-800 shadow-lg sm:h-24 sm:w-16"><div className="h-12 w-8 rounded border border-blue-200/60 opacity-70" /></div>;
  const details = cardDetails(card!);
  return <button type="button" onClick={onClick} aria-pressed={selected} className={clsx('flex h-20 w-12 select-none flex-col justify-between rounded-lg bg-white p-1 text-left shadow-lg transition duration-200 sm:h-24 sm:w-16 sm:p-2', onClick && 'cursor-pointer hover:-translate-y-2 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300', highlighted && 'animate-pulse ring-4 ring-cyan-300 shadow-cyan-300/50', selected ? 'ring-4 ring-yellow-400 -translate-y-4 shadow-yellow-400/30' : 'border border-white/70', details.red ? 'text-red-500' : 'text-slate-800')}><b className="text-xs">{details.rank} {details.icon}</b><span className="self-center text-2xl opacity-80 sm:text-3xl">{details.icon}</span><b className="self-end rotate-180 text-xs">{details.rank} {details.icon}</b></button>;
}
function Shell({ children }: { children: React.ReactNode }) { return <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#166534,_#052e16_70%)] p-3 sm:p-5">{children}</main>; }
function Panel({ children }: { children: React.ReactNode }) { return <section className="w-full max-w-md rounded-3xl border border-white/60 bg-white/95 p-5 shadow-2xl shadow-black/30 sm:p-8">{children}</section>; }

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
  const [panel, setPanel] = useState<'log' | 'chat'>('log');
  const [setsOpen, setSetsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [recentCard, setRecentCard] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const currentUserId = user?.uid ?? '';
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
    if (!roomCodeState || !room) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [roomCodeState, room, user]);

  const online = () => {
    if (!supabaseConfigured || !user) { setError('Configure o Supabase no .env para jogar online.'); return false; }
    return true;
  };
  const persist = async (next: Room) => {
    const result = await updateRoom(next.roomId, roomUpdatedAt, next);
    setRoom(next);
    setRoomUpdatedAt(result.updatedAt);
    latestRoomUpdate.current = result.updatedAt;
  };
  const create = async () => {
    if (!name.trim() || !online()) return;
    const id = roomCode();
    const initial: Room = { roomId: id, hostId: user!.uid, status: 'lobby', players: [{ id: user!.uid, name: name.trim(), score: 0 }], deck: [], hands: {}, turnIndex: 0, logs: [`${name.trim()} criou a sala.`], createdAt: Date.now(), completedSets: {} };
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
      if (existing.players.length >= 10 && !existing.players.some((player) => player.id === user!.uid)) return setError('A sala está cheia.');
      await joinRoom(id, user!.uid, name.trim());
      setError(''); setRoomCodeState(id);
    } catch (joinError) {
      const message = joinError instanceof Error ? joinError.message : '';
      setError(message.includes('cheia') ? 'A sala está cheia.' : message.includes('começou') ? 'O jogo já começou.' : 'Não foi possível entrar na sala.');
    }
  };
  const saveName = async () => {
    const nextName = nameDraft.trim().replace(/\s+/g, ' ');
    if (nextName.length < 2 || nextName.length > 24 || !/^[\p{L}\p{N} _-]+$/u.test(nextName)) {
      setError('O nome deve ter 2–24 caracteres e usar apenas letras, números, espaços, _ ou -.');
      return;
    }
    setName(nextName);
    if (!room || !user) { setNameDraft(''); setError('Nome atualizado.'); return; }
    try {
      const data = await updatePlayerName(room.roomId, user.uid, nextName);
      setRoom(data as unknown as Room);
      setNameDraft('');
      setError('Nome atualizado.');
    } catch { setError('Não foi possível atualizar o nome.'); }
  };
  const start = async () => {
    if (!room || room.hostId !== user?.uid) return;
    const next = cloneRoom(room); const cards = makeDeck(); next.players = next.players.map((player) => ({ ...player, score: 0 })); next.hands = {};
    const cardsPerPlayer = next.players.length <= 3 ? 7 : 5;
    next.players.forEach((player) => { next.hands[player.id] = cards.splice(-cardsPerPlayer); });
    next.status = 'playing'; next.deck = cards; next.turnIndex = Math.floor(Math.random() * next.players.length); next.completedSets = {}; next.logs = [...next.logs, `O jogo começou! ${next.players[next.turnIndex].name} começa.`].slice(-40);
    try { await persist(next); } catch { setError('Não foi possível iniciar o jogo.'); }
  };
  const rematch = async () => {
    if (!room || !user || room.status !== 'finished') return;
    const next = cloneRoom(room);
    next.rematchVotes = [...new Set([...(next.rematchVotes ?? []), currentUserId])];
    if (next.rematchVotes.length === next.players.length) {
      const cards = makeDeck();
      next.players = next.players.map((player) => ({ ...player, score: 0 }));
      next.hands = {};
      const cardsPerPlayer = next.players.length <= 3 ? 7 : 5;
      next.players.forEach((player) => { next.hands[player.id] = cards.splice(-cardsPerPlayer); });
      next.deck = cards;
      next.turnIndex = Math.floor(Math.random() * next.players.length);
      next.completedSets = {};
      next.rematchVotes = [];
      next.status = 'playing';
      next.logs = [`Nova partida iniciada! ${next.players[next.turnIndex].name} começa.`];
    } else {
      next.logs = [...next.logs, `${name} quer jogar novamente.`].slice(-40);
    }
    try { await persist(next); } catch { setError('Não foi possível registar o rematch.'); }
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
  const refillEmptyHand = (next: Room, playerId: string, playerName: string) => {
    if ((next.hands[playerId] ?? []).length > 0 || next.deck.length === 0) return false;
    const card = next.deck.pop();
    if (!card) return false;
    next.hands[playerId] = [card];
    next.logs.push(`${playerName} ficou sem cartas e pescou uma carta para continuar.`);
    return true;
  };
  const finishOrAdvance = (next: Room, current: number, keepTurn: boolean) => {
    const allEmpty = next.deck.length === 0 && Object.values(next.hands).every((hand) => hand.length === 0);
    next.status = allEmpty ? 'finished' : 'playing';
    if (!allEmpty) next.turnIndex = keepTurn && (next.hands[next.players[current].id] ?? []).length ? current : activeTurn(next.players, next.hands, current);
  };
  const play = async () => {
    if (!room || !user || !opponent || !rank || room.status !== 'playing' || room.players[room.turnIndex]?.id !== currentUserId) return;
    const next = cloneRoom(room); const target = next.players.find((player) => player.id === opponent.id); const mine = [...(next.hands[currentUserId] ?? [])];
    if (!target || target.id === currentUserId) return;
    const targetHand = [...(next.hands[target.id] ?? [])];
    if (!targetHand.length) {
      setError('Escolha um jogador que ainda tenha cartas.');
      setOpponent(null);
      return;
    }
    if (!mine.some((card) => card.startsWith(`${rank}-`))) {
      setError('Só pode pedir um valor que tenha na sua mão.');
      setRank(null);
      return;
    }
    const got = targetHand.filter((card) => card.startsWith(`${rank}-`));
    if (got.length) {
      next.hands[target.id] = targetHand.filter((card) => !card.startsWith(`${rank}-`)); mine.push(...got); next.hands[currentUserId] = mine; next.logs.push(`${name} pediu ${rank} a ${target.name} e recebeu ${got.length} carta(s).`);
      const result = addCompletedSets(next, { ...next.players.find((player) => player.id === currentUserId)! }, mine); next.hands[currentUserId] = result.remaining;
      const refilled = result.points > 0 && refillEmptyHand(next, currentUserId, name);
      const playerIndex = next.players.findIndex((player) => player.id === currentUserId); next.players[playerIndex].score += result.points;
      finishOrAdvance(next, playerIndex, true);
    } else {
      next.logs.push(`${name} pediu ${rank} a ${target.name}; não encontrou.`);
      const drawnCard = next.deck.pop();
      if (drawnCard) {
        mine.push(drawnCard);
        next.hands[currentUserId] = mine;
        next.logs.push(`${name} pescou uma carta do topo do monte.`);
        setRecentCard(drawnCard);
        window.setTimeout(() => setRecentCard(null), 4000);
      } else {
        next.logs.push('O baralho está vazio; a vez passa ao próximo jogador.');
      }
      const result = addCompletedSets(next, { ...next.players.find((player) => player.id === currentUserId)! }, mine);
      next.hands[currentUserId] = result.remaining;
      const refilled = result.points > 0 && refillEmptyHand(next, currentUserId, name);
      const playerIndex = next.players.findIndex((player) => player.id === currentUserId);
      next.players[playerIndex].score += result.points;
      finishOrAdvance(next, playerIndex, Boolean(drawnCard && drawnCard.startsWith(`${rank}-`)) || refilled);
    }
    setRank(null); setOpponent(null);
    try { await persist(next); } catch { setError('A jogada não foi sincronizada. Tente novamente.'); }
  };
  const sendChat = async () => {
    const body = chatText.trim();
    if (!body || !user || !roomCodeState) return;
    try { await sendMessage(roomCodeState, currentUserId, name, body); setChatText(''); } catch { setError('Não foi possível enviar a mensagem.'); }
  };
  const saveSuggestion = async () => {
    const body = suggestion.trim();
    if (!body || !user) return;
    try { await submitSuggestion(roomCodeState || null, currentUserId, body); setSuggestion(''); setError('Sugestão enviada. Obrigado!'); } catch { setError('Não foi possível enviar a sugestão.'); }
  };
  const leave = async () => {
    if (room && !window.confirm('Tem certeza de que deseja sair desta sala?')) return;
    if (room && user) {
      try { await leaveRoom(room.roomId, user.uid); } catch { setError('A saída local foi concluída, mas a sala não confirmou a remoção.'); }
    }
    setRoomCodeState(''); setRoom(null); setView('menu'); setPanel('log');
  };

  if (!supabaseConfigured) return <Shell><Panel><h1 className="text-center text-4xl font-black text-green-800">PEIXINHO</h1><p className="mt-4 text-center text-gray-600">Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no ficheiro `.env` para jogar online.</p></Panel></Shell>;
  if (!user) return <Shell><Panel><div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-green-700" /><p className="mt-4 text-center">Conectando...</p></Panel></Shell>;
  if (view === 'login') return <Shell><Panel><div className="mb-6 text-center"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-700 text-3xl shadow-lg shadow-green-900/30">🐟</div><h1 className="text-4xl font-black tracking-tight text-green-900">PEIXINHO</h1><p className="mt-2 text-sm text-gray-500">O clássico jogo de cartas online</p></div><label className="text-sm font-semibold text-gray-700">Seu nome<input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && name.trim() && setView('menu')} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100" maxLength={24} /></label><button onClick={() => name.trim() ? setView('menu') : setError('Digite um nome!')} className="mt-5 w-full rounded-xl bg-green-600 py-3 font-bold text-white shadow-lg shadow-green-600/25 transition hover:bg-green-700">Continuar</button><p role="alert" className="mt-3 text-center text-sm text-red-500">{error}</p></Panel></Shell>;
  if (view === 'menu') return <Shell><section className="w-full max-w-3xl rounded-3xl border border-white/60 bg-white/95 p-6 text-gray-900 shadow-2xl shadow-black/30 sm:p-8"><div className="mb-8 flex items-start justify-between"><div><p className="text-sm font-semibold uppercase tracking-wider text-green-600">Peixinho Online</p><h2 className="mt-1 text-2xl font-black">Olá, {name}!</h2></div><button onClick={() => setView('login')} aria-label="Alterar nome"><LogOut size={20} /></button></div><div className="mb-6 flex gap-2"><input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={24} placeholder="Novo nome" aria-label="Novo nome" className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2" /><button onClick={() => void saveName()} className="rounded-xl bg-slate-800 px-4 py-2 font-bold text-white">Guardar nome</button></div><div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div><button onClick={create} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 font-bold text-white"><UserPlus size={20} />Criar Nova Sala</button><div className="my-6 flex items-center gap-3 text-xs font-bold tracking-widest text-gray-400"><span className="h-px flex-1 bg-gray-200" />OU<span className="h-px flex-1 bg-gray-200" /></div><div className="flex gap-2"><input id="join" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center font-mono uppercase tracking-[0.3em]" maxLength={4} placeholder="CÓDIGO" aria-label="Código da sala" onKeyDown={(event) => event.key === 'Enter' && join(event.currentTarget.value)} /><button onClick={() => join((document.getElementById('join') as HTMLInputElement).value)} aria-label="Entrar na sala" className="rounded-xl bg-green-600 px-6 text-white"><ArrowRight size={20} /></button></div></div><div className="space-y-4 rounded-2xl bg-green-50 p-4"><div>  <h3 className="flex items-center gap-2 font-bold text-green-900"><Sparkles size={16} />Patch notes v1.4</h3>{PATCH_NOTES.map((note) => <p key={note} className="mt-2 rounded-xl bg-white p-2 text-sm text-gray-700">{note}</p>)}</div><div className="border-t border-green-200 pt-4"><label className="text-sm font-semibold text-green-900">Sugestão<textarea value={suggestion} onChange={(event) => setSuggestion(event.target.value)} className="mt-2 h-20 w-full rounded-xl border border-green-200 p-3 text-sm outline-none focus:ring-4 focus:ring-green-100" placeholder="Como podemos melhorar?" /></label><button onClick={saveSuggestion} disabled={!suggestion.trim()} className="mt-2 w-full rounded-xl bg-green-600 py-2 font-bold text-white disabled:bg-gray-300">Enviar sugestão</button></div></div></div><p role="alert" className="mt-3 text-center text-sm text-red-500">{error}</p></section></Shell>;
  if (view === 'lobby' && room) return <Shell><Panel><div className="mb-6 flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.18em] text-green-600 sm:text-sm">Sala pronta</p><h2 className="mt-1 text-3xl font-black tracking-tight text-gray-900">Lobby</h2><p className="mt-2 text-sm text-gray-500">Código: <b className="rounded-lg bg-gray-100 px-2 py-1 font-mono tracking-widest text-gray-800">{room.roomId}</b></p></div><div className="flex gap-2"><button onClick={() => setHelpOpen(true)} className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50">Ajuda</button><button onClick={() => void leave()} className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-red-500 transition hover:bg-red-50">Sair</button></div></div><div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:p-4"><h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-800"><Users size={18} className="text-green-600" />Jogadores   <span className="ml-auto rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">{room.players.length}/10</span></h3><div className="space-y-2">{room.players.map((player) => <div key={player.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-600">{player.name[0]}</span><span className="min-w-0 break-words text-sm font-semibold leading-snug text-gray-800 sm:text-base">{player.name}</span>{player.id === room.hostId && <span className="ml-auto shrink-0 rounded-full bg-yellow-100 px-2 py-1 text-xs font-bold text-yellow-700">HOST</span>}</div>)}</div></div><div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 p-3"><h3 className="mb-2 flex items-center gap-2 font-bold text-blue-900"><MessageCircle size={16} /> Chat do lobby</h3><div className="max-h-28 overflow-y-auto rounded-xl bg-white p-2 text-sm text-gray-700">{messages.slice(-20).map((message) => <p key={message.id}><b>{message.sender_name}: </b>{message.body}</p>)}</div><div className="mt-2 flex gap-2"><input value={chatText} onChange={(event) => setChatText(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void sendChat()} className="min-w-0 flex-1 rounded-xl border border-blue-200 px-3 py-2 text-sm" placeholder="Mensagem..." aria-label="Mensagem do chat do lobby" /><button onClick={() => void sendChat()} className="rounded-xl bg-blue-600 px-3 text-white" aria-label="Enviar mensagem"><Send size={16} /></button></div>  </div>{helpOpen && <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900"><b>Regras rápidas:</b> peça um valor da sua mão; receba todas as cartas encontradas; se falhar, pesque automaticamente. Quatro cartas iguais formam um Peixinho. <button onClick={() => setHelpOpen(false)} className="ml-2 font-bold underline">Fechar</button></div>}{room.hostId === currentUserId ? <button disabled={room.players.length < 2} onClick={start} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-4 font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"><Play size={20} />{room.players.length < 2 ? 'Aguardando jogadores...' : 'Iniciar Jogo'}</button> : <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-center font-medium text-blue-800">Aguardando o host iniciar a partida...</div>}</Panel></Shell>;
  if (!room) return null;

  const mine = room.hands[currentUserId] ?? [];
  const myTurn = room.players[room.turnIndex]?.id === currentUserId && room.status === 'playing';
  const me = room.players.find((player) => player.id === currentUserId);
  const others = room.players.filter((player) => player.id !== currentUserId);
  const nextPlayer = room.players[room.turnIndex];
  const nextPlayerCards = nextPlayer ? (room.hands[nextPlayer.id] ?? []).length : 0;
  const nextTurnLabel = room.status === 'finished' ? 'Partida encerrada' : nextPlayerCards === 0 ? `${nextPlayer?.name ?? 'Jogador'} sem cartas — a vez será saltada` : `Próxima vez: ${nextPlayer?.name ?? '—'}`;
  const available = [...new Set(mine.map((card) => card.split('-')[0]))];
  const sorted = [...mine].sort((a, b) => ranks.indexOf(a.split('-')[0]) - ranks.indexOf(b.split('-')[0]));
  const activeMessages = panel === 'chat' ? messages : room.logs.map((log, index) => ({ id: `${index}-${log}`, body: log, sender_name: '', created_at: '' } as ChatMessage));
  const completedEntries = Object.values(room.completedSets ?? {}).flat();

  const playerScoreboard = room.players.map((player) => ({ player, sets: room.completedSets?.[player.id] ?? [] }));
  const topScore = Math.max(...room.players.map((player) => player.score), 0);
  const winners = room.players.filter((player) => player.score === topScore);

  return <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_#166534,_#14532d_55%,_#052e16)] text-white">
    <header className="sticky top-0 z-10 border-b border-white/10 bg-green-950/95 p-3 shadow-xl backdrop-blur sm:p-4"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><img src="/peixinho.svg" alt="" className="h-8 w-8 rounded-lg shadow-md" /><span className="rounded-full bg-green-900 px-3 py-1 font-mono text-xs font-semibold text-green-200 sm:text-sm">Sala: {roomCodeState}</span><span className="hidden text-xs text-green-200/70 sm:inline">{room.players.length} jogadores</span></div><div className="flex items-center gap-2"><button onClick={() => setHelpOpen(true)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-green-100 hover:bg-white/10" aria-label="Ajuda">Ajuda</button><div className="rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-center text-sm font-bold text-cyan-100" aria-live="polite"><span className="block text-[10px] uppercase tracking-[0.2em] text-cyan-300">Próxima vez</span><span>{nextTurnLabel}</span></div><button onClick={() => void leave()} aria-label="Sair da sala" className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white"><LogOut size={16} /></button></div></div></header>
    <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-4 p-3 sm:p-5 lg:grid-cols-[210px_minmax(0,1fr)_300px]">
      <aside className="order-2 rounded-3xl border border-white/10 bg-black/20 p-3 shadow-inner lg:order-1"><div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold text-green-100"><Users size={16} /> Jogadores</h2><span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-green-200">{room.players.length}/10</span></div><div className="grid grid-cols-2 gap-2 lg:grid-cols-1">{room.players.map((player) => <button key={player.id} onClick={() => player.id !== currentUserId && myTurn && (room.hands[player.id] ?? []).length && setOpponent(player)} className={clsx('min-w-0 rounded-2xl border border-white/5 bg-green-900/80 p-2 text-left shadow-lg transition hover:bg-green-800', opponent?.id === player.id && 'border-blue-400 bg-green-700 ring-2 ring-blue-500/60')}><div className="flex items-start justify-between gap-1"><b className="min-w-0 break-words text-xs font-semibold leading-tight">{player.name}{player.id === currentUserId && ' (você)'}</b><span className="shrink-0 text-[10px] text-yellow-300"><Trophy size={12} className="inline" /> {player.score}</span></div><div className="mt-2 flex items-center justify-between text-[10px] text-green-100/70"><span>{room.hands[player.id]?.length ?? 0} cartas</span><span>{room.completedSets?.[player.id]?.length ?? 0} 🐟</span></div></button>)}</div></aside>
      <main className="order-1 flex min-h-[360px] min-w-0 flex-col items-center justify-center rounded-3xl border border-white/10 bg-black/10 p-4 shadow-inner sm:p-6 lg:order-2"><div className="w-full max-w-xl rounded-3xl border border-white/10 bg-green-950/30 p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-300">Placar da mesa</p><h2 className="text-lg font-black text-white">Peixinhos por jogador</h2></div><span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-green-100">{room.deck.length} no monte</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{playerScoreboard.map(({ player, sets }) => <div key={player.id} className={clsx('rounded-2xl border px-3 py-3', player.id === nextPlayer?.id ? 'border-cyan-300/50 bg-cyan-400/10' : 'border-white/10 bg-black/20')}><p className="truncate text-xs font-semibold text-green-100" title={player.name}>{player.name}</p><p className="mt-1 text-2xl font-black text-yellow-300">{sets.length}</p><p className="text-[10px] uppercase tracking-wider text-green-200/70">peixinhos</p></div>)}</div></div><strong className={clsx('mt-5 rounded-full px-6 py-2 text-center shadow-lg', room.status === 'finished' ? 'bg-yellow-400 text-yellow-950' : myTurn ? 'bg-blue-600 text-white' : 'bg-black/40 text-green-50')}>{room.status === 'finished' ? 'FIM DE JOGO!' : myTurn ? 'É a sua vez!' : `Vez de ${room.players[room.turnIndex]?.name}`}</strong>{room.status === 'finished' ? <div className="mt-5 w-full max-w-xl rounded-2xl border border-yellow-300/30 bg-yellow-400/10 p-4 text-center text-yellow-50"><h2 className="text-xl font-black">Vencedor(es): {winners.map((winner) => winner.name).join(', ')}</h2><p className="mt-1 text-sm">Pontuação: {winners.map((winner) => `${winner.name} (${winner.score})`).join(' · ')}</p><p className="mt-1 text-sm">Votos para jogar novamente: {(room.rematchVotes ?? []).length}/{room.players.length}</p><div className="mt-3 flex justify-center gap-2"><button onClick={() => void rematch()} className="rounded-xl bg-green-600 px-4 py-2 font-bold text-white">Quero jogar novamente</button><button onClick={() => void leave()} className="rounded-xl border border-yellow-200/50 px-4 py-2 font-bold">Sair</button></div></div> : <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-green-100"><Card hidden /><span>{room.deck.length > 0 ? 'O monte está pronto para a próxima pesca automática.' : 'O monte está vazio.'}</span></div>}</main>
      <aside className="order-3 flex min-h-[320px] min-w-0 flex-col gap-3 rounded-3xl border border-white/10 bg-black/25 p-3 shadow-inner lg:max-h-[calc(100vh-9rem)]"><div className="flex items-center justify-between border-b border-white/10 pb-3"><div className="flex gap-1"><button onClick={() => setPanel('log')} className={clsx('rounded-lg px-3 py-2 text-sm font-semibold', panel === 'log' && 'bg-white/15')}>Histórico</button><button onClick={() => setPanel('chat')} className={clsx('flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold', panel === 'chat' && 'bg-white/15')}><MessageCircle size={15} />Chat</button></div></div><div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black/15"><div className="max-h-56 overflow-y-auto p-3 pr-2 lg:max-h-[calc(100vh-20rem)]">{(panel === 'log' ? activeMessages.slice(-24) : activeMessages).map((message) => <div key={message.id} className="mb-2 text-sm leading-relaxed text-green-50/90">{panel === 'chat' && <b className="text-cyan-200">{message.sender_name}: </b>}{message.body}</div>)}<div ref={logEnd} /></div><div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/30 to-transparent" /></div>{panel === 'chat' && <div className="flex gap-2"><input value={chatText} onChange={(event) => setChatText(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void sendChat()} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" placeholder="Mensagem..." aria-label="Mensagem do chat" /><button onClick={() => void sendChat()} aria-label="Enviar mensagem" className="rounded-xl bg-blue-600 px-3"><Send size={16} /></button></div>}<section className="rounded-2xl border border-yellow-300/20 bg-yellow-400/10 p-3"><button onClick={() => setSetsOpen((open) => !open)} className="flex w-full items-center justify-between text-left" aria-expanded={setsOpen}><span className="flex items-center gap-2 text-sm font-bold text-yellow-200"><Sparkles size={16} /> Quadras / peixinhos <span className="rounded-full bg-yellow-300/20 px-2 py-0.5 text-[10px]">{completedEntries.length}</span></span>{setsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{setsOpen && <div className="mt-3 grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1">{completedEntries.length ? completedEntries.map((set) => <div key={`${set.createdAt}-${set.rank}`} className="rounded-xl bg-black/20 p-2 text-xs"><div className="mb-1 flex items-center justify-between"><b>{set.playerName}</b><span className="text-yellow-200">{set.rank}</span></div><div className="flex gap-1">{set.cards.map((card) => <div key={card} className="-mr-5 origin-left scale-50"><Card card={card} /></div>)}</div></div>) : <p className="text-xs text-yellow-100/70">Nenhuma quadra concluída ainda.</p>}</div>}</section></aside>
    </div>
    <footer className="border-t border-white/10 bg-green-950/90 p-4 shadow-[0_-12px_40px_rgba(0,0,0,0.25)] backdrop-blur"><div className="mx-auto flex max-w-6xl flex-col items-center gap-4">{myTurn && <div className="flex w-full flex-wrap justify-center gap-2 rounded-2xl border border-gray-200/80 bg-white p-3 text-gray-700 shadow-2xl sm:w-auto"><select value={opponent?.id ?? ''} onChange={(event) => setOpponent(others.find((player) => player.id === event.target.value) ?? null)} aria-label="Escolher jogador" className="rounded-lg border border-gray-200 bg-gray-100 p-2"><option value="">Selecione jogador</option>{others.map((player) => <option key={player.id} value={player.id} disabled={!(room.hands[player.id]?.length)}>{player.name}</option>)}</select>{available.map((item) => <button type="button" key={item} onClick={() => setRank(item)} aria-pressed={rank === item} className={clsx('h-10 w-10 rounded-lg border-2 font-bold transition', rank === item ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100')}>{item}</button>)}<button onClick={() => void play()} disabled={!opponent || !rank} className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white disabled:bg-gray-300">Pedir!</button></div>}<div className="flex min-h-[120px] flex-wrap justify-center gap-2">{sorted.map((card, index) => <Card key={`${card}-${index}`} card={card} highlighted={recentCard === card} selected={rank === card.split('-')[0]} onClick={myTurn ? () => setRank(card.split('-')[0]) : undefined} />)}</div></div></footer>
    {helpOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="help-title"><section className="w-full max-w-lg rounded-3xl bg-white p-6 text-slate-800 shadow-2xl"><div className="flex items-center justify-between"><h2 id="help-title" className="text-xl font-black text-green-900">Como jogar Peixinho</h2><button onClick={() => setHelpOpen(false)} aria-label="Fechar ajuda" className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button></div><ul className="mt-4 list-disc space-y-2 pl-5 text-sm"><li>Peça apenas um valor que tenha na sua mão.</li><li>Se o alvo tiver esse valor, recebe todas as cartas e joga novamente.</li><li>Se não tiver, pesca automaticamente do topo; acertar o valor mantém a vez.</li><li>Quatro cartas do mesmo valor formam um Peixinho e saem da mão.</li><li>No fim, pode votar para jogar novamente com a mesma sala.</li></ul><button onClick={() => setHelpOpen(false)} className="mt-5 w-full rounded-xl bg-green-600 py-2 font-bold text-white">Entendi</button></section></div>}
  </div>;
}
