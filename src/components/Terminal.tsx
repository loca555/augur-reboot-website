import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

// Типы строк лога — используются для стилизации через CSS-классы
type LogClass = 'cmd' | 'muted' | 'warn' | 'err' | 'out';

interface LogEntry {
  id: number;
  cls: LogClass;
  text: string;
}

interface ForkRiskDataShape {
  riskLevel: string;
  riskPercentage: number;
  metrics: {
    largestDisputeBond: number;
    forkThresholdPercent: number;
    activeDisputes: number;
    disputeDetails?: Array<{ marketId?: string; disputeRound?: number }>;
  };
}

const BANNER: Array<{ cls: LogClass; text: string }> = [
  { cls: 'out', text: 'AUGUR LITUUS TERMINAL v0.1.0' },
  { cls: 'muted', text: '(c) 2026 Lituus Foundation — reboot build 1.4.2' },
  { cls: 'muted', text: 'Connected to augur.net' },
  { cls: 'out', text: '' },
  { cls: 'muted', text: "Type 'help' for available commands." },
];

const HELP_LINES = [
  'available commands:',
  '  help               show this help',
  '  whoami             show current identity',
  '  fork status        show current fork risk snapshot',
  '  rep balance <addr> check REP balance for address',
  '  migrate            open migration portal',
  '  roadmap            show 2026 milestones',
  '  clear              clear the log',
  '  exit               close terminal',
];

const ROADMAP_LINES = [
  '2026 milestones:',
  '  jan 02  augur turns 10 — crowdsourcer filled, whitepaper approaching',
  '  jan 29  augur lituus whitepaper released',
  '  apr 02  one year in — two development tracks live',
  '  apr 08  the moon fork begins — first algorithmic fork',
  '  jun     migration window opens — 2 months, 1:1 REP migration',
];

let nextId = 0;
const makeEntry = (cls: LogClass, text: string): LogEntry => ({
  id: nextId++,
  cls,
  text,
});

