'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Chess, Square, Move } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import {
  Play, Users, ChevronDown, ChevronUp, RotateCcw, Flag, Eye, SkipBack,
  ChevronLeft, ChevronRight, SkipForward, Settings, Sparkles, BookOpen,
  Check, ThumbsUp, CircleDot, AlertTriangle, HelpCircle, XCircle, Cpu,
  Zap, Infinity as InfinityIcon, Square as SquareIcon, Swords, BarChart3, X,
  Palette, Undo2, Redo2, Pause, PlayCircle
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
  const currentSearchIsPonderRef = useRef<boolean>(false);
  const searchInFlightRef = useRef<boolean>(false);
  const discardNextBestMoveRef = useRef<boolean>(false);

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

  useEffect(() => {
    evalScoreRef.current = evalScore;
  }, [evalScore]);

  useEffect(() => {
    moveHistoryRef.current = moveHistory;
  }, [moveHistory]);

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

  // Game mode: 'engine' | 'friend'
  const [gameMode, setGameMode] = useState<'engine' | 'friend'>('engine');
  // Board orientation: 'white' | 'black'
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');

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
    const clamped = Math.max(-1000, Math.min(1000, evalScore));
    return 50 + (clamped / 1000) * 45;
  }, [evalScore]);

  const evalLabel = useMemo(() => (Math.abs(evalScore) / 100).toFixed(1), [evalScore]);

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
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      // If we interrupt a background eval search, UCI engines often emit one last
      // bestmove for the old position. Discard that stale reply.
      if (searchInFlightRef.current && currentSearchIsPonderRef.current) {
        discardNextBestMoveRef.current = true;
      }

      // First, stop any current search
      ws.current.send('stop');
      
      // Update state/refs
      currentSearchFen.current = fenStr;
      isEngineTurnRef.current = forEngineMove;
      currentSearchIsPonderRef.current = !forEngineMove;
      searchInFlightRef.current = true;
      
      // Send new position
      ws.current.send(`position fen ${fenStr}`);
      
      if (forEngineMove) {
        engineThinking.current = true;
        setStatusText('RESIGN is thinking...');
        // Let engine search with moderate depth/time
        ws.current.send('go movetime 1000');
      } else {
        // Just ponder/evaluate the position while player is thinking
        engineThinking.current = false;
        const turn = gameRef.current.turn();
        setStatusText(turn === playerColor ? 'Your turn' : 'RESIGN is thinking...');
        // Search slightly deeper for evaluation
        ws.current.send('go depth 12');
      }
    }
  }, [playerColor]);

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
            ? Math.max(0, evalBefore - evalAfter)
            : Math.max(0, evalAfter - evalBefore);
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
            ? Math.max(0, evalBefore - evalAfter)
            : Math.max(0, evalAfter - evalBefore);
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
      socket.send('uci');
      socket.send('isready');
      socket.send('setoption name Threads value 1');
    };

    socket.onmessage = (event) => {
      const raw = event.data.toString();
      const lines = raw.split('\n').filter((l: string) => l.trim().length > 0);

      for (const line of lines) {
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
            const scoreVal = moves > 0 ? 9999 : -9999;
            const fromWhite = side === 'w' ? scoreVal : -scoreVal;

            const fenKey = currentSearchFen.current;
            evalMap.current[fenKey] = fromWhite;
            setEvalScore(fromWhite);
            updateMoveEvaluations(fenKey, fromWhite);
          }
        }

        if (line.startsWith('bestmove')) {
          if (discardNextBestMoveRef.current) {
            discardNextBestMoveRef.current = false;
            console.log('Discarded stale bestmove from interrupted ponder search:', line);
            continue;
          }

          const best = line.split(' ')[1]?.trim();
          if (best && best !== '0000' && best !== '(none)') {
            if (isEngineTurnRef.current) {
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
                    ? Math.max(0, evalBefore - evalAfter)
                    : Math.max(0, evalAfter - evalBefore);
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
                    analyzePosition(newFen, false);
                  }
                }
              } catch (e) {
                console.error('Engine move failed:', best, e);
                setStatusText('Engine move failed, retrying...');
                setTimeout(() => analyzePosition(gameRef.current.fen(), true), 150);
              }
            } else {
              console.log('Ignored bestmove from pondering search:', best);
            }
          }
          searchInFlightRef.current = false;
          engineThinking.current = false;
        }
      }
    };

    socket.onerror = (e) => console.error('WebSocket error:', e);
    socket.onclose = () => console.log('WebSocket closed');

    return () => socket.close();
  }, [playerColor, analyzePosition, updateMoveEvaluations]);

  // ===== Game end detection =====
  function endGame(result: string, sub: string) {
    setGameResult(result);
    setGameResultSub(sub);
    setShowEndModal(true);
    setGameStarted(false);
    stopTimer();
    engineThinking.current = false;
  }

  function checkGameEnd() {
    const g = gameRef.current;
    if (g.isCheckmate()) {
      const winner = g.turn() === 'w' ? 'Black' : 'White';
      endGame(`${winner} wins!`, 'by checkmate');
    } else if (g.isStalemate()) {
      endGame('Draw', 'by stalemate');
    } else if (g.isDraw()) {
      endGame('Draw', 'by insufficient material');
    } else if (g.isThreefoldRepetition()) {
      endGame('Draw', 'by repetition');
    } else if (g.isCheck()) {
      setStatusText(g.turn() === 'w' ? 'White is in check!' : 'Black is in check!');
    }
  }

  // ===== Move logic =====
  function showLegalMoves(square: string) {
    const moves = gameRef.current.moves({ square: square as Square, verbose: true });
    if (moves.length === 0) return {};
    const highlights: Record<string, React.CSSProperties> = {};
    for (const move of moves) {
      const isCapture = gameRef.current.get(move.to as Square);
      highlights[move.to] = {
        background: isCapture
          ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
          : 'radial-gradient(circle, rgba(0,0,0,.2) 25%, transparent 25%)',
        borderRadius: '50%',
      };
    }
    highlights[square] = { background: 'rgba(255, 255, 0, 0.4)' };
    return highlights;
  }

  function isPromotionMove(from: string, to: string) {
    const legalMoves = gameRef.current.moves({ square: from as Square, verbose: true }) as Move[];
    return legalMoves.some((move) => move.to === to && move.flags.includes('p'));
  }

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
      ? Math.max(0, evalBefore - evalAfter)
      : Math.max(0, evalAfter - evalBefore);

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

  const handlePieceDrag = useCallback(({ piece, square }: { isSparePiece: boolean; piece: any; square: string | null }) => {
    if (!square || !gameStarted || engineThinking.current || isPaused || pendingPromotion) return;
    if (gameMode === 'engine' && gameRef.current.turn() !== playerColor) return;
    setSelectedSquare(null);
    const moves = gameRef.current.moves({ square: square as Square, verbose: true });
    if (moves.length === 0) { setLegalMoveSquares({}); return; }
    const highlights: Record<string, React.CSSProperties> = {};
    for (const move of moves) {
      const isCapture = gameRef.current.get(move.to as Square);
      highlights[move.to] = {
        background: isCapture
          ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
          : 'radial-gradient(circle, rgba(0,0,0,.2) 25%, transparent 25%)',
        borderRadius: '50%',
      };
    }
    highlights[square] = { background: 'rgba(255, 255, 0, 0.4)' };
    setLegalMoveSquares(highlights);
  }, [gameStarted, playerColor, gameMode, isPaused, pendingPromotion]);

  const handleSquareClick = useCallback(({ piece, square }: { piece: any; square: string }) => {
    if (!gameStarted || engineThinking.current || gameRef.current.isGameOver() || isPaused || pendingPromotion) return;
    if (gameMode === 'engine' && gameRef.current.turn() !== playerColor) return;

    if (selectedSquare) {
      if (isPromotionMove(selectedSquare, square)) {
        const pieceToMove = gameRef.current.get(selectedSquare as Square);
        if (pieceToMove) {
          setPendingPromotion({ from: selectedSquare, to: square, color: pieceToMove.color });
          return;
        }
      }

      try {
        const move = gameRef.current.move({ from: selectedSquare, to: square });
        if (move) {
          setSelectedSquare(null);
          setLegalMoveSquares({});
          recordPlayerMove(move);
          return;
        }
      } catch { /* fall through */ }
    }

    const clickedPiece = gameRef.current.get(square as Square);
    if (clickedPiece && clickedPiece.color === gameRef.current.turn()) {
      setSelectedSquare(square);
      const moves = gameRef.current.moves({ square: square as Square, verbose: true });
      const highlights: Record<string, React.CSSProperties> = {};
      for (const move of moves) {
        const isCapture = gameRef.current.get(move.to as Square);
        highlights[move.to] = {
          background: isCapture
            ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
            : 'radial-gradient(circle, rgba(0,0,0,.2) 25%, transparent 25%)',
          borderRadius: '50%',
        };
      }
      highlights[square] = { background: 'rgba(255, 255, 0, 0.4)' };
      setLegalMoveSquares(highlights);
    } else {
      setSelectedSquare(null);
      setLegalMoveSquares({});
    }
  }, [gameStarted, selectedSquare, playerColor, evalScore, moveHistory, gameMode, isPaused, pendingPromotion]);

  const handlePieceDrop = useCallback(({ sourceSquare, targetSquare }: { piece: any; sourceSquare: string; targetSquare: string | null }) => {
    if (!gameStarted || !targetSquare || engineThinking.current || gameRef.current.isGameOver() || pendingPromotion) return false;
    if (gameMode === 'engine' && gameRef.current.turn() !== playerColor) return false;

    setSelectedSquare(null);
    setLegalMoveSquares({});

    if (isPromotionMove(sourceSquare, targetSquare)) {
      const pieceToMove = gameRef.current.get(sourceSquare as Square);
      if (pieceToMove) {
        setPendingPromotion({ from: sourceSquare, to: targetSquare, color: pieceToMove.color });
      }
      return false;
    }

    try {
      const move = gameRef.current.move({ from: sourceSquare, to: targetSquare });
      if (move) {
        recordPlayerMove(move);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [gameStarted, playerColor, evalScore, moveHistory, gameMode, pendingPromotion]);

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
      ws.current.send('stop');
      ws.current.send('ucinewgame');
      ws.current.send('isready');
    }
  }

  const startGame = useCallback((asColor: 'w' | 'b', mode: 'engine' | 'friend' = 'engine') => {
    resetEngine();
    gameRef.current = new Chess();
    setFen(gameRef.current.fen());
    setEngineLines([]);
    setEvalScore(30);
    setSelectedSquare(null);
    setLegalMoveSquares({});
    setPendingPromotion(null);
    setMoveHistory([]);
    setShowEndModal(false);
    setPanelTab('new');
    setReviewIndex(-1);
    setPlayerColor(asColor);
    setGameMode(mode);
    setBoardOrientation(asColor === 'w' ? 'white' : 'black');
    
    evalMap.current = {
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1': 30,
    };
    lastEvalRef.current = 30;

    const tc = TIME_CONTROLS[timeControlIdx];
    setWhiteTime(tc.seconds);
    setBlackTime(tc.seconds);

    setGameStarted(true);
    engineThinking.current = false;

    if (mode === 'engine') {
      if (asColor === 'w') {
        setStatusText('Your turn');
        setTimeout(() => analyzePosition(gameRef.current.fen(), false), 200);
      } else {
        setStatusText('RESIGN is thinking...');
        setTimeout(() => analyzePosition(gameRef.current.fen(), true), 200);
      }
    } else {
      setStatusText("White's turn");
      setTimeout(() => analyzePosition(gameRef.current.fen(), false), 200);
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
      totalCpLoss += m.cpLoss;
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
      totalCpLoss += m.cpLoss;
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

  return (
    <div className="chess-layout">
      {/* Board Area */}
      <div className="board-area">
        {/* Top Player Info (Black if orientation is White, White if orientation is Black) */}
        <div className="player-info">
          {boardOrientation === 'white' ? (
            // Top is Black
            <>
              <div className="player-profile">
                <div className="player-avatar">
                  {gameMode === 'engine' ? (
                    <div style={{ width: '100%', height: '100%', background: '#444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 'bold', color: '#aaa' }}>R</div>
                  ) : (
                    <img src="https://ui-avatars.com/api/?name=B&background=333&color=fff&bold=true&size=64" style={{ width: '100%', height: '100%' }} alt="avatar" />
                  )}
                </div>
                <span>{gameMode === 'engine' ? 'RESIGN v1.0 ' : 'Friend (Black) '}<span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', fontSize: 12 }}>{gameMode === 'engine' ? '(Engine)' : ''}</span></span>
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
                  {gameMode === 'engine' ? (
                    <div style={{ width: '100%', height: '100%', background: '#444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 'bold', color: '#aaa' }}>R</div>
                  ) : (
                    <img src="https://ui-avatars.com/api/?name=W&background=eee&color=000&bold=true&size=64" style={{ width: '100%', height: '100%' }} alt="avatar" />
                  )}
                </div>
                <span>{gameMode === 'engine' ? 'RESIGN v1.0 ' : 'Friend (White) '}<span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', fontSize: 12 }}>{gameMode === 'engine' ? '(Engine)' : ''}</span></span>
              </div>
              <div className={`player-clock ${isPlaying && gameRef.current.turn() === 'w' ? 'active-clock' : ''} ${whiteTime <= 0 ? 'timeout' : ''}`}>
                {noTimer ? '∞' : formatTime(whiteTime)}
              </div>
            </>
          )}
        </div>

        {/* Board + eval */}
        <div className="board-wrapper">
          <div className="eval-bar">
            <div className="eval-bar-fill" style={{ height: `${evalPercent}%` }} />
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
                squareStyles: legalMoveSquares,
                draggingPieceGhostStyle: { opacity: 0 },
                showNotation: true,
                allowDragging: gameStarted && !engineThinking.current && panelTab !== 'review' && !isPaused,
                animationDurationInMs: 200,
                onPieceDrop: handlePieceDrop,
                onPieceDrag: handlePieceDrag,
                onSquareMouseDown: handleSquareClick,
                onSquareClick: handleSquareClick,
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
                  <img src="https://ui-avatars.com/api/?name=Y&background=5b4fcf&color=fff&bold=true&size=64" style={{ width: '100%', height: '100%' }} alt="avatar" />
                </div>
                <span>{gameMode === 'engine' ? 'You ' : 'You (White) '}<span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', fontSize: 12 }}>{gameMode === 'engine' ? '(676)' : ''}</span></span>
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
                  <img src="https://ui-avatars.com/api/?name=Y&background=5b4fcf&color=fff&bold=true&size=64" style={{ width: '100%', height: '100%' }} alt="avatar" />
                </div>
                <span>{gameMode === 'engine' ? 'You ' : 'You (Black) '}<span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', fontSize: 12 }}>{gameMode === 'engine' ? '(676)' : ''}</span></span>
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
          <div className={`tab ${panelTab === 'review' ? 'active' : ''}`} onClick={() => { if (moveHistory.length > 0) { setPanelTab('review'); setReviewIndex(moveHistory.length - 1); goToMove(moveHistory.length - 1); } }}>
            <Eye size={16} /> Review
          </div>
          <div className={`tab ${panelTab === 'settings' ? 'active' : ''}`} onClick={() => setPanelTab('settings')}>
            <Palette size={16} /> Themes
          </div>
        </div>

        {panelTab === 'new' ? (
          <div className="panel-content">
            {/* Game Mode Selector */}
            <div className="game-mode-selector">
              <button className={`mode-tab ${gameMode === 'engine' ? 'active' : ''}`} onClick={() => setGameMode('engine')}>
                <Cpu size={14} /> vs RESIGN
              </button>
              <button className={`mode-tab ${gameMode === 'friend' ? 'active' : ''}`} onClick={() => setGameMode('friend')}>
                <Users size={14} /> Pass & Play
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

            {gameStarted ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
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
                <button className="btn-stop" onClick={() => {
                  if (window.confirm('Are you sure you want to stop the game?')) {
                    stopTimer();
                    setGameStarted(false);
                    setIsPaused(false);
                    engineThinking.current = false;
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
                      <RotateCcw size={16} color="#81b64c" /> Play as Black
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={() => startGame('w', 'friend')}>
                      <Swords size={20} /> Start Match
                    </button>
                  </>
                )}
              </>
            )}

            <button className="btn-secondary" onClick={() => { stopTimer(); setGameStarted(false); gameRef.current = new Chess(); setFen(gameRef.current.fen()); setEvalScore(30); setEngineLines([]); setMoveHistory([]); setPendingPromotion(null); setStatusText('Click "Start Game" to begin'); engineThinking.current = false; }}>
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
    </div>
  );
}
