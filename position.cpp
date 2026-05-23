#include "position.h"
#include <sstream>
#include <iostream>
#include <cctype>

// ============================================================================
// Initialization & Board Setup
// ============================================================================

Position::Position() {
    st = &start_state;
    for (int i = 0; i < SQUARE_NB; ++i) board[i] = NO_PIECE;
    for (int i = 0; i < PIECE_TYPE_NB + 1; ++i) byType[i] = 0ULL;
    for (int i = 0; i < COLOR_NB; ++i) byColor[i] = 0ULL;
    st->zobrist_key = 0ULL;
    st->captured_piece = NO_PIECE;
    st->castling_rights = NO_CASTLING;
    st->ep_square = SQ_NONE;
    st->half_move_clock = 0;
    st->full_move_number = 1;
    st->previous = nullptr;
    stm = WHITE;
}

void Position::put_piece(Piece p, Square s) {
    board[s] = p;
    Color c = type_of_color(p);
    PieceType pt = type_of_piece(p);
    set_bit(byType[pt], s);
    set_bit(byColor[c], s);
    set_bit(byType[PIECE_TYPE_NB], s);
}

void Position::remove_piece(Square s) {
    Piece p = board[s];
    if (p == NO_PIECE) return;
    Color c = type_of_color(p);
    PieceType pt = type_of_piece(p);
    clear_bit(byType[pt], s);
    clear_bit(byColor[c], s);
    clear_bit(byType[PIECE_TYPE_NB], s);
    board[s] = NO_PIECE;
}

void Position::move_piece(Square from, Square to) {
    Piece p = board[from];
    remove_piece(from);
    put_piece(p, to);
}

// ============================================================================
// FEN Parsing and Export
// ============================================================================

void Position::set_fen(const std::string& fen) {
    // Clear the board
    for (int i = 0; i < SQUARE_NB; ++i) board[i] = NO_PIECE;
    for (int i = 0; i < PIECE_TYPE_NB + 1; ++i) byType[i] = 0ULL;
    for (int i = 0; i < COLOR_NB; ++i) byColor[i] = 0ULL;
    
    st = &start_state;
    st->previous = nullptr;
    st->castling_rights = NO_CASTLING;
    st->ep_square = SQ_NONE;
    st->half_move_clock = 0;
    st->full_move_number = 1;

    std::istringstream iss(fen);
    std::string placement, side, castling, en_passant, half_moves, full_moves;
    iss >> placement >> side >> castling >> en_passant >> half_moves >> full_moves;

    int file = 0, rank = 7;
    for (char c : placement) {
        if (std::isdigit(c)) {
            file += c - '0';
        } else if (c == '/') {
            rank--;
            file = 0;
        } else {
            Color color = std::islower(c) ? BLACK : WHITE;
            PieceType pt;
            switch (std::tolower(c)) {
                case 'p': pt = PAWN; break;
                case 'n': pt = KNIGHT; break;
                case 'b': pt = BISHOP; break;
                case 'r': pt = ROOK; break;
                case 'q': pt = QUEEN; break;
                case 'k': pt = KING; break;
                default: pt = NO_PIECE_TYPE; break;
            }
            put_piece(make_piece(color, pt), make_square(file, rank));
            file++;
        }
    }

    stm = (side == "w") ? WHITE : BLACK;

    for (char c : castling) {
        if (c == 'K') st->castling_rights |= WHITE_OO;
        if (c == 'Q') st->castling_rights |= WHITE_OOO;
        if (c == 'k') st->castling_rights |= BLACK_OO;
        if (c == 'q') st->castling_rights |= BLACK_OOO;
    }

    if (en_passant != "-") {
        file = en_passant[0] - 'a';
        rank = en_passant[1] - '1';
        st->ep_square = make_square(file, rank);
    }

    if (!half_moves.empty()) st->half_move_clock = std::stoi(half_moves);
    if (!full_moves.empty()) st->full_move_number = std::stoi(full_moves);

    st->zobrist_key = compute_key();
}

