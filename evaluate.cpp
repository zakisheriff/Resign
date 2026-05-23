#include "evaluate.h"
#include <algorithm>

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
