import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface QuickCommand {
  label: string;
  command: string;
}

interface Props {
  repoPath: string;
  quickCommands?: QuickCommand[];
}

const DEFAULT_QUICK_COMMANDS: QuickCommand[] = [
  { label: '/tiq-workflow-generate-context', command: 'claude /tiq-workflow-generate-context' },
  { label: '/tiq-agent-architect', command: 'claude /tiq-agent-architect' },
  { label: '/tiq-agent-pm', command: 'claude /tiq-agent-pm' },
  { label: '/tiq-agent-dev', command: 'claude /tiq-agent-dev' },
];

export default function TerminalView({ repoPath, quickCommands = DEFAULT_QUICK_COMMANDS }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalIdRef = useRef<string | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let terminalId: string | null = null;
    let removeDataListener: (() => void) | null = null;
    let removeExitListener: (() => void) | null = null;

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

    // Create PTY in main process
    void window.tiqora.terminalCreate(repoPath).then((id) => {
      terminalId = id;
      terminalIdRef.current = id;

      // PTY output → xterm display
      removeDataListener = window.tiqora.onTerminalData((evt) => {
        if (evt.terminalId === id) term.write(evt.data);
      });

      // PTY exit notification
      removeExitListener = window.tiqora.onTerminalExit((evt) => {
        if (evt.terminalId === id) {
          term.writeln('\r\n\x1b[2m[Process exited with code ' + String(evt.code) + ']\x1b[0m');
        }
      });

      // User input → PTY
      term.onData((data) => void window.tiqora.terminalWrite(id, data));

      // Resize event → PTY
      term.onResize(({ cols, rows }) => void window.tiqora.terminalResize(id, cols, rows));
    });

    // Resize container → fit terminal
    const observer = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      removeDataListener?.();
      removeExitListener?.();
      if (terminalId) void window.tiqora.terminalDestroy(terminalId);
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
    if (id) void window.tiqora.terminalWrite(id, command + '\r');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117' }}>
      {/* Quick command bar */}
      {quickCommands.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 12px',
            borderBottom: '1px solid #21262d',
            background: '#161b22',
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 10, color: '#6e7681', whiteSpace: 'nowrap', marginRight: 4, flexShrink: 0 }}>
            Quick run:
          </span>
          {quickCommands.map((qc) => (
            <button
              key={qc.command}
              onClick={() => sendCommand(qc.command)}
              title={`Run: ${qc.command}`}
              style={quickCmdButton}
            >
              {qc.label}
            </button>
          ))}
        </div>
      )}

      {/* Terminal container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          padding: '6px 10px',
          overflow: 'hidden',
          minHeight: 0,
        }}
      />
    </div>
  );
}

const quickCmdButton: React.CSSProperties = {
  padding: '3px 9px',
  background: '#21262d',
  border: '1px solid #30363d',
  borderRadius: 2,
  color: '#8b949e',
  fontSize: 11,
  fontFamily: '"JetBrains Mono", monospace',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  transition: 'color 0.15s, border-color 0.15s',
};
