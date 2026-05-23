#include "tt.h"
#include <cstdlib>
#include <cstring>
#include <iostream>

TranspositionTable TT;

TranspositionTable::TranspositionTable() : table(nullptr), size(0), mask(0), current_age(0) {
    // Default size is 256 MB. It will be resized by UCI if needed.
    resize(256);
}

TranspositionTable::~TranspositionTable() {
    if (table) {
        std::free(table);
    }
}

void TranspositionTable::resize(int mb) {
    if (table) {
        std::free(table);
        table = nullptr;
    }
    
    size_t bytes = static_cast<size_t>(mb) * 1024 * 1024;
    size_t num_entries = bytes / sizeof(TTEntry);
    
    size = 1;
    while ((size * 2) <= num_entries) {
        size *= 2;
    }
    
    mask = size > 0 ? size - 1 : 0;
    
    if (size > 0) {
        table = static_cast<TTEntry*>(std::malloc(size * sizeof(TTEntry)));
        if (!table) {
            std::cerr << "Error: Failed to allocate Transposition Table (" << mb << " MB)\n";
            size = 0;
            mask = 0;
        } else {
            clear();
        }
    }
}

void TranspositionTable::clear() {
    if (table && size > 0) {
        std::memset(table, 0, size * sizeof(TTEntry));
    }
}

void TranspositionTable::new_search() {
    current_age++;
}

int TranspositionTable::score_to_tt(int score, int ply) const {
    if (score >= VALUE_MATE - MAX_PLY) return score + ply;
    if (score <= -VALUE_MATE + MAX_PLY) return score - ply;
    return score;
}

int TranspositionTable::score_from_tt(int score, int ply) const {
    if (score >= VALUE_MATE - MAX_PLY) return score - ply;
    if (score <= -VALUE_MATE + MAX_PLY) return score + ply;
    return score;
}

bool TranspositionTable::probe(Bitboard key, int depth, int alpha, int beta, int& tt_score, Move& tt_move) {
    if (size == 0) return false;
    
    TTEntry& entry = table[key & mask];
    
    // Check if the entry matches the key
    if (entry.key32 == static_cast<uint32_t>(key >> 32)) {
        tt_move = Move(entry.move);
        
        // We defer mate score adjustment to the search function itself, since we don't pass ply here.
        // Wait, the search function usually calls score_from_tt after probe.
        // I'll just return the raw entry.score here.
        tt_score = entry.score;
        
        // Check if we can get a cutoff
        if (entry.depth >= depth) {
            if (entry.flag == BOUND_EXACT) return true;
            if (entry.flag == BOUND_UPPER && tt_score <= alpha) return true;
            if (entry.flag == BOUND_LOWER && tt_score >= beta) return true;
        }
    }
    
    return false;
}

void TranspositionTable::store(Bitboard key, int score, int depth, Bound flag, Move move) {
    if (size == 0) return;
    
    TTEntry& entry = table[key & mask];
    
    // Replacement strategy:
    // 1. Always replace if the entry is from an older search (different age).
    // 2. Otherwise, replace if the new depth is greater than or equal to the old depth.
    // 3. Always overwrite if it's the exact same position (same key) to update bounds/scores.
    
    bool replace = false;
    uint32_t old_key32 = entry.key32;
    uint32_t new_key32 = static_cast<uint32_t>(key >> 32);
    
    if (old_key32 == new_key32) {
        replace = true; // Same position, update it
    } else if (entry.age != current_age) {
        replace = true; // Old entry, overwrite
    } else if (depth >= entry.depth) {
        replace = true; // New search is deeper or equal, overwrite
    }
    
    if (replace) {
        entry.key32 = new_key32;
        entry.score = static_cast<int16_t>(score);
        entry.depth = static_cast<int8_t>(depth);
        entry.flag = static_cast<uint8_t>(flag);
        entry.age = current_age;
        
        // If the new move is null but we already have a move in the table for this position,
        // preserve the old move (it might be a cutoff move from a previous shallower search)
        if (move.is_ok() || old_key32 != new_key32) {
            entry.move = move.value();
        }
    }
}
