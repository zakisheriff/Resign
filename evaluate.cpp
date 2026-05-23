#include "evaluate.h"
#include "nnue/nnue.h"
#include <algorithm>

bool nnue_loaded = false;

// NNUE Piece Mapping
// nnue-probe expects: wking=1, wqueen=2, wrook=3, wbishop= 4, wknight= 5, wpawn= 6
//                     bking=7, bqueen=8, brook=9, bbishop=10, bknight=11, bpawn=12
const int NNUE_PIECE_MAP[15] = {
    0,  // NO_PIECE
    6,  // W_PAWN (1)
    5,  // W_KNIGHT (2)
    4,  // W_BISHOP (3)
    3,  // W_ROOK (4)
    2,  // W_QUEEN (5)
    1,  // W_KING (6)
    0, 0, // padding
    12, // B_PAWN (9)
    11, // B_KNIGHT (10)
    10, // B_BISHOP (11)
    9,  // B_ROOK (12)
    8,  // B_QUEEN (13)
    7   // B_KING (14)
};

// ============================================================================
// Evaluation Constants & Weights
// ============================================================================

// Tapered evaluation phase weights
const int PHASE_WEIGHT[PIECE_TYPE_NB] = {0, 1, 1, 2, 4, 0};
const int TOTAL_PHASE = 24;

// Base material values (midgame, endgame)
const int MG_MATERIAL[PIECE_TYPE_NB] = { 100, 320, 330, 500, 900, 0 };
const int EG_MATERIAL[PIECE_TYPE_NB] = { 120, 300, 330, 520, 900, 0 };

// Bonus for Bishop Pair
const int BISHOP_PAIR_MG = 30;
const int BISHOP_PAIR_EG = 50;

// Rook on Open / Semi-open files & 7th rank
const int ROOK_OPEN_FILE_MG = 20;
const int ROOK_OPEN_FILE_EG = 25;
const int ROOK_SEMI_OPEN_FILE_MG = 10;
const int ROOK_SEMI_OPEN_FILE_EG = 15;
const int ROOK_ON_7TH_MG = 25;
const int ROOK_ON_7TH_EG = 30;

// Pawn structure penalties
const int ISOLATED_PAWN_MG = -15;
const int ISOLATED_PAWN_EG = -25;
const int DOUBLED_PAWN_MG = -11;
const int DOUBLED_PAWN_EG = -20;

// Passed pawn bonuses per rank (1 to 8)
const int PASSED_PAWN_MG[8] = { 0, 5, 10, 20, 35, 60, 100, 0 };
const int PASSED_PAWN_EG[8] = { 0, 10, 25, 45, 75, 120, 180, 0 };

// Tempo bonus
const int TEMPO_BONUS = 15;

// Mobility weights (per pseudo-legal move)
const int MOBILITY_MG[PIECE_TYPE_NB] = { 0, 4, 5, 2, 1, 0 };
const int MOBILITY_EG[PIECE_TYPE_NB] = { 0, 4, 5, 4, 2, 0 };

// ============================================================================
// Piece-Square Tables (White perspective)
// ============================================================================

// Pawns
const int PST_MG_PAWN[64] = {
      0,   0,   0,   0,   0,   0,   0,   0,
     50,  50,  50,  50,  50,  50,  50,  50,
     10,  10,  20,  30,  30,  20,  10,  10,
      5,   5,  10,  25,  25,  10,   5,   5,
      0,   0,   0,  20,  20,   0,   0,   0,
      5,  -5, -10,   0,   0, -10,  -5,   5,
      5,  10,  10, -20, -20,  10,  10,   5,
      0,   0,   0,   0,   0,   0,   0,   0
};
const int PST_EG_PAWN[64] = {
      0,   0,   0,   0,   0,   0,   0,   0,
     80,  80,  80,  80,  80,  80,  80,  80,
     50,  50,  50,  50,  50,  50,  50,  50,
     30,  30,  30,  30,  30,  30,  30,  30,
     20,  20,  20,  20,  20,  20,  20,  20,
     10,  10,  10,  10,  10,  10,  10,  10,
      0,   0,   0,   0,   0,   0,   0,   0,
      0,   0,   0,   0,   0,   0,   0,   0
};

