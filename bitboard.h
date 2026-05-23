#ifndef BITBOARD_H
#define BITBOARD_H

#include "types.h"
#include <string>

// ============================================================================
// Bitboard Utilities
// ============================================================================

// Returns the number of set bits (population count)
inline int popcount(Bitboard b) {
    return __builtin_popcountll(b);
}

// Returns the least significant bit (LSB) square.
// Undefined behavior if b is 0.
inline Square lsb(Bitboard b) {
    return static_cast<Square>(__builtin_ctzll(b));
}

// Returns the most significant bit (MSB) square.
// Undefined behavior if b is 0.
inline Square msb(Bitboard b) {
    return static_cast<Square>(63 - __builtin_clzll(b));
}

// Pops the least significant bit and returns its square as a bitboard.
// Undefined behavior if b is 0.
inline Bitboard pop_lsb(Bitboard& b) {
    Square s = lsb(b);
    b &= b - 1;
    return 1ULL << s;
}

// Pops the least significant bit and returns its square.
// Undefined behavior if b is 0.
inline Square pop_lsb_sq(Bitboard& b) {
    Square s = lsb(b);
    b &= b - 1;
    return s;
}

// Returns a bitboard with a single bit set at square s.
inline constexpr Bitboard square_bb(Square s) {
    return 1ULL << s;
}

inline void set_bit(Bitboard& b, Square s) {
    b |= square_bb(s);
}

inline void clear_bit(Bitboard& b, Square s) {
    b &= ~square_bb(s);
}

inline bool test_bit(Bitboard b, Square s) {
    return (b & square_bb(s)) != 0;
}

// ============================================================================
// Attack Tables & Magic Bitboards
// ============================================================================

// Precomputed attack tables for non-sliding pieces
extern Bitboard PawnAttacks[COLOR_NB][SQUARE_NB];
extern Bitboard KnightAttacks[SQUARE_NB];
extern Bitboard KingAttacks[SQUARE_NB];

// Magic bitboard struct for sliding pieces
struct Magic {
    Bitboard mask;     // Relevant blockers mask
    Bitboard magic;    // Magic multiplier
    Bitboard* attacks; // Pointer to the attacks table
    int shift;         // Right shift to get index
};

// Magic bitboards arrays for sliding pieces
extern Magic RookMagics[SQUARE_NB];
extern Magic BishopMagics[SQUARE_NB];

// ============================================================================
// Zobrist Hashing Tables
// ============================================================================

// Random 64-bit keys for every piece/square combo, castling, en passant, side
extern Bitboard ZobristPieces[PIECE_TYPE_NB][COLOR_NB][SQUARE_NB];
extern Bitboard ZobristCastling[16];
extern Bitboard ZobristEnPassant[8]; // Indexed by file (0-7)
extern Bitboard ZobristSide;

// ============================================================================
// Initialization
// ============================================================================

// Call these once at startup
void init_bitboards();
void init_zobrist();

// ============================================================================
// Attack Getters
// ============================================================================

inline Bitboard attacks_from_pawn(Color c, Square s) {
    return PawnAttacks[c][s];
}

inline Bitboard attacks_from_knight(Square s) {
    return KnightAttacks[s];
}

inline Bitboard attacks_from_king(Square s) {
    return KingAttacks[s];
}

// Get bishop attacks given square and current occupancy
inline Bitboard attacks_from_bishop(Square s, Bitboard occ) {
    const Magic& m = BishopMagics[s];
    occ &= m.mask;
    occ *= m.magic;
    occ >>= m.shift;
    return m.attacks[occ];
}

// Get rook attacks given square and current occupancy
inline Bitboard attacks_from_rook(Square s, Bitboard occ) {
    const Magic& m = RookMagics[s];
    occ &= m.mask;
    occ *= m.magic;
    occ >>= m.shift;
    return m.attacks[occ];
}

// Get queen attacks given square and current occupancy
inline Bitboard attacks_from_queen(Square s, Bitboard occ) {
    return attacks_from_bishop(s, occ) | attacks_from_rook(s, occ);
}

// General attack getter based on piece type
inline Bitboard attacks_from(PieceType pt, Square s, Bitboard occ) {
    switch (pt) {
        case KNIGHT: return attacks_from_knight(s);
        case BISHOP: return attacks_from_bishop(s, occ);
        case ROOK:   return attacks_from_rook(s, occ);
        case QUEEN:  return attacks_from_queen(s, occ);
        case KING:   return attacks_from_king(s);
        default:     return 0ULL;
    }
}

// ============================================================================
// Debugging
// ============================================================================

// Returns a formatted 8x8 string representation of a bitboard
std::string pretty_bitboard(Bitboard b);

#endif // BITBOARD_H
