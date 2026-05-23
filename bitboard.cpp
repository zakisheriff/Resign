#include "bitboard.h"
#include <iostream>
#include <iomanip>

// ============================================================================
// Global Attack Tables Memory
// ============================================================================

Bitboard PawnAttacks[COLOR_NB][SQUARE_NB];
Bitboard KnightAttacks[SQUARE_NB];
Bitboard KingAttacks[SQUARE_NB];

Magic RookMagics[SQUARE_NB];
Magic BishopMagics[SQUARE_NB];

// The actual arrays storing the attacks for magic bitboards
// Rook total size needed: 102400 (sum of 2^(64-shift) for all 64 squares)
// Bishop total size needed: 5248
Bitboard RookAttacks[102400];
Bitboard BishopAttacks[5248];

// ============================================================================
// Zobrist Tables
// ============================================================================

Bitboard ZobristPieces[PIECE_TYPE_NB][COLOR_NB][SQUARE_NB];
Bitboard ZobristCastling[16];
Bitboard ZobristEnPassant[8];
Bitboard ZobristSide;

// ============================================================================
// PRNG for Zobrist and Magic finding
// ============================================================================

struct PRNG {
    uint64_t seed;
    PRNG(uint64_t s) : seed(s) {}

    // xorshift64star
    uint64_t rand64() {
        seed ^= seed >> 12;
        seed ^= seed << 25;
        seed ^= seed >> 27;
        return seed * 2685821657736338717ULL;
    }
    
    // Sparse random for magic bitboards (few bits set)
    uint64_t rand_sparse() {
        return rand64() & rand64() & rand64();
    }
};

static PRNG prng(1070372ULL);

// ============================================================================
// Helper logic for generating magics and tables
// ============================================================================

// Calculate destination square if within board, else return 0
static Bitboard safe_destination(Square s, int step_rank, int step_file) {
    int rank = s / 8;
    int file = s % 8;
    int r = rank + step_rank;
    int f = file + step_file;
    if (r >= 0 && r < 8 && f >= 0 && f < 8) {
        return 1ULL << make_square(f, r);
    }
    return 0ULL;
}

// Get the mask of relevant blocker squares for a sliding piece on a given square
// Edges are excluded because a piece there doesn't block any further squares
static Bitboard sliding_attack_mask(Square s, bool rook) {
    Bitboard mask = 0ULL;
    int rank = s / 8;
    int file = s % 8;

    if (rook) {
        for (int r = rank + 1; r < 7; r++) mask |= 1ULL << make_square(file, r);
        for (int r = rank - 1; r > 0; r--) mask |= 1ULL << make_square(file, r);
        for (int f = file + 1; f < 7; f++) mask |= 1ULL << make_square(f, rank);
        for (int f = file - 1; f > 0; f--) mask |= 1ULL << make_square(f, rank);
    } else {
        for (int r = rank + 1, f = file + 1; r < 7 && f < 7; r++, f++) mask |= 1ULL << make_square(f, r);
        for (int r = rank + 1, f = file - 1; r < 7 && f > 0; r++, f--) mask |= 1ULL << make_square(f, r);
        for (int r = rank - 1, f = file + 1; r > 0 && f < 7; r--, f++) mask |= 1ULL << make_square(f, r);
        for (int r = rank - 1, f = file - 1; r > 0 && f > 0; r--, f--) mask |= 1ULL << make_square(f, r);
    }
    return mask;
}

// Get the actual attacks given a specific occupancy configuration
static Bitboard sliding_attacks(Square s, Bitboard occ, bool rook) {
    Bitboard attacks = 0ULL;
    int rank = s / 8;
    int file = s % 8;

    if (rook) {
        for (int r = rank + 1; r < 8; r++) { attacks |= 1ULL << make_square(file, r); if (occ & (1ULL << make_square(file, r))) break; }
        for (int r = rank - 1; r >= 0; r--) { attacks |= 1ULL << make_square(file, r); if (occ & (1ULL << make_square(file, r))) break; }
        for (int f = file + 1; f < 8; f++) { attacks |= 1ULL << make_square(f, rank); if (occ & (1ULL << make_square(f, rank))) break; }
        for (int f = file - 1; f >= 0; f--) { attacks |= 1ULL << make_square(f, rank); if (occ & (1ULL << make_square(f, rank))) break; }
    } else {
        for (int r = rank + 1, f = file + 1; r < 8 && f < 8; r++, f++) { attacks |= 1ULL << make_square(f, r); if (occ & (1ULL << make_square(f, r))) break; }
        for (int r = rank + 1, f = file - 1; r < 8 && f >= 0; r++, f--) { attacks |= 1ULL << make_square(f, r); if (occ & (1ULL << make_square(f, r))) break; }
        for (int r = rank - 1, f = file + 1; r >= 0 && f < 8; r--, f++) { attacks |= 1ULL << make_square(f, r); if (occ & (1ULL << make_square(f, r))) break; }
        for (int r = rank - 1, f = file - 1; r >= 0 && f >= 0; r--, f--) { attacks |= 1ULL << make_square(f, r); if (occ & (1ULL << make_square(f, r))) break; }
    }
    return attacks;
}

// Generate the i-th occupancy combination from a given mask
static Bitboard set_occupancy(int index, int bits_in_mask, Bitboard mask) {
    Bitboard occ = 0ULL;
    for (int i = 0; i < bits_in_mask; i++) {
        Square s = pop_lsb_sq(mask);
        if (index & (1 << i)) {
            occ |= square_bb(s);
        }
    }
    return occ;
}

