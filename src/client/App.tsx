import { useEffect } from 'react';
import { useGame, useServerNow } from './net.ts';
import { Home } from './screens/Home.tsx';
import { Lobby } from './screens/Lobby.tsx';
import { Game } from './screens/Game.tsx';
import { Podium } from './screens/Reveal.tsx';
import { Spectator } from './screens/Spectator.tsx';


export default function App() {
  const g = useGame();
  const now = useServerNow(g.offset);

  useEffect(() => {
    if (!g.flash) return;
    const t = setTimeout(g.clearFlash, 5000);
    return () => clearTimeout(t);
  }, [g.flash]); // eslint-disable-line react-hooks/exhaustive-deps

  let screen;
  if (g.spectate) screen = <Spectator view={g.spectate} api={g.api} />;
  else if (!g.view) screen = <Home api={g.api} connected={g.connected} />;
  else if (g.view.phase === 'lobby') screen = <Lobby view={g.view} api={g.api} />;
  else if (g.view.phase === 'starting')
    screen = (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="text-zinc-400">The party begins in</div>
        <div className="pop font-display text-8xl" key={Math.ceil((g.view.startsAt! - now) / 1000)}>
          {Math.max(1, Math.ceil((g.view.startsAt! - now) / 1000))}
        </div>
      </div>
    );
  else if (g.view.phase === 'over') screen = <Podium view={g.view} api={g.api} />;
  else screen = <Game view={g.view} api={g.api} now={now} />;

  return (
    <div className="mx-auto min-h-screen max-w-lg">
      {!g.connected && (
        <div className="fixed inset-x-0 top-0 z-50 bg-accent py-1 text-center text-sm">Reconnecting…</div>
      )}
      {screen}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4">
        {g.toasts.map((t) => (
          <div key={t.id} className="pop rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 shadow-lg">
            {t.text}
          </div>
        ))}
      </div>
      {g.flash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6" onClick={g.clearFlash}>
          <div className="pop card w-full max-w-sm border-gold">
            <div className="mb-2 text-xs uppercase tracking-widest text-gold">{g.flash.fromName} shows you a note</div>
            <div className="text-lg leading-snug">{g.flash.text}</div>
            <div className="mt-3 text-xs text-zinc-500">Disappears in 5 seconds · saved to your "seen" notes</div>
          </div>
        </div>
      )}
    </div>
  );
}
