#ifndef TT_H
#define TT_H

#include "types.h"
#include <cstdint>
#include <cstddef>

// ============================================================================
// Transposition Table Entry
// ============================================================================

enum Bound {
    BOUND_NONE,
    BOUND_UPPER,
    BOUND_LOWER,
    BOUND_EXACT
};

// 16 bytes per entry for optimal cache alignment
struct TTEntry {
    uint32_t key32;     // Upper 32 bits of the Zobrist key
    uint32_t move;      // Best move encoded
    int16_t score;      // Evaluated score
    int8_t depth;       // Depth of the search
    uint8_t flag;       // Bound type (EXACT, LOWER, UPPER)
    uint8_t age;        // Age for replacement strategy
};

// ============================================================================
// Transposition Table Class
// ============================================================================

class TranspositionTable {
public:
    TranspositionTable();
    ~TranspositionTable();

    // Allocate memory (in MB). Size will be rounded down to nearest power of 2.
    void resize(int mb);
    
    // Clear the table (zero all entries)
    void clear();
    
    // Increment the age counter, called at the start of each new search
    void new_search();

    // Probe the TT. Returns true if a valid cutoff is found.
    // Even if false is returned, tt_move is populated if an entry exists for move ordering.
    bool probe(Bitboard key, int depth, int alpha, int beta, int& tt_score, Move& tt_move);
    
    // Store a new entry in the TT
    void store(Bitboard key, int score, int depth, Bound flag, Move move);
    
    // Convert mate scores to/from TT format.
    // In search, mate scores reflect distance from root.
    // In TT, mate scores must reflect distance from the current position.
    int score_to_tt(int score, int ply) const;
    int score_from_tt(int score, int ply) const;

private:
    TTEntry* table;
    size_t size;        // Number of entries (must be a power of 2)
    size_t mask;        // size - 1 for fast modulo
    uint8_t current_age;
};

// Global TT instance
extern TranspositionTable TT;

#endif // TT_H