const Terminal: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const push = useCallback((cls: LogClass, text: string) => {
    setLog((prev) => [...prev, makeEntry(cls, text)]);
  }, []);

  const pushMany = useCallback((lines: Array<{ cls: LogClass; text: string }>) => {
    setLog((prev) => [...prev, ...lines.map(({ cls, text }) => makeEntry(cls, text))]);
  }, []);

  const openTerminal = useCallback(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    setOpen(true);
    if (!hasOpenedOnce) {
      setLog(BANNER.map(({ cls, text }) => makeEntry(cls, text)));
      setHasOpenedOnce(true);
    }
  }, [hasOpenedOnce]);

  const closeTerminal = useCallback(() => {
    setOpen(false);
    setInput('');
    setHistoryIdx(-1);
    if (previousFocus.current?.focus) {
      previousFocus.current.focus();
    }
  }, []);

  const fetchForkStatus = useCallback(async (): Promise<ForkRiskDataShape | null> => {
    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const dataUrl = baseUrl.endsWith('/')
        ? `${baseUrl}data/fork-risk.json`
        : `${baseUrl}/data/fork-risk.json`;
      const res = await fetch(dataUrl);
      if (!res.ok) return null;
      return (await res.json()) as ForkRiskDataShape;
    } catch {
      return null;
    }
  }, []);

  const runCommand = useCallback(
    async (raw: string) => {
      const cmd = raw.trim();
      push('cmd', `guest@augur:~$ ${cmd}`);
      if (!cmd) return;

      const lower = cmd.toLowerCase();
      const parts = cmd.split(/\s+/);

      if (lower === 'help') {
        pushMany(HELP_LINES.map((text) => ({ cls: 'out' as LogClass, text })));
        return;
      }

      if (lower === 'whoami') {
        push('out', 'anonymous_rep_holder@augur.net');
        return;
      }

      if (lower === 'fork status') {
        push('muted', 'fetching fork status...');
        const data = await fetchForkStatus();
        if (!data) {
          push('err', 'ERR: fork status unavailable');
          return;
        }
        const largest = data.metrics.disputeDetails?.[0];
        pushMany([
          { cls: 'out', text: `risk level       : ${data.riskLevel}` },
          { cls: 'out', text: `risk percent     : ${data.riskPercentage.toFixed(2)}%` },
          { cls: 'out', text: `fork threshold % : ${data.metrics.forkThresholdPercent.toFixed(2)}%` },
          { cls: 'out', text: `bond REP         : ${Math.round(data.metrics.largestDisputeBond).toLocaleString()}` },
          { cls: 'out', text: `dispute round    : ${largest?.disputeRound ?? 1}` },
          { cls: 'out', text: `market ID        : ${largest?.marketId ?? 'n/a'}` },
        ]);
        return;
      }

      if (parts[0].toLowerCase() === 'rep' && parts[1]?.toLowerCase() === 'balance') {
        const addr = parts[2];
        if (!addr) {
          push('warn', 'usage: rep balance <0x...address>');
          return;
        }
        if (!/^0x[0-9a-fA-F]+$/.test(addr)) {
          push('err', `invalid address: ${addr}`);
          return;
        }
        push('muted', 'fetching balance...');
        push('err', 'ERR: RPC not available in demo mode');
        return;
      }

      if (lower === 'migrate') {
        push('out', 'redirecting → https://6.augurfork.eth.limo/');
        window.setTimeout(() => {
          window.open('https://6.augurfork.eth.limo/', '_blank', 'noopener,noreferrer');
        }, 800);
        return;
      }

      if (lower === 'roadmap') {
        pushMany(ROADMAP_LINES.map((text) => ({ cls: 'out' as LogClass, text })));
        return;
      }

      if (lower === 'clear') {
        setLog([]);
        return;
      }

      if (lower === 'exit') {
        closeTerminal();
        return;
      }

      push('err', `augur: command not found: ${cmd}. Try 'help'.`);
    },
    [push, pushMany, fetchForkStatus, closeTerminal]
  );

  const submit = useCallback(() => {
    const raw = input;
    setInput('');
    setHistoryIdx(-1);
    if (raw.trim()) {
      setHistory((prev) => [...prev, raw]);
    }
    runCommand(raw);
  }, [input, runCommand]);

  // Глобальный слушатель клавиш для открытия терминала
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '~' && e.key !== '`') return;
      const active = document.activeElement;
      const tag = active?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((active as HTMLElement | null)?.isContentEditable) return;
      e.preventDefault();
      if (!open) openTerminal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, openTerminal]);

  // Фокус на input при открытии
  useEffect(() => {
    if (open) {
      // Даём React отрисовать overlay
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Прокрутка лога вниз при каждом добавлении строки
  useEffect(() => {
    if (open && log.length > 0) {
      logEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [log, open]);

  // ESC — закрыть, стрелки — история
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTerminal();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
        return;
      }
      if (e.key === 'ArrowUp') {
        if (history.length === 0) return;
        e.preventDefault();
        const nextIdx = historyIdx < 0 ? history.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(nextIdx);
        setInput(history[nextIdx] ?? '');
        return;
      }
      if (e.key === 'ArrowDown') {
        if (historyIdx < 0) return;
        e.preventDefault();
        const nextIdx = historyIdx + 1;
        if (nextIdx >= history.length) {
          setHistoryIdx(-1);
          setInput('');
        } else {
          setHistoryIdx(nextIdx);
          setInput(history[nextIdx] ?? '');
        }
      }
    },
    [closeTerminal, submit, history, historyIdx]
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Augur terminal"
      className="augur-terminal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          inputRef.current?.focus();
        }
      }}
    >
      <div className="augur-terminal-panel">
        <div className="augur-terminal-titlebar">
          <span>AUGUR TERMINAL v0.1.0</span>
          <span>[ESC to close]</span>
        </div>
        <div className="augur-terminal-log" aria-live="polite">
          {log.map((entry) => (
            <div key={entry.id} className={entry.cls}>
              {entry.text || '\u00A0'}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
        <div className="augur-terminal-prompt">
          <span className="cmd">guest@augur:~$&nbsp;</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            className="augur-terminal-input"
            aria-label="Terminal command input"
          />
        </div>
      </div>
    </div>
  );
};

export default Terminal;