// Knights
const int PST_MG_KNIGHT[64] = {
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20,   0,   0,   0,   0, -20, -40,
    -30,   0,  10,  15,  15,  10,   0, -30,
    -30,   5,  15,  20,  20,  15,   5, -30,
    -30,   0,  15,  20,  20,  15,   0, -30,
    -30,   5,  10,  15,  15,  10,   5, -30,
    -40, -20,   0,   5,   5,   0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50
};
const int PST_EG_KNIGHT[64] = {
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20,   0,   0,   0,   0, -20, -40,
    -30,   0,  10,  15,  15,  10,   0, -30,
    -30,   5,  15,  20,  20,  15,   5, -30,
    -30,   0,  15,  20,  20,  15,   0, -30,
    -30,   5,  10,  15,  15,  10,   5, -30,
    -40, -20,   0,   5,   5,   0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50
};

// Bishops
const int PST_MG_BISHOP[64] = {
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,  10,  10,   5,   0, -10,
    -10,   5,   5,  10,  10,   5,   5, -10,
    -10,   0,  10,  10,  10,  10,   0, -10,
    -10,  10,  10,  10,  10,  10,  10, -10,
    -10,   5,   0,   0,   0,   0,   5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20
};
const int PST_EG_BISHOP[64] = {
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,  10,  10,   5,   0, -10,
    -10,   5,   5,  10,  10,   5,   5, -10,
    -10,   0,  10,  10,  10,  10,   0, -10,
    -10,  10,  10,  10,  10,  10,  10, -10,
    -10,   5,   0,   0,   0,   0,   5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20
};

// Rooks
const int PST_MG_ROOK[64] = {
      0,   0,   0,   0,   0,   0,   0,   0,
      5,  10,  10,  10,  10,  10,  10,   5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
      0,   0,   0,   5,   5,   0,   0,   0
};
const int PST_EG_ROOK[64] = {
      0,   0,   0,   0,   0,   0,   0,   0,
      5,  10,  10,  10,  10,  10,  10,   5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
      0,   0,   0,   5,   5,   0,   0,   0
};

// Queens
const int PST_MG_QUEEN[64] = {
    -20, -10, -10,  -5,  -5, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,   5,   5,   5,   0, -10,
     -5,   0,   5,   5,   5,   5,   0,  -5,
      0,   0,   5,   5,   5,   5,   0,  -5,
    -10,   5,   5,   5,   5,   5,   0, -10,
    -10,   0,   5,   0,   0,   0,   0, -10,
    -20, -10, -10,  -5,  -5, -10, -10, -20
};
const int PST_EG_QUEEN[64] = {
    -20, -10, -10,  -5,  -5, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,   5,   5,   5,   0, -10,
     -5,   0,   5,   5,   5,   5,   0,  -5,
      0,   0,   5,   5,   5,   5,   0,  -5,
    -10,   5,   5,   5,   5,   5,   0, -10,
    -10,   0,   5,   0,   0,   0,   0, -10,
    -20, -10, -10,  -5,  -5, -10, -10, -20
};

// King (Middle Game = King Safety oriented, End Game = Activity oriented)
const int PST_MG_KING[64] = {
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
     20,  20,   0,   0,   0,   0,  20,  20,
     20,  30,  10,   0,   0,  10,  30,  20
};
const int PST_EG_KING[64] = {
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10,   0,   0, -10, -20, -30,
    -30, -10,  20,  30,  30,  20, -10, -30,
    -30, -10,  30,  40,  40,  30, -10, -30,
    -30, -10,  30,  40,  40,  30, -10, -30,
    -30, -10,  20,  30,  30,  20, -10, -30,
    -30, -30,   0,   0,   0,   0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50
};

