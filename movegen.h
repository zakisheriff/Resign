#ifndef MOVEGEN_H
#define MOVEGEN_H

#include "position.h"

// ============================================================================
// MoveList
// ============================================================================

struct MoveList {
    Move moves[MAX_MOVES];
    int count;

    MoveList() : count(0) {}
    void add(Move m) { moves[count++] = m; }
    int size() const { return count; }
};

// ============================================================================
// Generation Functions
// ============================================================================

void generate_all(const Position& pos, MoveList& list);
void generate_captures(const Position& pos, MoveList& list);

// ============================================================================
// Perft Function
// ============================================================================

// Standard perft for testing move generator correctness and speed
uint64_t perft(Position& pos, int depth);

// Perft that prints the node count for each root move
void perft_divide(Position& pos, int depth);

#endif // MOVEGEN_H