std::string Position::get_fen() const {
    std::string fen = "";
    for (int rank = 7; rank >= 0; rank--) {
        int empty_count = 0;
        for (int file = 0; file < 8; file++) {
            Piece p = board[make_square(file, rank)];
            if (p == NO_PIECE) {
                empty_count++;
            } else {
                if (empty_count > 0) {
                    fen += std::to_string(empty_count);
                    empty_count = 0;
                }
                char piece_char;
                switch (type_of_piece(p)) {
                    case PAWN: piece_char = 'p'; break;
                    case KNIGHT: piece_char = 'n'; break;
                    case BISHOP: piece_char = 'b'; break;
                    case ROOK: piece_char = 'r'; break;
                    case QUEEN: piece_char = 'q'; break;
                    case KING: piece_char = 'k'; break;
                    default: piece_char = '?'; break;
                }
                if (type_of_color(p) == WHITE) piece_char = std::toupper(piece_char);
                fen += piece_char;
            }
        }
        if (empty_count > 0) fen += std::to_string(empty_count);
        if (rank > 0) fen += "/";
    }

    fen += (stm == WHITE) ? " w " : " b ";

    if (st->castling_rights == NO_CASTLING) {
        fen += "-";
    } else {
        if (st->castling_rights & WHITE_OO) fen += "K";
        if (st->castling_rights & WHITE_OOO) fen += "Q";
        if (st->castling_rights & BLACK_OO) fen += "k";
        if (st->castling_rights & BLACK_OOO) fen += "q";
    }

    fen += " ";
    if (st->ep_square == SQ_NONE) {
        fen += "-";
    } else {
        fen += (char)('a' + (st->ep_square % 8));
        fen += (char)('1' + (st->ep_square / 8));
    }

    fen += " " + std::to_string(st->half_move_clock);
    fen += " " + std::to_string(st->full_move_number);

    return fen;
}

void Position::set_starting_position() {
    set_fen(START_FEN);
}

// ============================================================================
// Zobrist Keys and Attack Detection
// ============================================================================

Bitboard Position::compute_key() const {
    Bitboard k = 0ULL;
    for (int sq = 0; sq < SQUARE_NB; sq++) {
        Piece p = board[sq];
        if (p != NO_PIECE) {
            k ^= ZobristPieces[type_of_piece(p)][type_of_color(p)][sq];
        }
    }
    k ^= ZobristCastling[st->castling_rights];
    if (st->ep_square != SQ_NONE) {
        k ^= ZobristEnPassant[st->ep_square % 8];
    }
    if (stm == BLACK) {
        k ^= ZobristSide;
    }
    return k;
}

Bitboard Position::attackers_to(Square s, Color c, Bitboard occ) const {
    return (PawnAttacks[~c][s] & pieces(c, PAWN)) |
           (attacks_from_knight(s) & pieces(c, KNIGHT)) |
           (attacks_from_bishop(s, occ) & (pieces(c, BISHOP) | pieces(c, QUEEN))) |
           (attacks_from_rook(s, occ) & (pieces(c, ROOK) | pieces(c, QUEEN))) |
           (attacks_from_king(s) & pieces(c, KING));
}

Bitboard Position::attackers_to(Square s, Bitboard occ) const {
    return attackers_to(s, WHITE, occ) | attackers_to(s, BLACK, occ);
}

bool Position::is_in_check() const {
    Square king_sq = lsb(pieces(stm, KING));
    return attackers_to(king_sq, ~stm, pieces()) != 0;
}

// ============================================================================
// Move Execution and Validation
// ============================================================================

