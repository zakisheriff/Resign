'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Chess, Square, Move } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import {
  Play, Users, ChevronDown, ChevronUp, RotateCcw, Flag, Eye, SkipBack,
  ChevronLeft, ChevronRight, SkipForward, Settings, Sparkles, BookOpen,
  Check, ThumbsUp, CircleDot, AlertTriangle, HelpCircle, XCircle, Cpu,
  Zap, Infinity as InfinityIcon, Square as SquareIcon, Swords, BarChart3, X,
  Palette, Undo2, Redo2, Pause, PlayCircle, Crown
} from 'lucide-react';

// ===== Types =====
type MoveClassification = 'brilliant' | 'great' | 'best' | 'book' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';
type PromotionPiece = 'q' | 'r' | 'b' | 'n';

interface RecordedMove {
  moveNumber: number;
  san: string;
  from: string;
  to: string;
  promotion?: PromotionPiece;
  fen: string;            // position AFTER this move
  color: 'w' | 'b';
  evalBefore: number;     // centipawns from white's perspective
  evalAfter: number;
  cpLoss: number;
  classification: MoveClassification;
}

interface PendingPromotion {
  from: string;
  to: string;
  color: 'w' | 'b';
}

interface QueuedPreMove {
  from: string;
  to: string;
  promotion?: string;
}

type GameMode = 'engine' | 'friend' | 'duel';

const TIME_CONTROLS = [
  { label: '1 min (Bullet)', seconds: 60 },
  { label: '3 min (Blitz)', seconds: 180 },
  { label: '5 min (Blitz)', seconds: 300 },
  { label: '10 min (Rapid)', seconds: 600 },
  { label: '15 min (Rapid)', seconds: 900 },
  { label: '30 min (Classical)', seconds: 1800 },
  { label: 'No timer', seconds: 0 },
];

const BOARD_THEMES = [
  { name: 'Classic Green', light: '#EBECD0', dark: '#739552' },
  { name: 'Blue Ocean', light: '#DEE3E6', dark: '#8CA2AD' },
  { name: 'Brown Wood', light: '#F0D9B5', dark: '#B58863' },
  { name: 'Purple Haze', light: '#E8DAF5', dark: '#9B72CF' },
  { name: 'Dark Mode', light: '#4B4847', dark: '#2C2B29' },
  { name: 'Coral Reef', light: '#FFE4C9', dark: '#D77A5B' },
];

const PIECE_SETS = [
  { name: 'Neo', id: 'neo' },
  { name: 'Classic', id: 'classic' },
  { name: 'Wood', id: 'wood' },
  { name: 'Glass', id: 'glass' },
  { name: 'Metal', id: 'metal' },
  { name: 'Lolz', id: 'lolz' },
  { name: 'Neo Wood', id: 'neo_wood' },
];

const BOT_PRESETS = [
  { id: 'resign', category: 'adaptive', name: 'RESIGN', title: 'House Engine', elo: 6767, blurb: 'The homegrown engine. Fast, punchy, and always ready to scrap.', badge: 'R', portrait: 'RS', moveTimeMs: 1000, ponderDepth: 12, gradient: 'linear-gradient(135deg, #7f8f52, #39421f)' },
];

const BOT_CATEGORIES = [
  { id: 'adaptive', name: 'Engines', subtitle: 'Flexible training bots', accent: '#8bc34a', preview: 'AI' },
];

const CLASS_LABELS: Record<MoveClassification, { symbol: React.ReactNode; label: string }> = {
  brilliant:   { symbol: <Sparkles size={12}/>, label: 'Brilliant' },
  great:       { symbol: <ThumbsUp size={12}/>,  label: 'Great' },
  best:        { symbol: <Check size={12}/>,  label: 'Best' },
  book:        { symbol: <BookOpen size={12}/>, label: 'Book' },
  good:        { symbol: <CircleDot size={12}/>,  label: 'Good' },
  inaccuracy:  { symbol: <AlertTriangle size={12}/>, label: 'Inaccuracy' },
  mistake:     { symbol: <HelpCircle size={12}/>,  label: 'Mistake' },
  blunder:     { symbol: <XCircle size={12}/>, label: 'Blunder' },
};

function getActiveSide(fen: string): 'w' | 'b' {
  const parts = fen.split(' ');
  return (parts[1] === 'b') ? 'b' : 'w';
}

function getCpValue(score: number): number {
  if (score > 30000) return 2000;
  if (score < -30000) return -2000;
  return score;
}

function isDarkSquare(square: string): boolean {
  const file = square.charCodeAt(0) - 97; // 'a' is 97 -> 0
  const rank = parseInt(square[1], 10) - 1; // '1' is 0
  return (file + rank) % 2 === 0;
}

function getBadgeDetails(classification: MoveClassification) {
  switch (classification) {
    case 'brilliant':
      return { text: '!!', bg: '#12b2a6', fg: '#ffffff' };
    case 'great':
      return { text: '!', bg: '#1582b4', fg: '#ffffff' };
    case 'best':
      return { text: '✓', bg: '#769632', fg: '#ffffff' };
    case 'book':
      return { text: '📖', bg: '#a38463', fg: '#ffffff' };
    case 'good':
      return { text: '✓', bg: '#85a947', fg: '#ffffff' };
    case 'inaccuracy':
      return { text: '?!', bg: '#f1b427', fg: '#ffffff' };
    case 'mistake':
      return { text: '?', bg: '#e58c2a', fg: '#ffffff' };
    case 'blunder':
      return { text: '??', bg: '#ca3431', fg: '#ffffff' };
    default:
      return null;
  }
}

function classifyMove(cpLoss: number, moveIndex: number): MoveClassification {
  if (moveIndex < 6) return 'book';
  if (cpLoss < -50)  return 'brilliant';
  if (cpLoss <= 0)   return 'best';
  if (cpLoss <= 15)  return 'great';
  if (cpLoss <= 40)  return 'good';
  if (cpLoss <= 80)  return 'inaccuracy';
  if (cpLoss <= 200) return 'mistake';
  return 'blunder';
}

function getMoveExplanation(move: RecordedMove): string {
  const san = move.san;
  
  if (san.includes('#')) {
    return 'Delivers a stunning checkmate to win the game!';
  }
  if (san.includes('+')) {
    return 'Delivers a sharp check, forcing the opponent to defend their king.';
  }
  if (san === 'O-O' || san === 'O-O-O') {
    return 'Castles to protect the king and activate the rook.';
  }
  if (san.includes('=')) {
    return 'Promotes a pawn, creating a dominant new piece!';
  }
  
  let pieceName = 'pawn';
  let isPawn = true;
  if (san[0] === 'N') { pieceName = 'knight'; isPawn = false; }
  else if (san[0] === 'B') { pieceName = 'bishop'; isPawn = false; }
  else if (san[0] === 'R') { pieceName = 'rook'; isPawn = false; }
  else if (san[0] === 'Q') { pieceName = 'queen'; isPawn = false; }
  else if (san[0] === 'K') { pieceName = 'king'; isPawn = false; }

  const action = san.includes('x') ? 'captures an opponent piece' : 'moves';
  
  let desc = `The ${pieceName} ${action}`;
  
  if (isPawn) {
    if (san.includes('x')) {
      desc += ', opening up lines and contesting the center.';
    } else {
      desc += ', claiming space and controlling key squares.';
    }
  } else {
    if (san.includes('x')) {
      desc += ', eliminating a target and active defender.';
    } else {
      desc += ' to a more active and influential position.';
    }
  }
  
  if (move.classification === 'brilliant') {
    desc += ' A brilliant, unexpected choice that opens up winning paths!';
  } else if (move.classification === 'best') {
    desc += ' This is the most optimal move in this position.';
  } else if (move.classification === 'blunder') {
    desc += ' A severe blunder that gives the opponent a major opportunity.';
  } else if (move.classification === 'mistake') {
    desc += ' A mistake that compromises the position slightly.';
  }
  
  return desc;
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function isLogoBot(botId: string) {
  return botId === 'resign';
}

function getCheckedKingSquare(fen: string): string | null {
  try {
    const chess = new Chess(fen);
    if (!chess.isCheck()) return null;

    const sideToMove = chess.turn();
    const board = chess.board();

    for (let rank = 0; rank < board.length; rank++) {
      for (let file = 0; file < board[rank].length; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === 'k' && piece.color === sideToMove) {
          return `${'abcdefgh'[file]}${8 - rank}`;
        }
      }
    }
  } catch (_error) {
    return null;
  }

  return null;
}

