#ifndef POSITION_H
#define POSITION_H

#include "types.h"
#include "bitboard.h"
#include "nnue/nnue.h"
#include <string>
#include <cassert>

// ============================================================================
// Constants and Structures
// ============================================================================

enum CastlingRights {
    NO_CASTLING = 0,
    WHITE_OO  = 1,
    WHITE_OOO = 2,
    BLACK_OO  = 4,
    BLACK_OOO = 8,
    ANY_CASTLING = 15
};

// StateInfo holds state that cannot be easily recovered by undoing a move.
// We pass it to do_move, which pushes it onto a conceptual stack (linked list).
struct StateInfo {
    Bitboard zobrist_key;
    Piece captured_piece;
    int castling_rights;
    Square ep_square;
    int half_move_clock;
    int full_move_number;
    NNUEdata nnue;
    StateInfo* previous; // For undoing moves
};

// ============================================================================
// Position Class
// ============================================================================

class Position {
public:
    Position();
    ~Position() = default;

    // --- Initialization ---
    void set_fen(const std::string& fen);
    std::string get_fen() const;
    void set_starting_position();

    // --- Move Execution ---
    // Executing a move requires a new StateInfo object to store the irreversible state
    void do_move(Move m, StateInfo& new_st);
    void undo_move(Move m);
    void do_null_move(StateInfo& new_st); // Useful for search phase
    void undo_null_move();

    // --- Move Validation ---
    bool is_legal(Move m) const;
    bool is_in_check() const;
    bool gives_check(Move m) const;
    
    // --- Draw and Material ---
    bool is_draw(int ply) const;
    bool has_non_pawn_material(Color c) const;
    
    // --- Piece/Board Accessors ---
    Piece piece_on(Square s) const { return board[s]; }
    Color side_to_move() const { return stm; }
    
    Bitboard pieces() const { return byType[PIECE_TYPE_NB]; }
    Bitboard pieces(Color c) const { return byColor[c]; }
    Bitboard pieces(PieceType pt) const { return byType[pt]; }
    Bitboard pieces(Color c, PieceType pt) const { return byType[pt] & byColor[c]; }
    
    // Bitboard of all pieces except one (for computing x-ray attacks)
    Bitboard pieces_except(Square s) const { return pieces() ^ square_bb(s); }

    // --- State Accessors ---
    Bitboard key() const { return st->zobrist_key; }
    Square ep_square() const { return st->ep_square; }
    int castling_rights() const { return st->castling_rights; }
    bool can_castle(CastlingRights cr) const { return (st->castling_rights & cr) != 0; }
    int half_move_clock() const { return st->half_move_clock; }
    int full_move_number() const { return st->full_move_number; }
    const StateInfo* state() const { return st; }

    // --- Attack Queries ---
    // Returns bitboard of all squares attacked by a given color
    Bitboard attackers_to(Square s, Bitboard occ) const;
    Bitboard attackers_to(Square s, Color c, Bitboard occ) const;

    // --- Perft ---
    // Will be fully functional once movegen is built
    uint64_t perft(int depth);

    // --- Debugging ---
    void print() const;

private:
    Piece board[SQUARE_NB];
    Bitboard byType[PIECE_TYPE_NB + 1]; // Index 6 is for ALL pieces combined
    Bitboard byColor[COLOR_NB];

    Color stm; // Side to move
    StateInfo* st; // Current state pointer

    // --- Helpers ---
    void put_piece(Piece p, Square s);
    void remove_piece(Square s);
    void move_piece(Square from, Square to);
    
    void update_castling_rights(Square s);
    Bitboard compute_key() const;
    
    StateInfo start_state; // Base state for root position
};

// ============================================================================
// Globals
// ============================================================================

const std::string START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Mask array to update castling rights efficiently when a piece moves from or to a square.
const int CASTLING_RIGHTS_MASK[SQUARE_NB] = {
    13, 15, 15, 15, 12, 15, 15, 14,
    15, 15, 15, 15, 15, 15, 15, 15,
    15, 15, 15, 15, 15, 15, 15, 15,
    15, 15, 15, 15, 15, 15, 15, 15,
    15, 15, 15, 15, 15, 15, 15, 15,
    15, 15, 15, 15, 15, 15, 15, 15,
    15, 15, 15, 15, 15, 15, 15, 15,
     7, 15, 15, 15,  3, 15, 15, 11
};

#endif // POSITION_H