void Position::do_move(Move m, StateInfo& new_st) {
    // Copy base state
    new_st.captured_piece = NO_PIECE;
    new_st.castling_rights = st->castling_rights;
    new_st.ep_square = SQ_NONE;
    new_st.half_move_clock = st->half_move_clock + 1;
    new_st.full_move_number = st->full_move_number + (stm == BLACK ? 1 : 0);
    new_st.zobrist_key = st->zobrist_key;
    new_st.previous = st;
    st = &new_st;

    Square from = m.from();
    Square to = m.to();
    MoveType type = m.type();
    Piece moving_piece = board[from];
    PieceType pt = type_of_piece(moving_piece);

    // Remove from square from Zobrist key
    st->zobrist_key ^= ZobristPieces[pt][stm][from];
    
    // Clear old En Passant key
    if (st->previous->ep_square != SQ_NONE) {
        st->zobrist_key ^= ZobristEnPassant[st->previous->ep_square % 8];
    }

    if (pt == PAWN) {
        st->half_move_clock = 0;
    }

    if (type == NORMAL || type == PROMOTION) {
        Piece captured = board[to];
        if (captured != NO_PIECE) {
            st->captured_piece = captured;
            st->half_move_clock = 0;
            remove_piece(to);
            st->zobrist_key ^= ZobristPieces[type_of_piece(captured)][~stm][to];
        }

        move_piece(from, to);

        if (type == PROMOTION) {
            Piece prom_piece = make_piece(stm, m.promotion_piece());
            remove_piece(to);
            put_piece(prom_piece, to);
            st->zobrist_key ^= ZobristPieces[m.promotion_piece()][stm][to];
        } else {
            st->zobrist_key ^= ZobristPieces[pt][stm][to];
            // En Passant square eligibility on double pawn push
            if (pt == PAWN && std::abs(to - from) == 16) {
                st->ep_square = stm == WHITE ? from + NORTH : from + SOUTH;
                st->zobrist_key ^= ZobristEnPassant[st->ep_square % 8];
            }
        }
    } else if (type == EN_PASSANT) {
        Square cap_sq = stm == WHITE ? to + SOUTH : to + NORTH;
        Piece captured = board[cap_sq];
        st->captured_piece = captured;
        remove_piece(cap_sq);
        move_piece(from, to);
        st->zobrist_key ^= ZobristPieces[PAWN][~stm][cap_sq];
        st->zobrist_key ^= ZobristPieces[PAWN][stm][to];
    } else if (type == CASTLING) {
        move_piece(from, to);
        st->zobrist_key ^= ZobristPieces[KING][stm][to];
        // Move the rook simultaneously
        Square rook_from, rook_to;
        if (to == SQ_G1) { rook_from = SQ_H1; rook_to = SQ_F1; }
        else if (to == SQ_C1) { rook_from = SQ_A1; rook_to = SQ_D1; }
        else if (to == SQ_G8) { rook_from = SQ_H8; rook_to = SQ_F8; }
        else /* SQ_C8 */ { rook_from = SQ_A8; rook_to = SQ_D8; }
        
        move_piece(rook_from, rook_to);
        st->zobrist_key ^= ZobristPieces[ROOK][stm][rook_from];
        st->zobrist_key ^= ZobristPieces[ROOK][stm][rook_to];
    }

    // Update castling rights (removes rights if king or rook moved/captured)
    st->zobrist_key ^= ZobristCastling[st->previous->castling_rights];
    st->castling_rights &= CASTLING_RIGHTS_MASK[from];
    st->castling_rights &= CASTLING_RIGHTS_MASK[to];
    st->zobrist_key ^= ZobristCastling[st->castling_rights];

    // Swap sides
    stm = ~stm;
    st->zobrist_key ^= ZobristSide;
}

void Position::do_null_move(StateInfo& new_st) {
    new_st.previous = st;
    st = &new_st;
    
    st->captured_piece = NO_PIECE;
    st->castling_rights = st->previous->castling_rights;
    st->ep_square = SQ_NONE;
    st->half_move_clock = st->previous->half_move_clock;
    st->full_move_number = st->previous->full_move_number;
    if (stm == BLACK) st->full_move_number++;
    
    st->zobrist_key = st->previous->zobrist_key ^ ZobristSide;
    if (st->previous->ep_square != SQ_NONE) {
        st->zobrist_key ^= ZobristEnPassant[st->previous->ep_square % 8];
    }
    
    stm = ~stm;
}

void Position::undo_null_move() {
    stm = ~stm;
    st = st->previous;
}

void Position::undo_move(Move m) {
    stm = ~stm; // Swap back to original stm

    Square from = m.from();
    Square to = m.to();
    MoveType type = m.type();

    if (type == PROMOTION) {
        // Demote
        remove_piece(to);
        put_piece(make_piece(stm, PAWN), from);
    } else {
        move_piece(to, from);
    }

    if (type == EN_PASSANT) {
        Square cap_sq = stm == WHITE ? to + SOUTH : to + NORTH;
        put_piece(make_piece(~stm, PAWN), cap_sq);
    } else if (type == CASTLING) {
        Square rook_from, rook_to;
        if (to == SQ_G1) { rook_from = SQ_H1; rook_to = SQ_F1; }
        else if (to == SQ_C1) { rook_from = SQ_A1; rook_to = SQ_D1; }
        else if (to == SQ_G8) { rook_from = SQ_H8; rook_to = SQ_F8; }
        else /* SQ_C8 */ { rook_from = SQ_A8; rook_to = SQ_D8; }
        move_piece(rook_to, rook_from); // Reverse rook
    } else {
        if (st->captured_piece != NO_PIECE) {
            put_piece(st->captured_piece, to);
        }
    }

    st = st->previous; // Restore state pointer
}

