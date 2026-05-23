#include "movepick.h"
#include <algorithm>

// ============================================================================
// Global Heuristics Tables
// ============================================================================

int history_table[COLOR_NB][SQUARE_NB][SQUARE_NB];
Move killer_table[MAX_PLY][2];

void clear_history() {
    for (int c = 0; c < COLOR_NB; ++c) {
        for (int i = 0; i < SQUARE_NB; ++i) {
            for (int j = 0; j < SQUARE_NB; ++j) {
                history_table[c][i][j] = 0;
            }
        }
    }
    for (int i = 0; i < MAX_PLY; ++i) {
        killer_table[i][0] = Move();
        killer_table[i][1] = Move();
    }
}

void update_history(Color c, Move m, int bonus) {
    int& hist = history_table[c][m.from()][m.to()];
    hist += bonus;
    if (hist > 4000000) hist = 4000000;
    if (hist < -4000000) hist = -4000000;
}

void update_killers(Move m, int ply) {
    if (m != killer_table[ply][0]) {
        killer_table[ply][1] = killer_table[ply][0];
        killer_table[ply][0] = m;
    }
}

// ============================================================================
// Static Exchange Evaluation (SEE)
// ============================================================================

static Square get_lva(const Position& pos, Square sq, Color c, Bitboard occ, PieceType& pt) {
    // Mask with `occ` so that captured pieces (removed from occ) are ignored
    Bitboard attackers = pos.attackers_to(sq, c, occ) & occ;
    
    Bitboard pawns = attackers & pos.pieces(c, PAWN);
    if (pawns) { pt = PAWN; return lsb(pawns); }
    
    Bitboard knights = attackers & pos.pieces(c, KNIGHT);
    if (knights) { pt = KNIGHT; return lsb(knights); }
    
    Bitboard bishops = attackers & pos.pieces(c, BISHOP);
    if (bishops) { pt = BISHOP; return lsb(bishops); }
    
    Bitboard rooks = attackers & pos.pieces(c, ROOK);
    if (rooks) { pt = ROOK; return lsb(rooks); }
    
    Bitboard queens = attackers & pos.pieces(c, QUEEN);
    if (queens) { pt = QUEEN; return lsb(queens); }
    
    Bitboard kings = attackers & pos.pieces(c, KING);
    if (kings) { pt = KING; return lsb(kings); }
    
    pt = NO_PIECE_TYPE;
    return SQ_NONE;
}

bool see_ge(const Position& pos, Move m, int threshold) {
    if (m.type() != NORMAL && m.type() != PROMOTION) return threshold <= 0;
    
    Square from = m.from();
    Square to = m.to();
    
    int swap_list[32];
    int n = 0;
    
    PieceType target_pt = type_of_piece(pos.piece_on(to));
    PieceType attacker_pt = type_of_piece(pos.piece_on(from));
    
    if (m.type() == PROMOTION) attacker_pt = m.promotion_piece();
    
    swap_list[0] = PIECE_VALUE[target_pt];
    int current_val = PIECE_VALUE[attacker_pt];
    
    Bitboard occ = pos.pieces() ^ square_bb(from);
    Color stm = ~pos.side_to_move();
    
    while (true) {
        n++;
        PieceType pt;
        Square lva_sq = get_lva(pos, to, stm, occ, pt);
        if (lva_sq == SQ_NONE) break;
        
        swap_list[n] = current_val - swap_list[n - 1];
        current_val = PIECE_VALUE[pt];
        occ ^= square_bb(lva_sq);
        stm = ~stm;
    }
    
    while (--n) {
        swap_list[n - 1] = std::min(-swap_list[n], swap_list[n - 1]);
    }
    
    return swap_list[0] >= threshold;
}

// ============================================================================
// MovePicker Implementation
// ============================================================================

MovePicker::MovePicker(const Position& pos, Move hash_move, int ply, Move counter_move)
    : pos(pos), hash_move(hash_move), counter_move(counter_move), ply(ply), stage(STAGE_HASH), quiescence(false),
      num_moves(0), current_index(0), num_bad_captures(0), current_bad_capture(0) {
}

MovePicker::MovePicker(const Position& pos, Move hash_move)
    : pos(pos), hash_move(hash_move), counter_move(Move()), ply(0), stage(STAGE_HASH), quiescence(true),
      num_moves(0), current_index(0), num_bad_captures(0), current_bad_capture(0) {
}

