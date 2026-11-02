import { useEffect, useRef, useState } from 'react';
import { Info, LogOut, Play, RotateCcw, Trophy, UserPlus } from 'lucide-react';
import { clsx } from 'clsx';

type Player = { id: string; name: string; score: number };
type GameState = { players: Player[]; deck: string[]; hands: Record<string, string[]>; turnIndex: number; logs: string[]; finished: boolean };
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const suits = ['H', 'D', 'C', 'S'];
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
const draw = (deck: string[], count: number) => deck.splice(Math.max(0, deck.length - count), count);

function Card({ card, hidden, selected, onClick }: { card?: string; hidden?: boolean; selected?: boolean; onClick?: () => void }) {
  if (hidden) return <div className="flex h-20 w-12 items-center justify-center rounded-lg border-2 border-white bg-blue-700 shadow sm:h-24 sm:w-16"><div className="h-12 w-8 rounded border border-blue-400 opacity-50" /></div>;
  const details = cardDetails(card!);
  return <button type="button" onClick={onClick} className={clsx('flex h-20 w-12 select-none flex-col justify-between rounded-lg bg-white p-1 text-left shadow transition-transform sm:h-24 sm:w-16 sm:p-2', onClick && 'cursor-pointer hover:-translate-y-2', selected ? 'ring-4 ring-yellow-400 -translate-y-4' : 'border border-gray-300', details.red ? 'text-red-500' : 'text-slate-800')}><b className="text-xs">{details.rank} {details.icon}</b><span className="self-center text-2xl opacity-80 sm:text-3xl">{details.icon}</span><b className="self-end rotate-180 text-xs">{details.rank} {details.icon}</b></button>;
}
function Shell({ children }: { children: React.ReactNode }) { return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-800 to-green-950 p-4">{children}</main>; }
function Panel({ children }: { children: React.ReactNode }) { return <section className="w-full max-w-md rounded-2xl bg-white/95 p-8 shadow-2xl">{children}</section>; }

export default function App() {
  const [name, setName] = useState('');
  const [view, setView] = useState<'login' | 'menu' | 'game'>('login');
  const [game, setGame] = useState<GameState | null>(null);
  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null);
  const [selectedRank, setSelectedRank] = useState<string | null>(null);
  const [error, setError] = useState('');
  const logEnd = useRef<HTMLDivElement>(null);
  const playerId = 'local-player';

  const startGame = () => {
    if (!name.trim()) return setError('Digite um nome!');
    const deck = makeDeck();
    const players = [{ id: playerId, name: name.trim(), score: 0 }, { id: 'bot-1', name: 'Peixinho Bot', score: 0 }, { id: 'bot-2', name: 'Capitão Nemo', score: 0 }];
    const hands: Record<string, string[]> = {};
    players.forEach((player) => { hands[player.id] = draw(deck, 5); });
    setGame({ players, deck, hands, turnIndex: 0, logs: ['Partida local iniciada! 5 cartas para cada jogador.'], finished: false });
    setSelectedOpponent(null);
    setSelectedRank(null);
    setView('game');
  };
  const reset = () => { setGame(null); setSelectedOpponent(null); setSelectedRank(null); setView('menu'); };
  const completeSets = (hand: string[], playerName: string, logs: string[]) => {
    const counts: Record<string, number> = {};
    hand.forEach((card) => { const rank = card.split('-')[0]; counts[rank] = (counts[rank] || 0) + 1; });
    const sets = Object.keys(counts).filter((rank) => counts[rank] === 4);
    if (sets.length) logs.push(`${playerName} fez ${sets.length} quadra(s)! 🎉`);
    return { hand: hand.filter((card) => !sets.includes(card.split('-')[0])), points: sets.length };
  };
  const replenish = (hand: string[], playerName: string, deck: string[], logs: string[]) => {
    if (!hand.length && deck.length) {
      const cards = draw(deck, Math.min(5, deck.length));
      hand.push(...cards);
      logs.push(`${playerName} comprou ${cards.length} carta(s).`);
    }
  };
  const playTurn = () => {
    if (!game || !selectedOpponent || !selectedRank || game.finished || game.turnIndex !== 0) return;
    const hands = Object.fromEntries(Object.entries(game.hands).map(([id, hand]) => [id, [...hand]]));
    const deck = [...game.deck];
    const logs = [...game.logs];
    const target = game.players.find((player) => player.id === selectedOpponent)!;
    const cards = hands[target.id].filter((card) => card.startsWith(`${selectedRank}-`));
    hands[target.id] = hands[target.id].filter((card) => !card.startsWith(`${selectedRank}-`));
    if (cards.length) {
      hands[playerId].push(...cards);
      logs.push(`${name} pediu ${selectedRank} a ${target.name} e recebeu ${cards.length} carta(s).`);
    } else {
      logs.push(`${name} pediu ${selectedRank} a ${target.name}. Peixinho! 🐟`);
      const card = deck.pop();
      if (card) hands[playerId].push(card);
    }
    const result = completeSets(hands[playerId], name, logs);
    hands[playerId] = result.hand;
    replenish(hands[playerId], name, deck, logs);
    const players = game.players.map((player) => player.id === playerId ? { ...player, score: player.score + result.points } : player);
    const finished = deck.length === 0 && Object.values(hands).every((hand) => hand.length === 0);
    setGame({ players, hands, deck, logs: logs.slice(-40), turnIndex: cards.length ? 0 : 1, finished });
    setSelectedOpponent(null);
    setSelectedRank(null);
  };
  const runBotTurn = () => {
    if (!game || game.finished || game.turnIndex === 0) return;
    const bot = game.players[game.turnIndex];
    const opponents = game.players.filter((player) => player.id !== bot.id && game.hands[player.id].length);
    if (!opponents.length) return setGame({ ...game, turnIndex: (game.turnIndex + 1) % game.players.length });
    const target = opponents[Math.floor(Math.random() * opponents.length)];
    const botHand = game.hands[bot.id];
    const rank = botHand[Math.floor(Math.random() * botHand.length)].split('-')[0];
    const hands = Object.fromEntries(Object.entries(game.hands).map(([id, hand]) => [id, [...hand]]));
    const deck = [...game.deck];
    const logs = [...game.logs];
    const cards = hands[target.id].filter((card) => card.startsWith(`${rank}-`));
    hands[target.id] = hands[target.id].filter((card) => !card.startsWith(`${rank}-`));
    if (cards.length) { hands[bot.id].push(...cards); logs.push(`${bot.name} pediu ${rank} a ${target.name} e recebeu ${cards.length} carta(s).`); }
    else { logs.push(`${bot.name} pediu ${rank}. Peixinho! 🐟`); const card = deck.pop(); if (card) hands[bot.id].push(card); }
    const result = completeSets(hands[bot.id], bot.name, logs);
    hands[bot.id] = result.hand;
    replenish(hands[bot.id], bot.name, deck, logs);
    const players = game.players.map((player) => player.id === bot.id ? { ...player, score: player.score + result.points } : player);
    const finished = deck.length === 0 && Object.values(hands).every((hand) => hand.length === 0);
    setGame({ players, hands, deck, logs: logs.slice(-40), turnIndex: (game.turnIndex + 1) % game.players.length, finished });
  };
  useEffect(() => { if (game && game.turnIndex !== 0 && !game.finished) { const timer = window.setTimeout(runBotTurn, 700); return () => window.clearTimeout(timer); } return undefined; }, [game]);
  useEffect(() => { logEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [game?.logs]);

  if (view === 'login') return <Shell><Panel><h1 className="text-center text-4xl font-black text-green-800">PEIXINHO</h1><p className="mb-8 text-center text-sm text-gray-500">Jogo de cartas local para uma pessoa</p><label className="text-sm font-semibold">Seu nome<input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && startGame()} className="mt-1 w-full rounded-lg border px-4 py-3" maxLength={12} placeholder="Ex: João" /></label><button onClick={startGame} className="mt-4 w-full rounded-lg bg-green-600 py-3 font-bold text-white"><Play className="mr-2 inline" size={18} /> Começar partida</button><p className="mt-3 text-center text-sm text-red-500">{error}</p></Panel></Shell>;
  if (view === 'menu') return <Shell><Panel><h2 className="mb-4 text-2xl font-bold">Olá, {name}!</h2><p className="mb-6 text-gray-600">Jogue uma partida completa neste navegador. Não é necessária conta, servidor ou ligação à internet.</p><button onClick={startGame} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 font-bold text-white"><UserPlus size={20} /> Nova Partida</button><button onClick={() => setView('login')} className="mt-3 w-full rounded-xl border py-3 text-gray-600"><LogOut size={18} className="mr-2 inline" /> Alterar nome</button></Panel></Shell>;
  if (!game) return null;
  const me = game.players[0];
  const opponents = game.players.slice(1);
  const myHand = game.hands[playerId] || [];
  const availableRanks = [...new Set(myHand.map((card) => card.split('-')[0]))];
  const sortedHand = [...myHand].sort((a, b) => ranks.indexOf(a.split('-')[0]) - ranks.indexOf(b.split('-')[0]));
  const isMyTurn = game.turnIndex === 0 && !game.finished;
  return <div className="flex min-h-screen flex-col bg-green-800 text-white"><header className="flex flex-wrap justify-center gap-2 bg-green-950 p-3 shadow-xl"><div className="flex w-full justify-between"><span className="font-mono text-green-300">Partida local</span><button onClick={reset} className="flex items-center gap-1 text-sm text-gray-400"><LogOut size={16} /> Sair</button></div>{opponents.map((player) => <button type="button" key={player.id} onClick={() => isMyTurn && game.hands[player.id].length && setSelectedOpponent(player.id)} className={clsx('rounded-xl bg-green-900 p-3', game.turnIndex === game.players.findIndex((item) => item.id === player.id) && 'ring-2 ring-yellow-400', selectedOpponent === player.id && 'ring-4 ring-blue-500')}><b>{player.name}</b><span className="ml-2 text-yellow-400"><Trophy size={14} className="inline" /> {player.score}</span><div className="mt-2 flex justify-center"><Card hidden /><small className="self-end">x{game.hands[player.id].length}</small></div></button>)}</header><div className="flex flex-1 flex-col gap-4 p-4 md:flex-row"><div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-black/10 p-4"><Card hidden /><span className="mt-3 rounded-full bg-black/50 px-4 py-1">{game.deck.length} cartas</span><strong className="mt-5 rounded-full bg-black/40 px-6 py-2">{game.finished ? 'FIM DE JOGO!' : isMyTurn ? 'É a sua vez!' : `Vez de ${game.players[game.turnIndex].name}`}</strong></div><div className="flex h-48 flex-1 flex-col overflow-y-auto rounded-2xl bg-black/30 p-4 md:h-auto md:max-w-md"><div className="mb-2 flex gap-2 font-semibold"><Info size={16} /> Histórico</div>{game.logs.map((log, index) => <div key={`${log}-${index}`} className="mb-2 text-sm">{log}</div>)}<div ref={logEnd} /></div></div><footer className="bg-green-950/90 p-4"><div className="mx-auto flex max-w-5xl flex-col items-center gap-4"><span className="text-yellow-400"><Trophy size={18} className="inline" /> {me.score} pontos</span>{isMyTurn && <div className="flex flex-wrap justify-center gap-2 rounded-2xl bg-white p-3 text-gray-700"><select value={selectedOpponent || ''} onChange={(event) => setSelectedOpponent(event.target.value || null)} className="rounded-lg bg-gray-100 p-2"><option value="">Selecione jogador</option>{opponents.map((player) => <option key={player.id} value={player.id} disabled={!game.hands[player.id].length}>{player.name}</option>)}</select>{availableRanks.map((item) => <button type="button" key={item} onClick={() => setSelectedRank(item)} className={clsx('h-10 w-10 rounded-lg border-2 font-bold', selectedRank === item ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300')}>{item}</button>)}<button type="button" onClick={playTurn} disabled={!selectedOpponent || !selectedRank} className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white disabled:bg-gray-300">Pedir!</button></div>}{game.finished && <button onClick={startGame} className="rounded-xl bg-green-500 px-5 py-2 font-bold"><RotateCcw size={18} className="mr-2 inline" /> Jogar novamente</button>}<div className="flex min-h-[120px] flex-wrap justify-center gap-2">{sortedHand.length ? sortedHand.map((card, index) => <Card key={`${card}-${index}`} card={card} selected={selectedRank === card.split('-')[0]} onClick={isMyTurn ? () => setSelectedRank(card.split('-')[0]) : undefined} />) : <span className="self-center font-bold italic text-green-300/50">Você ficou sem cartas!</span>}</div></div></footer></div>;
}