bool Position::is_legal(Move m) const {
    Square from = m.from();
    Piece p = board[from];
    
    // Safety check for TT collisions / unverified moves
    if (p == NO_PIECE || type_of_color(p) != stm) return false;
    
    if (m.type() == CASTLING) {
        if (is_in_check()) return false;
        Square from = m.from();
        Square to = m.to();
        Square pass_sq = (to > from) ? from + EAST : from + WEST;
        if (attackers_to(pass_sq, ~stm, pieces())) return false;
    }

    StateInfo new_st;
    Position* nc_this = const_cast<Position*>(this);
    nc_this->do_move(m, new_st);
    
    Color us = ~nc_this->side_to_move();
    Square king_sq = lsb(nc_this->pieces(us, KING));
    bool legal = (nc_this->attackers_to(king_sq, nc_this->side_to_move(), nc_this->pieces()) == 0);
    
    nc_this->undo_move(m);
    return legal;
}

bool Position::gives_check(Move m) const {
    Square opp_king = lsb(pieces(~stm, KING));
    Square from = m.from();
    Square to = m.to();
    Bitboard occ = pieces();
    occ ^= square_bb(from);
    occ |= square_bb(to);
    
    if (m.type() == EN_PASSANT) {
        Square cap_sq = stm == WHITE ? to + SOUTH : to + NORTH;
        occ ^= square_bb(cap_sq);
    }
    
    PieceType pt = type_of_piece(board[from]);
    if (m.type() == PROMOTION) pt = m.promotion_piece();
    
    // Direct attack from the moved piece
    if (attacks_from(pt, to, occ) & square_bb(opp_king)) return true;
    
    // Discovered attacks from sliding pieces opening a ray
    Bitboard bishop_ray = attacks_from_bishop(opp_king, occ);
    if (bishop_ray & (pieces(stm, BISHOP) | pieces(stm, QUEEN))) return true;
    
    Bitboard rook_ray = attacks_from_rook(opp_king, occ);
    if (rook_ray & (pieces(stm, ROOK) | pieces(stm, QUEEN))) return true;

    return false;
}

// Perft placeholder - will be filled out completely in movegen module
uint64_t Position::perft(int depth) {
    (void)depth;
    return 0; // Wait for MoveGen
}

// ============================================================================
// Debugging
// ============================================================================

void Position::print() const {
    std::cout << "+---+---+---+---+---+---+---+---+\n";
    for (int rank = 7; rank >= 0; rank--) {
        for (int file = 0; file < 8; file++) {
            std::cout << "| ";
            Piece p = board[make_square(file, rank)];
            char c = ' ';
            if (p != NO_PIECE) {
                switch (type_of_piece(p)) {
                    case PAWN: c = 'p'; break;
                    case KNIGHT: c = 'n'; break;
                    case BISHOP: c = 'b'; break;
                    case ROOK: c = 'r'; break;
                    case QUEEN: c = 'q'; break;
                    case KING: c = 'k'; break;
                    default: break;
                }
                if (type_of_color(p) == WHITE) c = std::toupper(c);
            }
            std::cout << c << " ";
        }
        std::cout << "|\n+---+---+---+---+---+---+---+---+\n";
    }
    std::cout << "FEN: " << get_fen() << "\n";
    std::cout << "Key: " << std::hex << key() << std::dec << "\n";
}

// Test main for Position
// ============================================================================
// Draw and Material
// ============================================================================

bool Position::has_non_pawn_material(Color c) const {
    return (pieces(c, KNIGHT) | pieces(c, BISHOP) | pieces(c, ROOK) | pieces(c, QUEEN)) != 0;
}

bool Position::is_draw(int ply) const {
    if (st->half_move_clock >= 100) return true;
    
    StateInfo* curr = st->previous;
    int k = 2;
    while (curr && k <= st->half_move_clock) {
        if (curr->zobrist_key == st->zobrist_key) {
            return true;
        }
        curr = curr->previous;
        if (curr) curr = curr->previous;
        k += 2;
    }
    return false;
}

#ifdef TEST_POSITION
int main() {
    init_bitboards();
    init_zobrist();
    
    Position pos;
    pos.set_starting_position();
    pos.print();
    
    std::cout << "\nSetting FEN: 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1\n";
    pos.set_fen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");
    pos.print();
    
    return 0;
}
#endif