// Pointer arrays for easy indexing [PieceType]
const int* PST_MG[6] = { PST_MG_PAWN, PST_MG_KNIGHT, PST_MG_BISHOP, PST_MG_ROOK, PST_MG_QUEEN, PST_MG_KING };
const int* PST_EG[6] = { PST_EG_PAWN, PST_EG_KNIGHT, PST_EG_BISHOP, PST_EG_ROOK, PST_EG_QUEEN, PST_EG_KING };

// ============================================================================
// Helpers
// ============================================================================

inline Square flip(Square s) {
    return static_cast<Square>(s ^ 56);
}

// Get the pawn file mask
inline Bitboard file_mask(Square s) {
    return FileABB << (s % 8);
}

// Get adjacent files mask
inline Bitboard adjacent_files(Square s) {
    int f = s % 8;
    Bitboard mask = 0ULL;
    if (f > 0) mask |= FileABB << (f - 1);
    if (f < 7) mask |= FileABB << (f + 1);
    return mask;
}

// ============================================================================
// Evaluation function
// ============================================================================

Value evaluate(const Position& pos) {
    if (nnue_loaded) {
        int pieces[33];
        int squares[33];
        int p_idx = 2;
        
        // Kings must be first two elements
        pieces[0] = 1; // wking
        squares[0] = lsb(pos.pieces(WHITE, KING));
        
        pieces[1] = 7; // bking
        squares[1] = lsb(pos.pieces(BLACK, KING));
        
        // Populate other pieces
        Bitboard occ = pos.pieces() ^ pos.pieces(KING);
        while (occ) {
            Square s = pop_lsb_sq(occ);
            pieces[p_idx] = NNUE_PIECE_MAP[pos.piece_on(s)];
            squares[p_idx] = s;
            p_idx++;
        }
        pieces[p_idx] = 0; // Terminate array
        
        int player = pos.side_to_move() == WHITE ? 0 : 1;
        
        // We use incremental evaluate to get the massive speed boost
        const StateInfo* st = pos.state();
        NNUEdata* nnue_data[3] = {nullptr, nullptr, nullptr};
        
        if (st) {
            nnue_data[0] = const_cast<NNUEdata*>(&st->nnue);
            if (st->previous) {
                nnue_data[1] = const_cast<NNUEdata*>(&st->previous->nnue);
                if (st->previous->previous) {
                    nnue_data[2] = const_cast<NNUEdata*>(&st->previous->previous->nnue);
                }
            }
        }
        
        int score = nnue_evaluate_incremental(player, pieces, squares, nnue_data);
        
        // NNUE outputs in cp, return it directly. But wait, we need to adjust mate scores? 
        // We just return score as cp.
        return score;
    }

    int mg[2] = {0, 0};
    int eg[2] = {0, 0};
    int phase = 0;
    
    Bitboard pawns[2] = { pos.pieces(WHITE, PAWN), pos.pieces(BLACK, PAWN) };

    for (int c = 0; c < COLOR_NB; ++c) {
        Color us = static_cast<Color>(c);
        Color them = ~us;
        Bitboard our_pieces = pos.pieces(us);
        
        // Material and PST
        for (int pt = PAWN; pt <= KING; ++pt) {
            Bitboard pieces = pos.pieces(us, static_cast<PieceType>(pt));
            while (pieces) {
                Square s = pop_lsb_sq(pieces);
                
                mg[us] += MG_MATERIAL[pt];
                eg[us] += EG_MATERIAL[pt];
                
                Square pst_sq = (us == WHITE) ? s : flip(s);
                mg[us] += PST_MG[pt][pst_sq];
                eg[us] += PST_EG[pt][pst_sq];
                
                phase += PHASE_WEIGHT[pt];
                
                // Mobility
                if (pt != PAWN && pt != KING) {
                    Bitboard attacks = attacks_from(static_cast<PieceType>(pt), s, pos.pieces()) & ~our_pieces;
                    int mob = popcount(attacks);
                    mg[us] += mob * MOBILITY_MG[pt];
                    eg[us] += mob * MOBILITY_EG[pt];
                }
            }
        }
        
        // Bishop Pair
        if (popcount(pos.pieces(us, BISHOP)) >= 2) {
            mg[us] += BISHOP_PAIR_MG;
            eg[us] += BISHOP_PAIR_EG;
        }

        // Pawns
        Bitboard our_pawns = pawns[us];
        Bitboard their_pawns = pawns[them];
        
        Bitboard b = our_pawns;
        while (b) {
            Square s = pop_lsb_sq(b);
            int rank = s / 8;
            int rel_rank = (us == WHITE) ? rank : 7 - rank;
            Bitboard f_mask = file_mask(s);
            Bitboard adj_mask = adjacent_files(s);
            
            // Doubled
            if (our_pawns & f_mask & ((us == WHITE) ? ~((1ULL << (s + 1)) - 1) : ((1ULL << s) - 1))) {
                mg[us] += DOUBLED_PAWN_MG;
                eg[us] += DOUBLED_PAWN_EG;
            }
            
            // Isolated
            if ((our_pawns & adj_mask) == 0) {
                mg[us] += ISOLATED_PAWN_MG;
                eg[us] += ISOLATED_PAWN_EG;
            }
            
            // Passed
            Bitboard passed_mask = f_mask | adj_mask;
            passed_mask &= (us == WHITE) ? ~((1ULL << (s + 1)) - 1) : ((1ULL << s) - 1); // Ranks ahead
            if ((their_pawns & passed_mask) == 0) {
                mg[us] += PASSED_PAWN_MG[rel_rank];
                eg[us] += PASSED_PAWN_EG[rel_rank];
            }
        }
        
        // Rooks
        Bitboard rooks = pos.pieces(us, ROOK);
        while (rooks) {
            Square s = pop_lsb_sq(rooks);
            Bitboard f_mask = file_mask(s);
            if ((our_pawns & f_mask) == 0) {
                if ((their_pawns & f_mask) == 0) {
                    mg[us] += ROOK_OPEN_FILE_MG;
                    eg[us] += ROOK_OPEN_FILE_EG;
                } else {
                    mg[us] += ROOK_SEMI_OPEN_FILE_MG;
                    eg[us] += ROOK_SEMI_OPEN_FILE_EG;
                }
            }
            
            int rank = s / 8;
            int rel_rank = (us == WHITE) ? rank : 7 - rank;
            if (rel_rank == 6) {
                mg[us] += ROOK_ON_7TH_MG;
                eg[us] += ROOK_ON_7TH_EG;
            }
        }
        
        // King safety (basic: pawn shield in front of king)
        Square king_sq = lsb(pos.pieces(us, KING));
        Bitboard shield_mask = adjacent_files(king_sq) | file_mask(king_sq);
        shield_mask &= (us == WHITE) ? (Rank2BB | Rank3BB) : (Rank7BB | Rank6BB);
        if (popcount(our_pawns & shield_mask) < 2) {
            mg[us] -= 20; // Penalty for missing pawn shield
        }
    }
    
    // Tapered Eval Calculation
    if (phase > TOTAL_PHASE) phase = TOTAL_PHASE;
    int mg_score = mg[WHITE] - mg[BLACK];
    int eg_score = eg[WHITE] - eg[BLACK];
    
    int score = (mg_score * phase + eg_score * (TOTAL_PHASE - phase)) / TOTAL_PHASE;
    
    // Tempo bonus
    if (pos.side_to_move() == WHITE) score += TEMPO_BONUS;
    else score -= TEMPO_BONUS;
    
    return pos.side_to_move() == WHITE ? score : -score;
}