// Initialize the magic bitboards and attack tables for sliding pieces
static void init_magics(bool rook, Bitboard* attack_table) {
    Magic* magics = rook ? RookMagics : BishopMagics;
    
    for (int sq = 0; sq < SQUARE_NB; sq++) {
        magics[sq].mask = sliding_attack_mask(static_cast<Square>(sq), rook);
        int bits = popcount(magics[sq].mask);
        magics[sq].shift = 64 - bits;
        
        // Find a magic multiplier
        bool found = false;
        while (!found) {
            Bitboard magic = prng.rand_sparse();
            if (popcount((magics[sq].mask * magic) & 0xFF00000000000000ULL) < 6) continue;
            
            magics[sq].magic = magic;
            magics[sq].attacks = attack_table;
            
            bool fail = false;
            // Temporary used table to verify no hash collisions
            // Max shift for rook is 12 (4096 elements)
            Bitboard used[4096] = {0};
            
            int num_occ = 1 << bits;
            for (int i = 0; i < num_occ; i++) {
                Bitboard occ = set_occupancy(i, bits, magics[sq].mask);
                Bitboard attacks = sliding_attacks(static_cast<Square>(sq), occ, rook);
                int magic_index = (occ * magic) >> magics[sq].shift;
                
                if (used[magic_index] == 0ULL) {
                    used[magic_index] = attacks;
                } else if (used[magic_index] != attacks) {
                    fail = true;
                    break;
                }
            }
            if (!fail) {
                // Magic is valid! Commit to the permanent table
                for (int i = 0; i < num_occ; i++) {
                    Bitboard occ = set_occupancy(i, bits, magics[sq].mask);
                    Bitboard attacks = sliding_attacks(static_cast<Square>(sq), occ, rook);
                    int magic_index = (occ * magic) >> magics[sq].shift;
                    magics[sq].attacks[magic_index] = attacks;
                }
                attack_table += num_occ; // Advance memory pointer for next square
                found = true;
            }
        }
    }
}

// ============================================================================
// Public Initialization Functions
// ============================================================================

void init_bitboards() {
    for (int sq = 0; sq < SQUARE_NB; sq++) {
        Square s = static_cast<Square>(sq);
        
        // King
        Bitboard k = 0ULL;
        k |= safe_destination(s, 1, 0);
        k |= safe_destination(s, -1, 0);
        k |= safe_destination(s, 0, 1);
        k |= safe_destination(s, 0, -1);
        k |= safe_destination(s, 1, 1);
        k |= safe_destination(s, 1, -1);
        k |= safe_destination(s, -1, 1);
        k |= safe_destination(s, -1, -1);
        KingAttacks[s] = k;
        
        // Knight
        Bitboard n = 0ULL;
        n |= safe_destination(s, 2, 1);
        n |= safe_destination(s, 2, -1);
        n |= safe_destination(s, -2, 1);
        n |= safe_destination(s, -2, -1);
        n |= safe_destination(s, 1, 2);
        n |= safe_destination(s, 1, -2);
        n |= safe_destination(s, -1, 2);
        n |= safe_destination(s, -1, -2);
        KnightAttacks[s] = n;
        
        // Pawns
        Bitboard wp = 0ULL, bp = 0ULL;
        // White pawn captures (north-east, north-west)
        wp |= safe_destination(s, 1, 1);
        wp |= safe_destination(s, 1, -1);
        // Black pawn captures (south-east, south-west)
        bp |= safe_destination(s, -1, 1);
        bp |= safe_destination(s, -1, -1);
        
        PawnAttacks[WHITE][s] = wp;
        PawnAttacks[BLACK][s] = bp;
    }
    
    // Initialize magics
    init_magics(true, RookAttacks);
    init_magics(false, BishopAttacks);
}

void init_zobrist() {
    for (int pt = 0; pt < PIECE_TYPE_NB; pt++) {
        for (int c = 0; c < COLOR_NB; c++) {
            for (int sq = 0; sq < SQUARE_NB; sq++) {
                ZobristPieces[pt][c][sq] = prng.rand64();
            }
        }
    }
    for (int i = 0; i < 16; i++) {
        ZobristCastling[i] = prng.rand64();
    }
    for (int i = 0; i < 8; i++) {
        ZobristEnPassant[i] = prng.rand64();
    }
    ZobristSide = prng.rand64();
}

// ============================================================================
// Debugging
// ============================================================================

std::string pretty_bitboard(Bitboard b) {
    std::string s = "";
    for (int rank = 7; rank >= 0; rank--) {
        s += std::to_string(rank + 1) + "  ";
        for (int file = 0; file < 8; file++) {
            Square sq = make_square(file, rank);
            if (test_bit(b, sq)) s += "X ";
            else s += ". ";
        }
        s += "\n";
    }
    s += "   A B C D E F G H\n";
    return s;
}

// ============================================================================
// Testing Routine
// ============================================================================

void test_bitboards() {
    init_bitboards();
    init_zobrist();
    
    std::cout << "Testing Knight on E4:\n";
    std::cout << pretty_bitboard(attacks_from_knight(SQ_E4)) << "\n";
    
    std::cout << "Testing Bishop on D4 with blockers on C3 and F6:\n";
    Bitboard occ = square_bb(SQ_C3) | square_bb(SQ_F6);
    std::cout << "Occupancy:\n" << pretty_bitboard(occ) << "\n";
    std::cout << "Attacks:\n" << pretty_bitboard(attacks_from_bishop(SQ_D4, occ)) << "\n";
    
    std::cout << "Bitboard tests completed successfully.\n";
}

#ifdef TEST_BITBOARD
int main() {
    test_bitboards();
    return 0;
}
#endif
