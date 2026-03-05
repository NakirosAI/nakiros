import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useIpcListener } from '../hooks/useIpcListener';

interface QuickCommand {
  label: string;
  command: string;
}

interface Props {
  repoPath: string;
  quickCommands?: QuickCommand[];
}

const DEFAULT_QUICK_COMMANDS: QuickCommand[] = [
  { label: '/nak-workflow-generate-context', command: 'claude /nak-workflow-generate-context' },
  { label: '/nak-agent-architect', command: 'claude /nak-agent-architect' },
  { label: '/nak-agent-pm', command: 'claude /nak-agent-pm' },
  { label: '/nak-agent-dev', command: 'claude /nak-agent-dev' },
];

export default function TerminalView({ repoPath, quickCommands = DEFAULT_QUICK_COMMANDS }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalIdRef = useRef<string | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useIpcListener(window.nakiros.onTerminalData, (evt) => {
    if (evt.terminalId !== terminalIdRef.current) return;
    termRef.current?.write(evt.data);
  });

  useIpcListener(window.nakiros.onTerminalExit, (evt) => {
    if (evt.terminalId !== terminalIdRef.current) return;
    termRef.current?.writeln(`\r\n\x1b[2m[Process exited with code ${String(evt.code)}]\x1b[0m`);
  });

  useEffect(() => {
    if (!containerRef.current) return;

    let terminalId: string | null = null;

    const term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#7c3aed',
        selectionBackground: '#3d1f8a55',
        black: '#0d1117',
        brightBlack: '#6e7681',
        red: '#ff7b72',
        brightRed: '#ffa198',
        green: '#3fb950',
        brightGreen: '#56d364',
        yellow: '#d29922',
        brightYellow: '#e3b341',
        blue: '#58a6ff',
        brightBlue: '#79c0ff',
        magenta: '#bc8cff',
        brightMagenta: '#d2a8ff',
        cyan: '#39c5cf',
        brightCyan: '#56d4dd',
        white: '#b1bac4',
        brightWhite: '#f0f6fc',
      },
      fontFamily: '"JetBrains Mono", "Cascadia Code", Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    setTimeout(() => fitAddon.fit(), 0);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    void window.nakiros.terminalCreate(repoPath).then((id) => {
      terminalId = id;
      terminalIdRef.current = id;

      term.onData((data) => void window.nakiros.terminalWrite(id, data));
      term.onResize(({ cols, rows }) => void window.nakiros.terminalResize(id, cols, rows));
    });

    const observer = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (terminalId) void window.nakiros.terminalDestroy(terminalId);
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      terminalIdRef.current = null;
    };
  // Recreate terminal when repo changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath]);

  function sendCommand(command: string) {
    const id = terminalIdRef.current;
    if (id) void window.nakiros.terminalWrite(id, command + '\r');
  }

  return (
    <div className="flex h-full flex-col bg-[#0d1117]">
      {quickCommands.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[#21262d] bg-[#161b22] px-3 py-[7px]">
          <span className="mr-1 shrink-0 whitespace-nowrap text-[10px] text-[#6e7681]">
            Quick run:
          </span>
          {quickCommands.map((qc) => (
            <button
              key={qc.command}
              onClick={() => sendCommand(qc.command)}
              title={`Run: ${qc.command}`}
              className="shrink-0 whitespace-nowrap rounded-[10px] border border-[#30363d] bg-[#21262d] px-[9px] py-[3px] font-mono text-[11px] text-[#8b949e]"
            >
              {qc.label}
            </button>
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-hidden px-[10px] py-1.5"
      />
    </div>
  );
}