// ===== Component =====
export default function ResignGUI() {
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(gameRef.current.fen());
  const [engineLines, setEngineLines] = useState<string[]>([]);
  const [evalScore, setEvalScore] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<Record<string, React.CSSProperties>>({});
  const [gameStarted, setGameStarted] = useState(false);
  const [statusText, setStatusText] = useState('Click "Start Game" to begin');
  const ws = useRef<WebSocket | null>(null);
  const engineThinking = useRef(false);

  // Timer state
  const [timeControlIdx, setTimeControlIdx] = useState(1); // default: 3 min
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [whiteTime, setWhiteTime] = useState(180);
  const [blackTime, setBlackTime] = useState(180);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Move history
  const [moveHistory, setMoveHistory] = useState<RecordedMove[]>([]);
  const [undoneMoves, setUndoneMoves] = useState<RecordedMove[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const lastEvalRef = useRef<number>(0); // start at standard 0.3 pawn advantage
  const evalScoreRef = useRef<number>(0);
  const moveHistoryRef = useRef<RecordedMove[]>([]);

  // Eval map to cache evaluations for FENs and dynamically resolve move classifications
  const evalMap = useRef<Record<string, number>>({
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1': 30,
  });
  const currentSearchFen = useRef<string>('');
  const isEngineTurnRef = useRef<boolean>(false);
  const searchInFlightRef = useRef<boolean>(false);
  const socketBufferRef = useRef('');

  // Game end modal
  const [showEndModal, setShowEndModal] = useState(false);
  const [gameResult, setGameResult] = useState('');
  const [gameResultSub, setGameResultSub] = useState('');

  // Review mode
  const [panelTab, setPanelTab] = useState<'new' | 'review' | 'settings'>('new');
  const [reviewIndex, setReviewIndex] = useState(-1); // -1 = starting position

  // Customization
  const [boardThemeIdx, setBoardThemeIdx] = useState(0);
  const [pieceSet, setPieceSet] = useState('neo');
  const [selectedBotId, setSelectedBotId] = useState('resign');
  const [selectedBotCategoryId, setSelectedBotCategoryId] = useState('adaptive');
  const [draggedSquare, setDraggedSquare] = useState<string | null>(null);
  const playerColorRef = useRef<'w' | 'b'>('w');
  const selectedBotRef = useRef(BOT_PRESETS[0]);
  const gameStartedRef = useRef(false);
  const gameModeRef = useRef<GameMode>('engine');
  const suppressSquareSelectionUntilRef = useRef(0);
  const duelActiveRef = useRef(false);
  const duelBusyRef = useRef(false);

  const [preMoves, setPreMoves] = useState<QueuedPreMove[]>([]);
  const preMovesRef = useRef<QueuedPreMove[]>([]);

  useEffect(() => {
    preMovesRef.current = preMoves;
  }, [preMoves]);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (preMovesRef.current.length > 0) {
        const boardContainer = document.querySelector('.board-container');
        if (boardContainer && !boardContainer.contains(e.target as Node)) {
          setPreMoves([]);
        }
      }
    };

    document.addEventListener('mousedown', handleGlobalClick);
    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
    };
  }, []);

  useEffect(() => {
    const clearDraggedSquare = () => {
      setDraggedSquare(null);
    };

    document.addEventListener('mouseup', clearDraggedSquare);
    document.addEventListener('touchend', clearDraggedSquare);

    return () => {
      document.removeEventListener('mouseup', clearDraggedSquare);
      document.removeEventListener('touchend', clearDraggedSquare);
    };
  }, []);

  useEffect(() => {
    evalScoreRef.current = evalScore;
  }, [evalScore]);

  useEffect(() => {
    moveHistoryRef.current = moveHistory;
  }, [moveHistory]);

  const selectedBot = useMemo(
    () => BOT_PRESETS.find((bot) => bot.id === selectedBotId) ?? BOT_PRESETS[0],
    [selectedBotId]
  );

  const botsByCategory = useMemo(
    () => BOT_CATEGORIES.map((category) => ({
      ...category,
      bots: BOT_PRESETS.filter((bot) => bot.category === category.id),
    })),
    []
  );

  const selectedBotCategory = useMemo(
    () => botsByCategory.find((category) => category.id === selectedBotCategoryId) ?? botsByCategory[0],
    [botsByCategory, selectedBotCategoryId]
  );

  useEffect(() => {
    const storedTheme = localStorage.getItem('boardThemeIdx');
    if (storedTheme !== null) setBoardThemeIdx(parseInt(storedTheme, 10));
    const storedPiece = localStorage.getItem('pieceSet');
    if (storedPiece !== null) setPieceSet(storedPiece);
  }, []);

  const changeBoardTheme = (idx: number) => {
    setBoardThemeIdx(idx);
    localStorage.setItem('boardThemeIdx', idx.toString());
  };

  const changePieceSet = (id: string) => {
    setPieceSet(id);
    localStorage.setItem('pieceSet', id);
  };

  // Which color the player is
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');

  // Game mode: 'engine' | 'friend' | 'duel'
  const [gameMode, setGameMode] = useState<GameMode>('engine');
  // Board orientation: 'white' | 'black'
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');

  useEffect(() => {
    playerColorRef.current = playerColor;
  }, [playerColor]);

  useEffect(() => {
    selectedBotRef.current = selectedBot;
  }, [selectedBot]);

  useEffect(() => {
    gameStartedRef.current = gameStarted;
  }, [gameStarted]);

  useEffect(() => {
    gameModeRef.current = gameMode;
  }, [gameMode]);

  // Chess.com pieces — wrapped in SVG for intrinsic dimensions
  const pieceRenderer = useMemo<Record<string, (props?: any) => React.JSX.Element>>(() => {
    const mapping: Record<string, string> = {
      wP: 'wp', wN: 'wn', wB: 'wb', wR: 'wr', wQ: 'wq', wK: 'wk',
      bP: 'bp', bN: 'bn', bB: 'bb', bR: 'br', bQ: 'bq', bK: 'bk',
    };
    const result: Record<string, (props?: any) => React.JSX.Element> = {};
    for (const [key, filename] of Object.entries(mapping)) {
      result[key] = (props?: any) => (
        <svg viewBox="0 0 150 150" width="100%" height="100%" style={props?.svgStyle} xmlns="http://www.w3.org/2000/svg">
          <image href={`https://images.chesscomfiles.com/chess-themes/pieces/${pieceSet}/150/${filename}.png`} width="150" height="150" />
        </svg>
      );
    }
    return result;
  }, [pieceSet]);

  // Eval bar
  const evalPercent = useMemo(() => {
    if (evalScore <= -30000) return 0;
    if (evalScore >= 30000) return 100;
    const clamped = Math.max(-1000, Math.min(1000, evalScore));
    return 50 + (clamped / 1000) * 50;
  }, [evalScore]);

  const evalLabel = useMemo(() => {
    if (Math.abs(evalScore) === 99999) {
      return 'M';
    }
    if (evalScore > 30000) {
      const plies = 31000 - evalScore;
      const moves = Math.ceil(plies / 2);
      return `M${Math.max(1, moves)}`;
    }
    if (evalScore < -30000) {
      const plies = 31000 + evalScore;
      const moves = Math.ceil(plies / 2);
      return `M${Math.max(1, moves)}`;
    }
    return (Math.abs(evalScore) / 100).toFixed(1);
  }, [evalScore]);
  const checkedKingSquare = useMemo(() => getCheckedKingSquare(fen), [fen]);
  const boardSquareStyles = useMemo(() => {
    const merged: Record<string, React.CSSProperties> = { ...legalMoveSquares };

    if (checkedKingSquare) {
      merged[checkedKingSquare] = {
        ...(merged[checkedKingSquare] ?? {}),
        background: 'rgba(220, 38, 38, 0.55)',
        boxShadow: 'inset 0 0 0 3px rgba(127, 29, 29, 0.75)',
      };
    }

    for (const queuedPreMove of preMoves) {
      merged[queuedPreMove.from] = {
        background: 'rgba(244, 63, 94, 0.4)',
        boxShadow: 'inset 0 0 0 2px rgba(244, 63, 94, 0.7)',
      };
      merged[queuedPreMove.to] = {
        background: 'rgba(244, 63, 94, 0.4)',
        boxShadow: 'inset 0 0 0 2px rgba(244, 63, 94, 0.7)',
      };
    }

    return merged;
  }, [legalMoveSquares, checkedKingSquare, preMoves]);

  // ===== Timer logic =====
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const tc = TIME_CONTROLS[timeControlIdx];
    if (tc.seconds === 0 || isPaused) return; // no timer or paused

    timerRef.current = setInterval(() => {
      const turn = gameRef.current.turn();
      if (turn === 'w') {
        setWhiteTime(prev => {
          if (prev <= 1) {
            endGame('Black wins on time!', 'White ran out of time');
            return 0;
          }
          return prev - 1;
        });
      } else {
        setBlackTime(prev => {
          if (prev <= 1) {
            endGame('White wins on time!', 'Black ran out of time');
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);
  }, [timeControlIdx]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ===== Engine communication =====
  const analyzePosition = useCallback((fenStr: string, forEngineMove: boolean) => {
    if (!forEngineMove) {
      currentSearchFen.current = fenStr;
      isEngineTurnRef.current = false;
      searchInFlightRef.current = false;
      engineThinking.current = false;
      const turn = gameRef.current.turn();
      setStatusText(turn === playerColorRef.current ? 'Your turn' : 'RESIGN is thinking...');
      return;
    }

    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      return;
    }

    if (
      searchInFlightRef.current &&
      isEngineTurnRef.current &&
      currentSearchFen.current === fenStr
    ) {
      return;
    }

    if (searchInFlightRef.current) {
      ws.current.send('stop');
    }

    currentSearchFen.current = fenStr;
    isEngineTurnRef.current = true;
    searchInFlightRef.current = true;
    engineThinking.current = true;
    setStatusText('RESIGN is thinking...');
    ws.current.send(`position fen ${fenStr}`);
    ws.current.send(`go movetime ${selectedBotRef.current.moveTimeMs}`);
  }, []);

  const isLegalEngineMove = useCallback((uciMove: string) => {
    if (uciMove.length < 4) return false;

    const from = uciMove.substring(0, 2);
    const to = uciMove.substring(2, 4);
    const promotion = uciMove.length >= 5 ? uciMove[4] : undefined;
    const piece = gameRef.current.get(from as Square);

    if (!piece || piece.color !== gameRef.current.turn()) {
      return false;
    }

    const legalMoves = gameRef.current.moves({ square: from as Square, verbose: true }) as Move[];
    return legalMoves.some((move) => move.to === to && (move.promotion ?? undefined) === promotion);
  }, []);

  const updateMoveEvaluations = useCallback((fenKey: string, score: number) => {
    setMoveHistory(prev => {
      let changed = false;
      const nextHistory = prev.map((move, idx) => {
        if (move.fen === fenKey) {
          const prevFen = idx === 0
            ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
            : prev[idx - 1].fen;
          const evalBefore = evalMap.current[prevFen] ?? 30;
          const evalAfter = score;
          const cpLoss = move.color === 'w'
            ? getCpValue(evalBefore) - getCpValue(evalAfter)
            : getCpValue(evalAfter) - getCpValue(evalBefore);
          const classification = classifyMove(cpLoss, idx);

          if (move.evalAfter !== evalAfter || move.evalBefore !== evalBefore || move.cpLoss !== cpLoss || move.classification !== classification) {
            changed = true;
            return {
              ...move,
              evalBefore,
              evalAfter,
              cpLoss,
              classification,
            };
          }
        }

        if (idx > 0 && prev[idx - 1].fen === fenKey) {
          const nextMove = move;
          const evalBefore = score;
          const evalAfter = nextMove.evalAfter;
          const cpLoss = nextMove.color === 'w'
            ? getCpValue(evalBefore) - getCpValue(evalAfter)
            : getCpValue(evalAfter) - getCpValue(evalBefore);
          const classification = classifyMove(cpLoss, idx);

          if (nextMove.evalBefore !== evalBefore || nextMove.cpLoss !== cpLoss || nextMove.classification !== classification) {
            changed = true;
            return {
              ...nextMove,
              evalBefore,
              cpLoss,
              classification,
            };
          }
        }

        return move;
      });

      return changed ? nextHistory : prev;
    });
  }, []);

  useEffect(() => {
    const isLocalHost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL ||
      (isLocalHost ? 'ws://localhost:3001' : 'wss://zakisheriff-resign-backend.hf.space');
    const socket = new WebSocket(wsUrl);
    ws.current = socket;

    socket.onopen = () => {
      socketBufferRef.current = '';
      searchInFlightRef.current = false;
      socket.send('uci');
      socket.send('isready');
      socket.send('setoption name Threads value 1');

      if (
        gameStartedRef.current &&
        gameModeRef.current === 'engine' &&
        engineThinking.current &&
        gameRef.current.turn() !== playerColorRef.current
      ) {
        setTimeout(() => analyzePosition(gameRef.current.fen(), true), 150);
      }

      if (gameStartedRef.current && gameModeRef.current === 'duel' && duelActiveRef.current) {
        setTimeout(() => requestNextDuelMove(), 150);
      }
    };

    socket.onmessage = (event) => {
      socketBufferRef.current += event.data.toString();
      const rawParts = socketBufferRef.current.split('\n');
      socketBufferRef.current = rawParts.pop() ?? '';
      const lines = rawParts.map((line) => line.trim()).filter((line) => line.length > 0);

      for (const line of lines) {
        if (line.startsWith('duelmove ')) {
          const [, , move] = line.split(/\s+/);
          duelBusyRef.current = false;
          if (duelActiveRef.current && move) {
            recordDuelMove(move);
          }
          continue;
        }

        if (line.startsWith('duelunavailable')) {
          duelBusyRef.current = false;
          duelActiveRef.current = false;
          setGameStarted(false);
          setStatusText('Stockfish duel is not available on this backend yet.');
          continue;
        }

        if (line.startsWith('duelerror ')) {
          duelBusyRef.current = false;
          duelActiveRef.current = false;
          setGameStarted(false);
          setStatusText(line.replace(/^duelerror\s+/, ''));
          continue;
        }

        if (line.startsWith('info depth')) {
          setEngineLines(prev => [...prev.slice(-5), line]);

          const cpMatch = line.match(/score cp (-?\d+)/);
          if (cpMatch) {
            const cp = parseInt(cpMatch[1], 10);
            const side = getActiveSide(currentSearchFen.current);
            const fromWhite = side === 'w' ? cp : -cp;
            
            const fenKey = currentSearchFen.current;
            evalMap.current[fenKey] = fromWhite;
            setEvalScore(fromWhite);
            updateMoveEvaluations(fenKey, fromWhite);
          }

          const mateMatch = line.match(/score mate (-?\d+)/);
          if (mateMatch) {
            const moves = parseInt(mateMatch[1], 10);
            const side = getActiveSide(currentSearchFen.current);
            let fromWhite = 0;
            if (moves > 0) {
              fromWhite = side === 'w' ? (31000 - moves * 2) : (-31000 + moves * 2);
            } else {
              fromWhite = side === 'w' ? (-31000 - moves * 2) : (31000 + moves * 2);
            }

            const fenKey = currentSearchFen.current;
            evalMap.current[fenKey] = fromWhite;
            setEvalScore(fromWhite);
            updateMoveEvaluations(fenKey, fromWhite);
          }
        }

        if (line.startsWith('bestmove')) {
          const best = line.split(' ')[1]?.trim();
          searchInFlightRef.current = false;
          engineThinking.current = false;

          if (best && best !== '0000' && best !== '(none)') {
            if (isEngineTurnRef.current) {
              if (!isLegalEngineMove(best)) {
                console.log('Ignored invalid or stale engine bestmove for current board:', best, gameRef.current.fen());
                continue;
              }

              try {
                const prevFen = gameRef.current.fen();
                const evalBefore = evalMap.current[prevFen] ?? lastEvalRef.current;
                const move = gameRef.current.move({
                  from: best.substring(0, 2),
                  to: best.substring(2, 4),
                  promotion: best.length >= 5 ? best[4] : undefined,
                });
                if (move) {
                  const evalAfter = evalScoreRef.current;
                  const movingColor = move.color;
                  const cpLoss = movingColor === 'w'
                    ? getCpValue(evalBefore) - getCpValue(evalAfter)
                    : getCpValue(evalAfter) - getCpValue(evalBefore);
                  const totalMoves = moveHistoryRef.current.length;
                  const newFen = gameRef.current.fen();

                  const recorded: RecordedMove = {
                    moveNumber: Math.floor(totalMoves / 2) + 1,
                    san: move.san,
                    from: move.from,
                    to: move.to,
                    promotion: move.promotion as PromotionPiece | undefined,
                    fen: newFen,
                    color: movingColor as 'w' | 'b',
                    evalBefore,
                    evalAfter,
                    cpLoss,
                    classification: classifyMove(cpLoss, totalMoves),
                  };

                  setMoveHistory(prev => [...prev, recorded]);
                  lastEvalRef.current = evalAfter;
                  setFen(newFen);
                  checkGameEnd();

                  // After engine makes its move, it is the player's turn. Start pondering!
                  if (!gameRef.current.isGameOver()) {
                    if (applyNextQueuedPreMove()) {
                      return;
                    }
                    analyzePosition(newFen, false);
                  }
                }
              } catch (e) {
                console.error('Engine move failed:', best, e);
                setStatusText('Engine move failed, retrying...');
                setTimeout(() => analyzePosition(gameRef.current.fen(), true), 150);
              }
            }
          }
        }
      }
    };

    socket.onerror = (e) => console.error('WebSocket error:', e);
    socket.onclose = () => {
      socketBufferRef.current = '';
      searchInFlightRef.current = false;
      console.log('WebSocket closed');
    };

    return () => {
      socket.close();
    };
  }, [analyzePosition, updateMoveEvaluations, isLegalEngineMove]);

  // ===== Game end detection =====
  function endGame(result: string, sub: string) {
    setGameResult(result);
    setGameResultSub(sub);
    setShowEndModal(true);
    setGameStarted(false);
    stopTimer();
    engineThinking.current = false;
    duelActiveRef.current = false;
    duelBusyRef.current = false;
    setPreMoves([]);
  }

  function checkGameEnd() {
    const g = gameRef.current;
    if (g.isCheckmate()) {
      const winner = g.turn() === 'w' ? 'Black' : 'White';
      setEvalScore(winner === 'White' ? 99999 : -99999);
      endGame(`${winner} wins!`, 'by checkmate');
    } else if (g.isStalemate()) {
      setEvalScore(0);
      endGame('Draw', 'by stalemate');
    } else if (g.isThreefoldRepetition()) {
      setEvalScore(0);
      endGame('Draw', 'by threefold repetition');
    } else if (g.isInsufficientMaterial()) {
      setEvalScore(0);
      endGame('Draw', 'by insufficient material');
    } else if (g.isDraw()) {
      setEvalScore(0);
      endGame('Draw', 'by 50-move rule');
    } else if (g.isCheck()) {
      if (gameMode === 'engine') {
        setStatusText(g.turn() === playerColor ? 'Your king is in check. Move the king or defend it.' : 'RESIGN is in check.');
      } else {
        setStatusText(g.turn() === 'w' ? 'White king is in check. Move the king or defend it.' : 'Black king is in check. Move the king or defend it.');
      }
    }
  }

  // ===== Move logic =====
  function buildHighlightsForMoves(square: string, moves: Move[]) {
    if (moves.length === 0) return {};
    const highlights: Record<string, React.CSSProperties> = {};
    for (const move of moves) {
      const isCapture = gameRef.current.get(move.to as Square);
      const moveStyle = {
        background: isCapture
          ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
          : 'radial-gradient(circle, rgba(0,0,0,.2) 25%, transparent 25%)',
        borderRadius: '50%',
      };
      highlights[move.to] = moveStyle;

      if (move.flags.includes('k') || move.flags.includes('q')) {
        const rookSquare = move.flags.includes('k') ? `h${square[1]}` : `a${square[1]}`;
        highlights[rookSquare] = moveStyle;
      }
    }
    highlights[square] = { background: 'rgba(255, 255, 0, 0.4)' };
    return highlights;
  }

  function showLegalMoves(square: string) {
    const moves = gameRef.current.moves({ square: square as Square, verbose: true }) as Move[];
    return buildHighlightsForMoves(square, moves);
  }

  function resolveCastleTargetSquare(from: string, to: string, legalMoves: Move[]) {
    const movingPiece = gameRef.current.get(from as Square);
    const targetPiece = gameRef.current.get(to as Square);

    if (!movingPiece || movingPiece.type !== 'k' || !targetPiece || targetPiece.type !== 'r') {
      return to;
    }

    if (movingPiece.color !== targetPiece.color || from[1] !== to[1]) {
      return to;
    }

    const castleTarget = to.charCodeAt(0) > from.charCodeAt(0)
      ? `g${from[1]}`
      : `c${from[1]}`;

    const isLegalCastle = legalMoves.some((move) =>
      move.to === castleTarget && (move.flags.includes('k') || move.flags.includes('q'))
    );

    return isLegalCastle ? castleTarget : to;
  }

  function getCheckWarningText() {
    if (gameMode === 'engine') {
      return 'Your king is in check. Move the king or defend it.';
    }

    return `${gameRef.current.turn() === 'w' ? 'White' : 'Black'} king is in check. Move the king or defend it.`;
  }

  function isPromotionMove(from: string, to: string) {
    const legalMoves = gameRef.current.moves({ square: from as Square, verbose: true }) as Move[];
    return legalMoves.some((move) => move.to === to && move.flags.includes('p'));
  }

  const getPlayerPseudoLegalMoves = useCallback((square: string) => {
    try {
      const fenParts = gameRef.current.fen().split(' ');
      fenParts[1] = playerColor;
      const tempChess = new Chess(fenParts.join(' '));
      return tempChess.moves({ square: square as Square, verbose: true }) as Move[];
    } catch {
      return [];
    }
  }, [playerColor]);

  function commitPromotion(piece: PromotionPiece) {
    if (!pendingPromotion || engineThinking.current || gameRef.current.isGameOver()) return;

    try {
      const move = gameRef.current.move({
        from: pendingPromotion.from,
        to: pendingPromotion.to,
        promotion: piece,
      });

      if (move) {
        setPendingPromotion(null);
        setSelectedSquare(null);
        setLegalMoveSquares({});
        recordPlayerMove(move);
      }
    } catch (error) {
      console.error('Promotion move failed:', error);
      setPendingPromotion(null);
    }
  }

  function cancelPromotion() {
    setPendingPromotion(null);
    setSelectedSquare(null);
    setLegalMoveSquares({});
  }

  function clearSelectionAndHighlights() {
    setSelectedSquare(null);
    setLegalMoveSquares({});
    setDraggedSquare(null);
  }

  function suppressNextSquareSelection() {
    suppressSquareSelectionUntilRef.current = Date.now() + 180;
  }

  function queuePreMove(move: QueuedPreMove) {
    setPreMoves((prev) => [...prev, move].slice(-8));
  }

  function recordPlayerMove(move: Move) {
    const prevFen = move.color === 'w' 
      ? gameRef.current.fen().replace(' b ', ' w ') // approximate predecessor if we don't have it
      : gameRef.current.fen().replace(' w ', ' b ');
    // In our case, the current position has already been updated, so let's just find the predecessor in history
    const totalMoves = moveHistory.length;
    const historyPrevFen = totalMoves === 0 
      ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      : moveHistory[totalMoves - 1].fen;
    
    const evalBefore = evalMap.current[historyPrevFen] ?? lastEvalRef.current;
    const evalAfter = evalScore; // initial eval, will be updated by the engine search
    const movingColor = move.color;
    const cpLoss = movingColor === 'w'
      ? getCpValue(evalBefore) - getCpValue(evalAfter)
      : getCpValue(evalAfter) - getCpValue(evalBefore);

    const recorded: RecordedMove = {
      moveNumber: Math.floor(totalMoves / 2) + 1,
      san: move.san,
      from: move.from,
      to: move.to,
      promotion: move.promotion as PromotionPiece | undefined,
      fen: gameRef.current.fen(),
      color: movingColor,
      evalBefore,
      evalAfter,
      cpLoss,
      classification: classifyMove(cpLoss, totalMoves),
    };

    setMoveHistory(prev => [...prev, recorded]);
    setUndoneMoves([]); // clear redo stack on new move
    lastEvalRef.current = evalAfter;
    setFen(gameRef.current.fen());
    checkGameEnd();

    if (!gameRef.current.isGameOver()) {
      if (gameMode === 'engine') {
        // Player has made their move. Start engine thinking for engine's move!
        analyzePosition(gameRef.current.fen(), true);
      } else {
        // Friend mode: just ponder to update the evaluation bar live
        analyzePosition(gameRef.current.fen(), false);
        setStatusText(gameRef.current.turn() === 'w' ? "White's turn" : "Black's turn");
      }
    }
  }

  function applyNextQueuedPreMove() {
    if (gameModeRef.current !== 'engine' || gameRef.current.turn() !== playerColorRef.current || gameRef.current.isGameOver()) {
      return false;
    }

    const queue = [...preMovesRef.current];
    while (queue.length > 0) {
      const nextMove = queue.shift()!;
      try {
        const move = gameRef.current.move({
          from: nextMove.from,
          to: nextMove.to,
          promotion: nextMove.promotion,
        });

        if (move) {
          setPreMoves(queue);
          suppressNextSquareSelection();
          recordPlayerMove(move);
          return true;
        }
      } catch (_error) {
        // Skip invalid queued moves and keep checking the rest.
      }
    }

    setPreMoves([]);
    return false;
  }

  function buildUciHistory() {
    return moveHistoryRef.current.map((move) => `${move.from}${move.to}${move.promotion ?? ''}`);
  }

  function requestNextDuelMove() {
    if (
      !duelActiveRef.current ||
      duelBusyRef.current ||
      !gameStartedRef.current ||
      isPaused ||
      gameRef.current.isGameOver() ||
      !ws.current ||
      ws.current.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    const engineId = gameRef.current.turn() === 'w' ? 'resign' : 'stockfish';
    duelBusyRef.current = true;
    setStatusText(`${engineId === 'resign' ? 'RESIGN' : 'Stockfish'} is thinking...`);
    ws.current.send(`__DUEL_MOVE__ ${engineId} 250 ${buildUciHistory().join(' ')}`.trim());
  }

  function recordDuelMove(uciMove: string) {
    try {
      const move = gameRef.current.move({
        from: uciMove.slice(0, 2),
        to: uciMove.slice(2, 4),
        promotion: uciMove.length > 4 ? uciMove[4] : undefined,
      });

      if (!move) {
        setStatusText(`Duel returned an illegal move: ${uciMove}`);
        duelActiveRef.current = false;
        setGameStarted(false);
        return;
      }

      const totalMoves = moveHistoryRef.current.length;
      const currentEval = evalScoreRef.current;
      const recorded: RecordedMove = {
        moveNumber: Math.floor(totalMoves / 2) + 1,
        san: move.san,
        from: move.from,
        to: move.to,
        promotion: move.promotion as PromotionPiece | undefined,
        fen: gameRef.current.fen(),
        color: move.color as 'w' | 'b',
        evalBefore: currentEval,
        evalAfter: currentEval,
        cpLoss: 0,
        classification: totalMoves < 12 ? 'book' : 'best',
      };

      setMoveHistory((prev) => [...prev, recorded]);
      setFen(gameRef.current.fen());
      checkGameEnd();

      if (!gameRef.current.isGameOver()) {
        setTimeout(() => requestNextDuelMove(), 250);
      } else {
        duelActiveRef.current = false;
      }
    } catch (error) {
      console.error('Duel move failed:', error);
      setStatusText('Engine duel failed.');
      duelActiveRef.current = false;
      setGameStarted(false);
    }
  }

  const isPlayerPromotionMove = useCallback((from: string, to: string) => {
    const pseudoMoves = getPlayerPseudoLegalMoves(from);
    return pseudoMoves.some((move) => move.to === to && move.flags.includes('p'));
  }, [getPlayerPseudoLegalMoves]);

  const handleCanDragPiece = useCallback(({ piece, square }: { isSparePiece: boolean; piece: any; square: string | null }) => {
    if (!square || !gameStartedRef.current || isPaused || pendingPromotion) return false;

    const turn = gameRef.current.turn();
    const currentGameMode = gameModeRef.current;
    const currentPlayerColor = playerColorRef.current;
    if (currentGameMode === 'duel') return false;
    const isPlayerTurn = currentGameMode === 'engine' ? turn === currentPlayerColor : true;

    if (currentGameMode === 'engine') {
      if (isPlayerTurn) {
        if (engineThinking.current) return false;
        const moves = gameRef.current.moves({ square: square as Square, verbose: true });
        return moves.length > 0;
      } else {
        // Engine's turn: allow dragging player's pieces for pre-moves
        const p = gameRef.current.get(square as Square);
        if (!p || p.color !== currentPlayerColor) return false;
        const pseudoMoves = getPlayerPseudoLegalMoves(square);
        return pseudoMoves.length > 0;
      }
    } else {
      const moves = gameRef.current.moves({ square: square as Square, verbose: true });
      return moves.length > 0;
    }
  }, [isPaused, pendingPromotion, getPlayerPseudoLegalMoves]);

  const handlePieceDrag = useCallback(({ piece, square }: { isSparePiece: boolean; piece: any; square: string | null }) => {
    if (!square || !gameStartedRef.current || isPaused || pendingPromotion) return;
    if (gameModeRef.current === 'duel') return;

    setDraggedSquare(square);

    const turn = gameRef.current.turn();
    const currentGameMode = gameModeRef.current;
    const currentPlayerColor = playerColorRef.current;
    const isPlayerTurn = currentGameMode === 'engine' ? turn === currentPlayerColor : true;

    if (currentGameMode === 'engine' && !isPlayerTurn) {
      // Engine's turn: dragging for pre-move
      setSelectedSquare(null);
      const moves = getPlayerPseudoLegalMoves(square);
      if (moves.length === 0) {
        setLegalMoveSquares({});
        return;
      }
      setLegalMoveSquares(buildHighlightsForMoves(square, moves));
      return;
    }

    if (currentGameMode === 'engine' && engineThinking.current) return;
    setSelectedSquare(null);
    const moves = gameRef.current.moves({ square: square as Square, verbose: true });
    if (moves.length === 0) {
      setLegalMoveSquares({});
      if (gameRef.current.isCheck()) {
        setStatusText(getCheckWarningText());
      }
      return;
    }
    setLegalMoveSquares(buildHighlightsForMoves(square, moves as Move[]));
  }, [isPaused, pendingPromotion, getPlayerPseudoLegalMoves]);

  const handleSquareClick = useCallback(({ piece, square }: { piece: any; square: string }) => {
    setDraggedSquare(null);
    if (!gameStartedRef.current || gameRef.current.isGameOver() || isPaused || pendingPromotion) return;
    if (gameModeRef.current === 'duel') return;
    if (Date.now() < suppressSquareSelectionUntilRef.current) return;

    const turn = gameRef.current.turn();
    const currentGameMode = gameModeRef.current;
    const currentPlayerColor = playerColorRef.current;
    const isPlayerTurn = currentGameMode === 'engine' ? turn === currentPlayerColor : true;

    if (currentGameMode === 'engine' && !isPlayerTurn) {
      // Engine's turn: pre-moving via clicks
      if (selectedSquare) {
        if (selectedSquare === square) {
          setSelectedSquare(null);
          setLegalMoveSquares({});
          return;
        }

        const pseudoMoves = getPlayerPseudoLegalMoves(selectedSquare);
        const resolvedTargetSquare = resolveCastleTargetSquare(selectedSquare, square, pseudoMoves);
        const matchedMove = pseudoMoves.find(m => m.to === resolvedTargetSquare);

        if (matchedMove) {
          const isPromotion = matchedMove.flags.includes('p');
          queuePreMove({
            from: selectedSquare,
            to: resolvedTargetSquare,
            promotion: isPromotion ? 'q' : undefined,
          });
          clearSelectionAndHighlights();
          return;
        }
      }

      // If clicked on one of player's pieces, select it and show legal destination squares
      const clickedPiece = gameRef.current.get(square as Square);
      if (clickedPiece && clickedPiece.color === currentPlayerColor) {
        setSelectedSquare(square);
        const moves = getPlayerPseudoLegalMoves(square);
        if (moves.length === 0) {
          setLegalMoveSquares({});
          return;
        }
        setLegalMoveSquares(buildHighlightsForMoves(square, moves));
      } else {
        // Clicked elsewhere on the board: cancel active preMove, selection, and highlights
        clearSelectionAndHighlights();
        setPreMoves([]);
      }
      return;
    }

    if (currentGameMode === 'engine' && engineThinking.current) return;
    if (selectedSquare) {
      if (selectedSquare === square) {
        setSelectedSquare(null);
        setLegalMoveSquares({});
        return;
      }

      const legalMoves = gameRef.current.moves({ square: selectedSquare as Square, verbose: true }) as Move[];
      const resolvedTargetSquare = resolveCastleTargetSquare(selectedSquare, square, legalMoves);

      if (isPromotionMove(selectedSquare, resolvedTargetSquare)) {
        const pieceToMove = gameRef.current.get(selectedSquare as Square);
        if (pieceToMove) {
          setPendingPromotion({ from: selectedSquare, to: resolvedTargetSquare, color: pieceToMove.color });
          return;
        }
      }

      try {
        const move = gameRef.current.move({ from: selectedSquare, to: resolvedTargetSquare });
        if (move) {
          clearSelectionAndHighlights();
          suppressNextSquareSelection();
          recordPlayerMove(move);
          return;
        }
      } catch { /* fall through */ }
    }

    const clickedPiece = gameRef.current.get(square as Square);
    if (clickedPiece && clickedPiece.color === gameRef.current.turn()) {
      setSelectedSquare(square);
      if (gameRef.current.moves({ square: square as Square, verbose: true }).length === 0) {
        setLegalMoveSquares({});
        if (gameRef.current.isCheck()) {
          setStatusText(getCheckWarningText());
        }
        return;
      }
      setLegalMoveSquares(showLegalMoves(square));
    } else {
      clearSelectionAndHighlights();
      if (gameRef.current.isCheck()) {
        setStatusText(getCheckWarningText());
      }
    }
  }, [selectedSquare, isPaused, pendingPromotion, getPlayerPseudoLegalMoves]);

  const handlePieceDrop = useCallback(({ sourceSquare, targetSquare }: { piece: any; sourceSquare: string; targetSquare: string | null }) => {
    setDraggedSquare(null);
    if (!gameStartedRef.current || !targetSquare || pendingPromotion) return false;
    if (gameModeRef.current === 'duel') return false;

    const turn = gameRef.current.turn();
    const currentGameMode = gameModeRef.current;
    const currentPlayerColor = playerColorRef.current;
    const isPlayerTurn = currentGameMode === 'engine' ? turn === currentPlayerColor : true;

    if (currentGameMode === 'engine' && !isPlayerTurn) {
      // Engine's turn: queuing a pre-move
      clearSelectionAndHighlights();

      const pseudoMoves = getPlayerPseudoLegalMoves(sourceSquare);
      const resolvedTargetSquare = resolveCastleTargetSquare(sourceSquare, targetSquare, pseudoMoves);
      const isPseudoLegal = pseudoMoves.some(m => m.to === resolvedTargetSquare);

      if (isPseudoLegal) {
        const isPromotion = pseudoMoves.some(m => m.to === resolvedTargetSquare && m.flags.includes('p'));
        queuePreMove({
          from: sourceSquare,
          to: resolvedTargetSquare,
          promotion: isPromotion ? 'q' : undefined,
        });
      }
      return false; // Always snap back visually for pre-moves!
    }

    if (engineThinking.current || gameRef.current.isGameOver()) return false;

    clearSelectionAndHighlights();

    const legalMoves = gameRef.current.moves({ square: sourceSquare as Square, verbose: true }) as Move[];
    const resolvedTargetSquare = resolveCastleTargetSquare(sourceSquare, targetSquare, legalMoves);

    if (isPromotionMove(sourceSquare, resolvedTargetSquare)) {
      const pieceToMove = gameRef.current.get(sourceSquare as Square);
      if (pieceToMove) {
        setPendingPromotion({ from: sourceSquare, to: resolvedTargetSquare, color: pieceToMove.color });
      }
      return false;
    }

    try {
      const move = gameRef.current.move({ from: sourceSquare, to: resolvedTargetSquare });
      if (move) {
        suppressNextSquareSelection();
        recordPlayerMove(move);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [pendingPromotion, getPlayerPseudoLegalMoves]);

  const handleRightClickSquare = useCallback(() => {
    setDraggedSquare(null);
    setPreMoves([]);
  }, []);

  const undoMove = useCallback(() => {
    if (moveHistory.length === 0 || engineThinking.current) return;
    
    let movesToUndo = 1;
    if (gameMode === 'engine') {
      movesToUndo = moveHistory.length >= 2 ? 2 : 1;
    }
    
    for (let i = 0; i < movesToUndo; i++) {
      gameRef.current.undo();
    }
    
    const removedMoves = moveHistory.slice(moveHistory.length - movesToUndo);
    setUndoneMoves(prev => [...prev, ...removedMoves.reverse()]);
    
    setMoveHistory(prev => prev.slice(0, prev.length - movesToUndo));
    const newFen = gameRef.current.fen();
    setFen(newFen);
    setSelectedSquare(null);
    setLegalMoveSquares({});
    
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send('stop');
    }

    if (!gameRef.current.isGameOver()) {
        analyzePosition(newFen, false);
        setStatusText(gameMode === 'engine' ? 'Your turn' : (gameRef.current.turn() === 'w' ? "White's turn" : "Black's turn"));
    }
  }, [moveHistory, gameMode, analyzePosition]);

  const redoMove = useCallback(() => {
    if (undoneMoves.length === 0 || engineThinking.current) return;
    
    let movesToRedo = 1;
    if (gameMode === 'engine') {
       movesToRedo = undoneMoves.length >= 2 ? 2 : 1;
    }

    const movesToApply: RecordedMove[] = [];
    const newUndone = [...undoneMoves];
    
    for (let i = 0; i < movesToRedo; i++) {
      const m = newUndone.pop()!;
      movesToApply.push(m);
      gameRef.current.move({ from: m.from, to: m.to, promotion: m.promotion });
    }
    
    setUndoneMoves(newUndone);
    setMoveHistory(prev => [...prev, ...movesToApply]);
    
    const newFen = gameRef.current.fen();
    setFen(newFen);
    setSelectedSquare(null);
    setLegalMoveSquares({});
    
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send('stop');
    }

    if (!gameRef.current.isGameOver()) {
        analyzePosition(newFen, false);
        setStatusText(gameMode === 'engine' ? 'Your turn' : (gameRef.current.turn() === 'w' ? "White's turn" : "Black's turn"));
    }
  }, [undoneMoves, gameMode, analyzePosition]);

  // ===== Game start =====
  function resetEngine() {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      if (searchInFlightRef.current) {
        ws.current.send('stop');
      }
      ws.current.send('ucinewgame');
      ws.current.send('isready');
      searchInFlightRef.current = false;
    }
  }

  const startGame = useCallback((asColor: 'w' | 'b', mode: GameMode = 'engine') => {
    resetEngine();
    gameRef.current = new Chess();
    gameStartedRef.current = true;
    playerColorRef.current = asColor;
    gameModeRef.current = mode;
    duelActiveRef.current = mode === 'duel';
    duelBusyRef.current = false;
    setFen(gameRef.current.fen());
    setEngineLines([]);
    setEvalScore(30);
    setSelectedSquare(null);
    setLegalMoveSquares({});
    setDraggedSquare(null);
    setPendingPromotion(null);
    setMoveHistory([]);
    setShowEndModal(false);
    setPanelTab('new');
    setReviewIndex(-1);
    setPlayerColor(asColor);
    setGameMode(mode);
    setBoardOrientation(mode === 'duel' ? 'white' : (asColor === 'w' ? 'white' : 'black'));
    setPreMoves([]);
    
    evalMap.current = {
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1': 30,
    };
    lastEvalRef.current = 30;

    const tc = TIME_CONTROLS[timeControlIdx];
    setWhiteTime(tc.seconds);
    setBlackTime(tc.seconds);

    setGameStarted(true);
    engineThinking.current = false;

    if (mode === 'duel') {
      setStatusText('RESIGN vs Stockfish');
      setTimeout(() => requestNextDuelMove(), 200);
    } else if (mode === 'engine') {
      if (asColor === 'w') {
        setStatusText('Your turn');
      } else {
        setStatusText('RESIGN is thinking...');
        setTimeout(() => analyzePosition(gameRef.current.fen(), true), 200);
      }
    } else {
      setStatusText("White's turn");
    }
  }, [timeControlIdx, analyzePosition]);
  useEffect(() => {
    if (gameStarted && TIME_CONTROLS[timeControlIdx].seconds > 0 && !isPaused) {
      startTimer();
    } else {
      stopTimer();
    }
    return () => stopTimer();
  }, [gameStarted, timeControlIdx, isPaused, startTimer, stopTimer]);

  useEffect(() => {
    if (gameStarted && gameMode === 'duel' && !isPaused) {
      requestNextDuelMove();
    }
  }, [gameStarted, gameMode, isPaused]);

  // ===== Review navigation =====
  function goToMove(idx: number) {
    if (idx < -1) idx = -1;
    if (idx >= moveHistory.length) idx = moveHistory.length - 1;
    setReviewIndex(idx);
    if (idx === -1) {
      setFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      setEvalScore(0);
    } else {
      setFen(moveHistory[idx].fen);
      setEvalScore(moveHistory[idx].evalAfter);
    }
  }

  // ===== Move stats for modal =====
  const moveStats = useMemo(() => {
    const playerMoves = moveHistory.filter(m => m.color === playerColor);
    const counts: Record<MoveClassification, number> = {
      brilliant: 0, great: 0, best: 0, book: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0,
    };
    const evaluatedMoves = playerMoves.filter(m => typeof m.cpLoss === 'number' && !isNaN(m.cpLoss));
    let totalCpLoss = 0;
    for (const m of playerMoves) {
      counts[m.classification]++;
    }
    for (const m of evaluatedMoves) {
      totalCpLoss += Math.max(0, m.cpLoss);
    }
    const accuracy = evaluatedMoves.length > 0
      ? Math.max(0, 100 - (totalCpLoss / evaluatedMoves.length) * 0.5)
      : 100;
    return { counts, accuracy: Math.min(100, accuracy) };
  }, [moveHistory, playerColor]);

  const engineStats = useMemo(() => {
    const engineColor = playerColor === 'w' ? 'b' : 'w';
    const engineMoves = moveHistory.filter(m => m.color === engineColor);
    const counts: Record<MoveClassification, number> = {
      brilliant: 0, great: 0, best: 0, book: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0,
    };
    const evaluatedMoves = engineMoves.filter(m => typeof m.cpLoss === 'number' && !isNaN(m.cpLoss));
    let totalCpLoss = 0;
    for (const m of engineMoves) {
      counts[m.classification]++;
    }
    for (const m of evaluatedMoves) {
      totalCpLoss += Math.max(0, m.cpLoss);
    }
    const accuracy = evaluatedMoves.length > 0
      ? Math.max(0, 100 - (totalCpLoss / evaluatedMoves.length) * 0.5)
      : 100;
    return { counts, accuracy: Math.min(100, accuracy) };
  }, [moveHistory, playerColor]);

  // Timer display
  const tc = TIME_CONTROLS[timeControlIdx];
  const noTimer = tc.seconds === 0;
  const isPlaying = gameStarted && !gameRef.current.isGameOver();

  const renderCustomSquare = useCallback((props: { piece: any; square: string; children?: React.ReactNode }) => {
    const { children, square } = props;
    const isDark = isDarkSquare(square);
    const defaultBg = isDark
      ? BOARD_THEMES[boardThemeIdx].dark
      : BOARD_THEMES[boardThemeIdx].light;

    const customStyle = boardSquareStyles[square] || {};

    const finalStyle: React.CSSProperties = {
      position: 'relative',
      width: '100%',
      height: '100%',
      backgroundColor: defaultBg,
      ...customStyle,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    };

    let badge = null;
    if (panelTab === 'review' && reviewIndex >= 0) {
      const currentMove = moveHistory[reviewIndex];
      if (currentMove && currentMove.to === square) {
        badge = getBadgeDetails(currentMove.classification);
      }
    }

    return (
      <div style={finalStyle}>
        {draggedSquare === square ? null : children}
        {badge && (
          <div
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              backgroundColor: badge.bg,
              color: badge.fg,
              borderRadius: '50%',
              width: '22px',
              height: '22px',
              fontSize: badge.text.length > 1 ? '10px' : '12px',
              fontWeight: '900',
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              border: '1.5px solid #fff',
              zIndex: 10,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {badge.text}
          </div>
        )}
      </div>
    );
  }, [boardThemeIdx, boardSquareStyles, draggedSquare, panelTab, reviewIndex, moveHistory]);

  return (
    <main className="chess-layout">
      <section className="sr-only" aria-label="About RESIGN Chess">
        <h1>RESIGN Chess lets you play chess online against RESIGN and custom bots.</h1>
        <p>
          Challenge engine-powered bots, pick blitz or rapid time controls, review moves,
          choose promotion pieces, and play pass-and-play chess directly in your browser.
        </p>
      </section>
      {/* Board Area */}
      <div className="board-area">
        {/* Top Player Info (Black if orientation is White, White if orientation is Black) */}
        <div className="player-info">
          {boardOrientation === 'white' ? (
            // Top is Black
            <>
              <div className="player-profile">
                <div className="player-avatar">
                  {gameMode === 'duel' ? (
                    <div style={{ width: '100%', height: '100%', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 'bold', color: '#f3f3f3' }}>SF</div>
                  ) : gameMode === 'engine' ? (
                    isLogoBot(selectedBot.id) ? (
                      <img src="/Logo.png" className="brand-logo-image" alt={`${selectedBot.name} logo`} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: '#444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold', color: '#aaa' }}>{selectedBot.badge}</div>
                    )
                  ) : (
                    <img src="/Logo.png" className="brand-logo-image" alt="RESIGN logo" />
                  )}
                </div>
                <span>{gameMode === 'duel' ? 'Stockfish ' : gameMode === 'engine' ? `${selectedBot.name} ` : 'Friend (Black) '}<span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', fontSize: 12 }}>{gameMode === 'engine' ? `(${selectedBot.elo})` : gameMode === 'duel' ? '(Engine)' : ''}</span></span>
              </div>
              <div className={`player-clock ${isPlaying && gameRef.current.turn() === 'b' ? 'active-clock' : ''} ${blackTime <= 0 ? 'timeout' : ''}`}>
                {noTimer ? '∞' : formatTime(blackTime)}
              </div>
            </>
          ) : (
            // Top is White
            <>
              <div className="player-profile">
                <div className="player-avatar">
                  {gameMode === 'duel' ? (
                    <img src="/Logo.png" className="brand-logo-image" alt="RESIGN logo" />
                  ) : gameMode === 'engine' ? (
                    isLogoBot(selectedBot.id) ? (
                      <img src="/Logo.png" className="brand-logo-image" alt={`${selectedBot.name} logo`} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: '#444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold', color: '#aaa' }}>{selectedBot.badge}</div>
                    )
                  ) : (
                    <img src="/Logo.png" className="brand-logo-image" alt="RESIGN logo" />
                  )}
                </div>
                <span>{gameMode === 'duel' ? 'RESIGN ' : gameMode === 'engine' ? `${selectedBot.name} ` : 'Friend (White) '}<span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', fontSize: 12 }}>{gameMode === 'engine' ? `(${selectedBot.elo})` : gameMode === 'duel' ? '(Engine)' : ''}</span></span>
              </div>
              <div className={`player-clock ${isPlaying && gameRef.current.turn() === 'w' ? 'active-clock' : ''} ${whiteTime <= 0 ? 'timeout' : ''}`}>
                {noTimer ? '∞' : formatTime(whiteTime)}
              </div>
            </>
          )}
        </div>

        {/* Board + eval */}
        <div className="board-wrapper">
          <div
            className="eval-bar"
            style={{ ['--eval-percent' as '--eval-percent']: `${evalPercent}%` } as React.CSSProperties}
          >
            <div className="eval-bar-fill" />
            {evalScore <= 0 && <div className="eval-bar-label top-label">{evalLabel}</div>}
            {evalScore > 0 && <div className="eval-bar-label bottom-label">{evalLabel}</div>}
          </div>
          <div className="board-container">
            <Chessboard
              options={{
                position: fen,
                pieces: pieceRenderer,
                boardOrientation: boardOrientation,
                darkSquareStyle: { backgroundColor: BOARD_THEMES[boardThemeIdx].dark },
                lightSquareStyle: { backgroundColor: BOARD_THEMES[boardThemeIdx].light },
                squareStyles: boardSquareStyles,
                showNotation: true,
                allowDragging: gameStarted && gameMode !== 'duel' && !isPaused && (
                  !engineThinking.current || 
                  (gameMode === 'engine' && gameRef.current.turn() !== playerColor)
                ),
                animationDurationInMs: 200,
                onPieceDrop: handlePieceDrop,
                onPieceDrag: handlePieceDrag,
                canDragPiece: handleCanDragPiece,
                onSquareMouseDown: handleSquareClick,
                onSquareClick: handleSquareClick,
                onSquareRightClick: handleRightClickSquare,
                squareRenderer: renderCustomSquare,
              }}
            />
          </div>
        </div>

        {/* Bottom Player Info (White if orientation is White, Black if orientation is Black) */}
        <div className="player-info">
          {boardOrientation === 'white' ? (
            // Bottom is White
            <>
              <div className="player-profile">
                <div className="player-avatar">
                  <img src="/Logo.png" className="brand-logo-image" alt="RESIGN logo" />
                </div>
                <span>{gameMode === 'duel' ? 'RESIGN ' : gameMode === 'engine' ? 'You ' : 'You (White) '}<span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', fontSize: 12 }}>{gameMode === 'engine' ? '(1000)' : gameMode === 'duel' ? '(Engine)' : ''}</span></span>
              </div>
              <div className={`player-clock ${isPlaying && gameRef.current.turn() === 'w' ? 'active-clock' : ''} ${whiteTime <= 0 ? 'timeout' : ''}`}>
                {noTimer ? '∞' : formatTime(whiteTime)}
              </div>
            </>
          ) : (
            // Bottom is Black
            <>
              <div className="player-profile">
                <div className="player-avatar">
                  <img src="/Logo.png" className="brand-logo-image" alt="RESIGN logo" />
                </div>
                <span>{gameMode === 'duel' ? 'Stockfish ' : gameMode === 'engine' ? 'You ' : 'You (Black) '}<span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', fontSize: 12 }}>{gameMode === 'engine' ? '(1000)' : gameMode === 'duel' ? '(Engine)' : ''}</span></span>
              </div>
              <div className={`player-clock ${isPlaying && gameRef.current.turn() === 'b' ? 'active-clock' : ''} ${blackTime <= 0 ? 'timeout' : ''}`}>
                {noTimer ? '∞' : formatTime(blackTime)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div className="panel">
        <div className="panel-tabs">
          <div className={`tab ${panelTab === 'new' ? 'active' : ''}`} onClick={() => { setPanelTab('new'); if (gameStarted) { setFen(gameRef.current.fen()); setReviewIndex(-1); } }}>
            <Play size={16} /> New Game
          </div>
          <div className={`tab ${panelTab === 'settings' ? 'active' : ''}`} onClick={() => setPanelTab('settings')}>
            <Palette size={16} /> Themes
          </div>
        </div>

        {panelTab === 'new' ? (
          <div className="panel-content">
            {!gameStarted && (
              <>
                {/* Game Mode Selector */}
                <div className="game-mode-selector">
                  <button className={`mode-tab ${gameMode === 'engine' ? 'active' : ''}`} onClick={() => setGameMode('engine')}>
                    <Cpu size={14} />
                    <span className="mode-tab-copy">
                      <span className="mode-tab-title">vs RESIGN</span>
                      <span className="mode-tab-subtitle">Play the house engine</span>
                    </span>
                  </button>
                  <button className={`mode-tab ${gameMode === 'friend' ? 'active' : ''}`} onClick={() => setGameMode('friend')}>
                    <Users size={14} />
                    <span className="mode-tab-copy">
                      <span className="mode-tab-title">Pass &amp; Play</span>
                      <span className="mode-tab-subtitle">Two humans, one board</span>
                    </span>
                  </button>
                  <button className={`mode-tab ${gameMode === 'duel' ? 'active' : ''}`} onClick={() => setGameMode('duel')}>
                    <Swords size={14} />
                    <span className="mode-tab-copy">
                      <span className="mode-tab-title">RESIGN vs Stockfish</span>
                      <span className="mode-tab-subtitle">Watch the engines fight</span>
                    </span>
                  </button>
                </div>

                {/* Time control */}
                <div style={{ position: 'relative' }}>
                  <button className="dropdown-btn" onClick={() => setShowTimeDropdown(!showTimeDropdown)}>
                    {tc.seconds === 0 ? <InfinityIcon size={14} /> : <Zap size={14} />} {tc.label} {showTimeDropdown ? <ChevronUp size={14} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={14} style={{ marginLeft: 'auto' }} />}
                  </button>
                  {showTimeDropdown && (
                    <div className="time-dropdown">
                      {TIME_CONTROLS.map((t, i) => (
                        <button key={i} className={`time-option ${i === timeControlIdx ? 'selected' : ''}`} onClick={() => { setTimeControlIdx(i); setShowTimeDropdown(false); }}>
                          {t.seconds === 0 ? <InfinityIcon size={14} /> : <Zap size={14} />} {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {gameStarted ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                {gameMode === 'duel' ? (
                  <button className="btn-secondary" style={{ justifyContent: 'center' }} onClick={() => setIsPaused(!isPaused)}>
                    {isPaused ? <><PlayCircle size={16} /> Resume Duel</> : <><Pause size={16} /> Pause Duel</>}
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={undoMove} disabled={moveHistory.length === 0 || engineThinking.current}>
                      <Undo2 size={16} />
                    </button>
                    <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={redoMove} disabled={undoneMoves.length === 0 || engineThinking.current}>
                      <Redo2 size={16} />
                    </button>
                    <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setIsPaused(!isPaused)}>
                      {isPaused ? <><PlayCircle size={16} /> Resume</> : <><Pause size={16} /> Pause</>}
                    </button>
                  </div>
                )}
                <button className="btn-stop" onClick={() => {
                  if (window.confirm('Are you sure you want to stop the game?')) {
                    stopTimer();
                    setGameStarted(false);
                    setIsPaused(false);
                    engineThinking.current = false;
                    duelActiveRef.current = false;
                    duelBusyRef.current = false;
                    setPreMoves([]);
                    setStatusText('Game stopped');
                    if (ws.current && ws.current.readyState === WebSocket.OPEN) ws.current.send('stop');
                  }
                }}>
                  <SquareIcon size={16} fill="currentColor" /> Stop Game
                </button>
                <button className="btn-secondary" style={{ justifyContent: 'center' }} onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}>
                  <RotateCcw size={16} /> Flip Board
                </button>
              </div>
            ) : (
              <>
                {gameMode === 'engine' ? (
                  <>
                    <button className="btn-primary" onClick={() => startGame('w', 'engine')}>
                      Play as White
                    </button>
                    <button className="btn-secondary" onClick={() => startGame('b', 'engine')}>
                      <Crown size={16} color="#f3f3f3" fill="#111111" /> Play as Black
                    </button>
                  </>
                ) : gameMode === 'duel' ? (
                  <button className="btn-primary btn-duel-launch" onClick={() => startGame('w', 'duel')}>
                    <span className="btn-duel-launch-icon"><Swords size={20} /></span>
                    <span className="btn-duel-launch-copy">
                      <strong>Watch RESIGN vs Stockfish</strong>
                      <span>Live engine duel</span>
                    </span>
                  </button>
                ) : (
                  <>
                    <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={() => startGame('w', 'friend')}>
                      <Swords size={20} /> Start Match
                    </button>
                  </>
                )}
              </>
            )}

            <button className="btn-secondary" onClick={() => { stopTimer(); setGameStarted(false); gameRef.current = new Chess(); setFen(gameRef.current.fen()); setEvalScore(30); setEngineLines([]); setMoveHistory([]); setPendingPromotion(null); setPreMoves([]); duelActiveRef.current = false; duelBusyRef.current = false; setStatusText('Click "Start Game" to begin'); engineThinking.current = false; }}>
              <Flag size={16} color="#e5a956" /> Reset
            </button>

            {/* Engine output */}
            <div className="engine-output">
              {engineLines.length === 0 ? 'Engine output...' : engineLines.map((line, i) => <div key={i}>{line}</div>)}
            </div>

            {/* Move list (compact) */}
            {moveHistory.length > 0 && (
              <div className="move-list" style={{ maxHeight: 160 }}>
                {moveHistory.map((m, i) => (
                  <div key={i} className="move-row">
                    {m.color === 'w' && <span className="move-number">{m.moveNumber}.</span>}
                    {m.color === 'b' && i === 0 && <span className="move-number">{m.moveNumber}...</span>}
                    {m.color === 'b' && i !== 0 && <span className="move-number"></span>}
                    <span className="move-san">{m.san}</span>
                    <span className={`move-class cls-${m.classification}`}>{CLASS_LABELS[m.classification].symbol}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : panelTab === 'review' ? (
          /* Review Tab */
          <div className="panel-content">
            <div className="nav-buttons">
              <button className="nav-btn" onClick={() => goToMove(-1)} disabled={reviewIndex <= -1}><SkipBack size={16} /></button>
              <button className="nav-btn" onClick={() => goToMove(reviewIndex - 1)} disabled={reviewIndex <= -1}><ChevronLeft size={16} /></button>
              <button className="nav-btn" onClick={() => goToMove(reviewIndex + 1)} disabled={reviewIndex >= moveHistory.length - 1}><ChevronRight size={16} /></button>
              <button className="nav-btn" onClick={() => goToMove(moveHistory.length - 1)} disabled={reviewIndex >= moveHistory.length - 1}><SkipForward size={16} /></button>
            </div>

            <div className="move-list">
              {moveHistory.map((m, i) => (
                <div key={i} className={`move-row ${i === reviewIndex ? 'active-move' : ''}`} onClick={() => goToMove(i)}>
                  {m.color === 'w' && <span className="move-number">{m.moveNumber}.</span>}
                  {m.color === 'b' && <span className="move-number"></span>}
                  <span className="move-san" style={{ cursor: 'pointer' }}>{m.san}</span>
                  <span className={`move-class cls-${m.classification}`}>{CLASS_LABELS[m.classification].symbol}</span>
                  <span className="move-eval">{(m.evalAfter / 100).toFixed(1)}</span>
                </div>
              ))}
            </div>

            {/* Coach's Analysis / Game Review Comment */}
            {reviewIndex !== -1 && moveHistory[reviewIndex] && (
              <div className="coach-comment-box">
                <div className="coach-header">
                  <span className={`move-class-badge cls-${moveHistory[reviewIndex].classification}`}>
                    {CLASS_LABELS[moveHistory[reviewIndex].classification].symbol} {CLASS_LABELS[moveHistory[reviewIndex].classification].label}
                  </span>
                  <span className="eval-change-badge">
                    {moveHistory[reviewIndex].cpLoss > 0
                      ? `-${(moveHistory[reviewIndex].cpLoss / 100).toFixed(2)}`
                      : moveHistory[reviewIndex].cpLoss < 0
                        ? `+${(Math.abs(moveHistory[reviewIndex].cpLoss) / 100).toFixed(2)}`
                        : '0.00'}
                  </span>
                </div>
                <div className="coach-text">
                  <strong>{moveHistory[reviewIndex].san}</strong>: {getMoveExplanation(moveHistory[reviewIndex])}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowEndModal(true)}>
                <BarChart3 size={16} /> Show Review
              </button>
              <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setPanelTab('new'); if (gameStarted) setFen(gameRef.current.fen()); setReviewIndex(-1); }}>
                <Play size={16} /> Back to Game
              </button>
            </div>
          </div>
        ) : panelTab === 'settings' ? (
          /* Settings Tab */
          <div className="panel-content">
            <div className="settings-section">
              <h3>Board Theme</h3>
              <div className="theme-grid">
                {BOARD_THEMES.map((theme, i) => (
                  <div key={i} className={`theme-swatch ${i === boardThemeIdx ? 'active' : ''}`} onClick={() => changeBoardTheme(i)}>
                    <div className="theme-swatch-colors">
                      <div className="theme-swatch-light" style={{ backgroundColor: theme.light }}></div>
                      <div className="theme-swatch-dark" style={{ backgroundColor: theme.dark }}></div>
                    </div>
                    <div className="theme-swatch-name">{theme.name}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <h3>Piece Set</h3>
              <div className="piece-set-scroll">
                {PIECE_SETS.map((set) => (
                  <div key={set.id} className={`piece-set-option ${set.id === pieceSet ? 'active' : ''}`} onClick={() => changePieceSet(set.id)}>
                    <img src={`https://images.chesscomfiles.com/chess-themes/pieces/${set.id}/150/wk.png`} alt={set.name} />
                    <div className="piece-set-name">{set.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="status-label">{statusText}</div>
      </div>

      {/* ===== Game End Modal ===== */}
      {showEndModal && (
        <div className="modal-overlay" onClick={() => setShowEndModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowEndModal(false)}><X size={20} /></button>
            <h2>{gameResult}</h2>
            <div className="result-sub">{gameResultSub}</div>

            <div className="accuracy-row">
              <div className="accuracy-item">
                <div className="accuracy-pct">{moveStats.accuracy.toFixed(1)}%</div>
                <div className="accuracy-label">Your Accuracy</div>
              </div>
              <div className="accuracy-item">
                <div className="accuracy-pct" style={{ color: '#e58c2a' }}>{engineStats.accuracy.toFixed(1)}%</div>
                <div className="accuracy-label">Engine Accuracy</div>
              </div>
            </div>

            <table className="review-stats-table">
              <thead>
                <tr>
                  <th>Move Type</th>
                  <th>You</th>
                  <th>RESIGN</th>
                </tr>
              </thead>
              <tbody>
                {(['brilliant', 'great', 'best', 'book', 'good', 'inaccuracy', 'mistake', 'blunder'] as MoveClassification[]).map(cls => (
                  <tr className="review-stats-row" key={cls}>
                    <td className="review-stats-cell label-cell">
                      <span className="review-stats-symbol">{CLASS_LABELS[cls].symbol}</span>
                      <span>{CLASS_LABELS[cls].label}</span>
                    </td>
                    <td className={`review-stats-cell review-stats-count cls-${cls}`}>
                      {moveStats.counts[cls]}
                    </td>
                    <td className={`review-stats-cell review-stats-count cls-${cls}`}>
                      {engineStats.counts[cls]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="modal-buttons">
              <button className="btn-secondary" onClick={() => { setShowEndModal(false); setPanelTab('review'); setReviewIndex(moveHistory.length - 1); goToMove(moveHistory.length - 1); }}>
                <Eye size={16} /> Review Game
              </button>
              <button className="btn-primary" style={{ fontSize: 16, padding: 12 }} onClick={() => { setShowEndModal(false); startGame(playerColor); }}>
                New Game
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingPromotion && (
        <div className="promotion-overlay" onClick={cancelPromotion}>
          <div className="promotion-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Choose promotion</h3>
            <div className="promotion-grid">
              {(['q', 'r', 'b', 'n'] as PromotionPiece[]).map((piece) => (
                <button
                  key={piece}
                  className="promotion-piece-btn"
                  onClick={() => commitPromotion(piece)}
                  type="button"
                >
                  <img
                    src={`https://images.chesscomfiles.com/chess-themes/pieces/${pieceSet}/150/${pendingPromotion.color}${piece}.png`}
                    alt={`Promote to ${piece}`}
                  />
                </button>
              ))}
            </div>
            <button className="promotion-cancel" onClick={cancelPromotion} type="button">
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
