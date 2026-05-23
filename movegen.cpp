#include "movegen.h"
#include <iostream>

// ============================================================================
// Helpers
// ============================================================================

static void add_if_legal(MoveList& list, Move m, const Position& pos) {
    if (pos.is_legal(m)) {
        list.add(m);
    }
}

static void add_promotions(MoveList& list, Square from, Square to, const Position& pos) {
    Move m1(from, to, PROMOTION, QUEEN);
    Move m2(from, to, PROMOTION, ROOK);
    Move m3(from, to, PROMOTION, BISHOP);
    Move m4(from, to, PROMOTION, KNIGHT);
    
    if (pos.is_legal(m1)) list.add(m1);
    if (pos.is_legal(m2)) list.add(m2);
    if (pos.is_legal(m3)) list.add(m3);
    if (pos.is_legal(m4)) list.add(m4);
}

// ============================================================================
// Core Generator
// ============================================================================

template <bool CapturesOnly>
void generate_moves(const Position& pos, MoveList& list) {
    Color us = pos.side_to_move();
    Color them = ~us;
    Bitboard enemies = pos.pieces(them);
    Bitboard empty = ~pos.pieces();
    Bitboard target = CapturesOnly ? enemies : ~pos.pieces(us);

    // --- Pawns ---
    Bitboard pawns = pos.pieces(us, PAWN);
    Bitboard rank8 = (us == WHITE) ? Rank8BB : Rank1BB;
    Bitboard rank3 = (us == WHITE) ? Rank3BB : Rank6BB;

    // Pawn Pushes
    Bitboard single_push = (us == WHITE ? pawns << 8 : pawns >> 8) & empty;
    Bitboard double_push = (us == WHITE ? (single_push & rank3) << 8 : (single_push & rank3) >> 8) & empty;

    Bitboard push_prom = single_push & rank8;
    Bitboard push_norm = single_push & ~rank8;

    while (push_prom) {
        Square to = pop_lsb_sq(push_prom);
        Square from = us == WHITE ? to + SOUTH : to + NORTH;
        add_promotions(list, from, to, pos);
    }

    if (!CapturesOnly) {
        while (push_norm) {
            Square to = pop_lsb_sq(push_norm);
            Square from = us == WHITE ? to + SOUTH : to + NORTH;
            add_if_legal(list, Move(from, to, NORMAL), pos);
        }
        while (double_push) {
            Square to = pop_lsb_sq(double_push);
            Square from = us == WHITE ? to + SOUTH + SOUTH : to + NORTH + NORTH;
            add_if_legal(list, Move(from, to, NORMAL), pos);
        }
    }

    // Pawn Captures
    Bitboard cap_left = (us == WHITE ? (pawns & ~FileABB) << 7 : (pawns & ~FileABB) >> 9) & enemies;
    Bitboard cap_right = (us == WHITE ? (pawns & ~FileHBB) << 9 : (pawns & ~FileHBB) >> 7) & enemies;

    Bitboard cap_left_prom = cap_left & rank8;
    Bitboard cap_left_norm = cap_left & ~rank8;
    while (cap_left_prom) {
        Square to = pop_lsb_sq(cap_left_prom);
        Square from = us == WHITE ? to + SOUTH_EAST : to + NORTH_EAST;
        add_promotions(list, from, to, pos);
    }
    while (cap_left_norm) {
        Square to = pop_lsb_sq(cap_left_norm);
        Square from = us == WHITE ? to + SOUTH_EAST : to + NORTH_EAST;
        add_if_legal(list, Move(from, to, NORMAL), pos);
    }

    Bitboard cap_right_prom = cap_right & rank8;
    Bitboard cap_right_norm = cap_right & ~rank8;
    while (cap_right_prom) {
        Square to = pop_lsb_sq(cap_right_prom);
        Square from = us == WHITE ? to + SOUTH_WEST : to + NORTH_WEST;
        add_promotions(list, from, to, pos);
    }
    while (cap_right_norm) {
        Square to = pop_lsb_sq(cap_right_norm);
        Square from = us == WHITE ? to + SOUTH_WEST : to + NORTH_WEST;
        add_if_legal(list, Move(from, to, NORMAL), pos);
    }

    // En Passant
    if (pos.ep_square() != SQ_NONE) {
        Square ep = pos.ep_square();
        Bitboard attackers = pos.attackers_to(ep, us, pos.pieces()) & pawns;
        while (attackers) {
            Square from = pop_lsb_sq(attackers);
            add_if_legal(list, Move(from, ep, EN_PASSANT), pos);
        }
    }

    // --- Knights ---
    Bitboard knights = pos.pieces(us, KNIGHT);
    while (knights) {
        Square from = pop_lsb_sq(knights);
        Bitboard moves = attacks_from_knight(from) & target;
        while (moves) {
            Square to = pop_lsb_sq(moves);
            add_if_legal(list, Move(from, to, NORMAL), pos);
        }
    }

    // --- Bishops & Queens ---
    Bitboard bishops = pos.pieces(us, BISHOP) | pos.pieces(us, QUEEN);
    while (bishops) {
        Square from = pop_lsb_sq(bishops);
        Bitboard moves = attacks_from_bishop(from, pos.pieces()) & target;
        while (moves) {
            Square to = pop_lsb_sq(moves);
            add_if_legal(list, Move(from, to, NORMAL), pos);
        }
    }

    // --- Rooks & Queens ---
    Bitboard rooks = pos.pieces(us, ROOK) | pos.pieces(us, QUEEN);
    while (rooks) {
        Square from = pop_lsb_sq(rooks);
        Bitboard moves = attacks_from_rook(from, pos.pieces()) & target;
        while (moves) {
            Square to = pop_lsb_sq(moves);
            add_if_legal(list, Move(from, to, NORMAL), pos);
        }
    }

    // --- King ---
    Square king_sq = lsb(pos.pieces(us, KING));
    Bitboard king_moves = attacks_from_king(king_sq) & target;
    while (king_moves) {
        Square to = pop_lsb_sq(king_moves);
        add_if_legal(list, Move(king_sq, to, NORMAL), pos);
    }

    // --- Castling ---
    if (!CapturesOnly && !pos.is_in_check()) {
        if (us == WHITE) {
            if (pos.can_castle(WHITE_OO)) {
                if (pos.piece_on(SQ_F1) == NO_PIECE && pos.piece_on(SQ_G1) == NO_PIECE) {
                    add_if_legal(list, Move(SQ_E1, SQ_G1, CASTLING), pos);
                }
            }
            if (pos.can_castle(WHITE_OOO)) {
                if (pos.piece_on(SQ_D1) == NO_PIECE && pos.piece_on(SQ_C1) == NO_PIECE && pos.piece_on(SQ_B1) == NO_PIECE) {
                    add_if_legal(list, Move(SQ_E1, SQ_C1, CASTLING), pos);
                }
            }
        } else {
            if (pos.can_castle(BLACK_OO)) {
                if (pos.piece_on(SQ_F8) == NO_PIECE && pos.piece_on(SQ_G8) == NO_PIECE) {
                    add_if_legal(list, Move(SQ_E8, SQ_G8, CASTLING), pos);
                }
            }
            if (pos.can_castle(BLACK_OOO)) {
                if (pos.piece_on(SQ_D8) == NO_PIECE && pos.piece_on(SQ_C8) == NO_PIECE && pos.piece_on(SQ_B8) == NO_PIECE) {
                    add_if_legal(list, Move(SQ_E8, SQ_C8, CASTLING), pos);
                }
            }
        }
    }
}

