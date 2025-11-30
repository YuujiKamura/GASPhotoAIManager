import React, { useEffect, useRef, useState } from 'react';
import { Terminal, ChevronDown, Send, Loader2 } from 'lucide-react';
import { LogEntry } from '../types';

interface ConsolePanelProps {
  logs: LogEntry[];
  isOpen: boolean;
  isProcessing?: boolean;
  onToggle: () => void;
  onClear: () => void;
  onSendInstruction?: (instruction: string) => void;
}

const ConsolePanel: React.FC<ConsolePanelProps> = ({
  logs,
  isOpen,
  isProcessing = false,
  onToggle,
  onClear,
  onSendInstruction
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || !onSendInstruction) return;

    onSendInstruction(trimmed);
    setCommandHistory(prev => [trimmed, ...prev].slice(0, 50));
    setInputValue('');
    setHistoryIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputValue('');
      }
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 z-[150] bg-black/80 text-green-400 p-3 rounded-full shadow-xl hover:bg-black transition-all border border-green-900 flex items-center gap-2"
        title="Show API Console"
      >
        <Terminal className="w-5 h-5" />
        {logs.length > 0 && (
          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 rounded-full absolute -top-1 -right-1">
            {logs.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 w-full h-[25vh] z-[150] flex flex-col shadow-2xl animate-in slide-in-from-bottom-10 duration-300">
      <div className="bg-gray-900 text-gray-300 px-4 py-2 flex justify-between items-center border-t border-gray-700">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-green-500" />
          <span className="text-xs font-mono font-bold">AI CONSOLE</span>
          <span className="text-[10px] bg-gray-800 px-2 py-0.5 rounded text-gray-400">
            {logs.length} events
          </span>
          {isProcessing && (
            <span className="text-[10px] bg-amber-600 px-2 py-0.5 rounded text-white flex items-center gap-1 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" /> Processing...
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onClear} className="text-xs hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition-colors">
            Clear
          </button>
          <button onClick={onToggle} className="text-gray-400 hover:text-white">
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 bg-black/95 overflow-y-auto p-4 font-mono text-xs space-y-3 border-t border-gray-800"
      >
        {logs.length === 0 && (
          <div className="text-gray-600 italic">No logs yet. Type an instruction below to start...</div>
        )}

        {logs.map((log, index) => (
          <div key={index} className="flex gap-2 items-start border-l-2 border-transparent hover:bg-gray-900/50 p-1 rounded">
            <span className="text-gray-500 flex-shrink-0 select-none">[{log.timestamp}]</span>
            <div className="flex-1 break-all whitespace-pre-wrap">
              <span className={
                log.type === 'error' ? 'text-red-400 font-bold' :
                log.type === 'success' ? 'text-green-400' :
                log.type === 'json' ? 'text-blue-300' : 'text-gray-300'
              }>
                {log.message}
              </span>

              {log.details && (
                <div className="mt-1 bg-gray-900 p-2 rounded text-amber-100/90 overflow-x-auto border border-gray-800">
                  {typeof log.details === 'object'
                    ? JSON.stringify(log.details, null, 2)
                    : String(log.details)
                  }
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="bg-gray-900 border-t border-gray-700 px-4 py-2 flex gap-2 items-center">
        <span className="text-green-500 font-mono text-sm flex-shrink-0">$</span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="追加指示を入力... (例: 全部舗装打換え工にして)"
          className="flex-1 bg-transparent text-green-400 font-mono text-sm outline-none placeholder-gray-600"
          disabled={!onSendInstruction}
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || !onSendInstruction}
          className="p-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

export default ConsolePanel;