int MovePicker::mvv_lva(Move m) const {
    PieceType attacker = type_of_piece(pos.piece_on(m.from()));
    PieceType victim = type_of_piece(pos.piece_on(m.to()));
    if (m.type() == EN_PASSANT) victim = PAWN;
    
    int score = PIECE_VALUE[victim] * 10 - PIECE_VALUE[attacker];
    
    if (m.type() == PROMOTION) {
        score += PIECE_VALUE[m.promotion_piece()] * 10;
    }
    
    return score;
}

void MovePicker::score_captures() {
    for (int i = 0; i < num_moves; ++i) {
        moves[i].score = SCORE_GOOD_CAPTURE + mvv_lva(moves[i].move);
    }
}

void MovePicker::score_quiets() {
    Color us = pos.side_to_move();
    for (int i = 0; i < num_moves; ++i) {
        Move m = moves[i].move;
        int score = SCORE_HISTORY_BASE + history_table[us][m.from()][m.to()];
        if (m == counter_move) score += SCORE_COUNTER;
        moves[i].score = score;
    }
}

Move MovePicker::pick_best() {
    if (current_index >= num_moves) return Move();
    
    int best_score = -2000000000;
    int best_index = current_index;
    for (int i = current_index; i < num_moves; ++i) {
        if (moves[i].score > best_score) {
            best_score = moves[i].score;
            best_index = i;
        }
    }
    
    ScoredMove temp = moves[current_index];
    moves[current_index] = moves[best_index];
    moves[best_index] = temp;
    
    return moves[current_index++].move;
}

Move MovePicker::next_move() {
    Move m;
    while (true) {
        switch (stage) {
            case STAGE_HASH:
                stage = STAGE_GEN_CAPTURES;
                if (hash_move.is_ok() && pos.is_legal(hash_move)) {
                    return hash_move;
                }
                break;
                
            case STAGE_GEN_CAPTURES:
                {
                    MoveList list;
                    generate_captures(pos, list);
                    for (int i = 0; i < list.size(); i++) {
                        if (list.moves[i] != hash_move) {
                            moves[num_moves++] = ScoredMove(list.moves[i], 0);
                        }
                    }
                    score_captures();
                }
                stage = STAGE_GOOD_CAPTURES;
                // fall through
                
            case STAGE_GOOD_CAPTURES:
                m = pick_best();
                if (m.is_ok()) {
                    if (see_ge(pos, m, 0)) {
                        return m;
                    } else {
                        bad_captures[num_bad_captures++] = m;
                    }
                } else {
                    if (quiescence) {
                        return Move();
                    }
                    stage = STAGE_KILLER_1;
                }
                break;
                
            case STAGE_KILLER_1:
                stage = STAGE_KILLER_2;
                m = killer_table[ply][0];
                if (m.is_ok() && m != hash_move && !pos.piece_on(m.to()) && pos.is_legal(m)) {
                    return m;
                }
                break;
                
            case STAGE_KILLER_2:
                stage = STAGE_GEN_QUIETS;
                m = killer_table[ply][1];
                if (m.is_ok() && m != hash_move && !pos.piece_on(m.to()) && pos.is_legal(m)) {
                    return m;
                }
                break;
                
            case STAGE_GEN_QUIETS:
                {
                    MoveList list;
                    generate_all(pos, list);
                    num_moves = 0;
                    current_index = 0;
                    for (int i = 0; i < list.size(); i++) {
                        Move cand = list.moves[i];
                        if (cand != hash_move && cand != killer_table[ply][0] && cand != killer_table[ply][1]) {
                            // Filter for quiet moves
                            if (pos.piece_on(cand.to()) == NO_PIECE && cand.type() != PROMOTION && cand.type() != EN_PASSANT) {
                                moves[num_moves++] = ScoredMove(cand, 0);
                            }
                        }
                    }
                    score_quiets();
                }
                stage = STAGE_QUIETS;
                // fall through
                
            case STAGE_QUIETS:
                m = pick_best();
                if (m.is_ok()) {
                    return m;
                }
                stage = STAGE_BAD_CAPTURES;
                // fall through
                
            case STAGE_BAD_CAPTURES:
                if (current_bad_capture < num_bad_captures) {
                    return bad_captures[current_bad_capture++];
                }
                return Move();
        }
    }
}