void generate_all(const Position& pos, MoveList& list) {
    generate_moves<false>(pos, list);
}

void generate_captures(const Position& pos, MoveList& list) {
    generate_moves<true>(pos, list);
}

// ============================================================================
// Perft
// ============================================================================

uint64_t perft(Position& pos, int depth) {
    if (depth == 0) return 1;

    MoveList list;
    generate_all(pos, list);

    if (depth == 1) return list.size(); // Bulk counting optimization

    uint64_t nodes = 0;
    for (int i = 0; i < list.size(); i++) {
        StateInfo st;
        pos.do_move(list.moves[i], st);
        nodes += perft(pos, depth - 1);
        pos.undo_move(list.moves[i]);
    }
    return nodes;
}

void perft_divide(Position& pos, int depth) {
    if (depth == 0) return;
    
    MoveList list;
    generate_all(pos, list);
    
    uint64_t total_nodes = 0;
    for (int i = 0; i < list.size(); i++) {
        StateInfo st;
        Move m = list.moves[i];
        pos.do_move(m, st);
        uint64_t nodes = perft(pos, depth - 1);
        pos.undo_move(m);
        
        Square from = m.from();
        Square to = m.to();
        char promo = ' ';
        if (m.type() == PROMOTION) {
            if (m.promotion_piece() == QUEEN) promo = 'q';
            else if (m.promotion_piece() == ROOK) promo = 'r';
            else if (m.promotion_piece() == BISHOP) promo = 'b';
            else if (m.promotion_piece() == KNIGHT) promo = 'n';
        }
        
        std::cout << (char)('a' + (from % 8)) << (char)('1' + (from / 8))
                  << (char)('a' + (to % 8)) << (char)('1' + (to / 8));
        if (promo != ' ') std::cout << promo;
        
        std::cout << ": " << nodes << "\n";
        total_nodes += nodes;
    }
    std::cout << "\nTotal nodes: " << total_nodes << "\n";
}

// ============================================================================
// Main for testing
// ============================================================================
#ifdef TEST_MOVEGEN

int main() {
    init_bitboards();
    init_zobrist();
    
    Position pos;
    
    // Perft test 1: Start position
    pos.set_starting_position();
    std::cout << "Start Position perft(5): \n";
    // Target: perft(1) = 20, (2) = 400, (3) = 8902, (4) = 197281, (5) = 4865609
    for (int i = 1; i <= 5; i++) {
        std::cout << "perft(" << i << ") = " << perft(pos, i) << "\n";
    }
    
    // Perft test 2: Kiwipete
    std::cout << "\nKiwipete perft(4): \n";
    pos.set_fen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
    // Target: perft(1) = 48, perft(2) = 2039, perft(3) = 97862, perft(4) = 4085603
    for (int i = 1; i <= 4; i++) {
        std::cout << "perft(" << i << ") = " << perft(pos, i) << "\n";
    }

    return 0;
}

#endif
