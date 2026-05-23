#ifndef MOVEPICK_H
#define MOVEPICK_H

#include "movegen.h"

// ============================================================================
// Move Ordering Constants
// ============================================================================

constexpr int SCORE_HASH = 10000000;
constexpr int SCORE_GOOD_CAPTURE = 8000000;
constexpr int SCORE_KILLER_1 = 7000000;
constexpr int SCORE_KILLER_2 = 6000000;
constexpr int SCORE_COUNTER = 5000000;
constexpr int SCORE_HISTORY_BASE = 0;
constexpr int SCORE_BAD_CAPTURE = -1000000;

enum MovePickStage {
    STAGE_HASH,
    STAGE_GEN_CAPTURES,
    STAGE_GOOD_CAPTURES,
    STAGE_KILLER_1,
    STAGE_KILLER_2,
    STAGE_GEN_QUIETS,
    STAGE_QUIETS,
    STAGE_BAD_CAPTURES
};

// ============================================================================
// Global Heuristics Tables
// ============================================================================

extern int history_table[COLOR_NB][SQUARE_NB][SQUARE_NB];
extern Move killer_table[MAX_PLY][2];

void clear_history();
void update_history(Color c, Move m, int bonus);
void update_killers(Move m, int ply);

// ============================================================================
// MovePicker
// ============================================================================

struct ScoredMove {
    Move move;
    int score;
    ScoredMove() : score(0) {}
    ScoredMove(Move m, int s) : move(m), score(s) {}
};

class MovePicker {
public:
    // Initialize move picker for regular search
    MovePicker(const Position& pos, Move hash_move, int ply, Move counter_move = Move());
    
    // Initialize move picker for Quiescence search
    MovePicker(const Position& pos, Move hash_move);

    // Returns the next best move, or a null move if all moves have been searched
    Move next_move();

private:
    const Position& pos;
    Move hash_move;
    Move counter_move;
    int ply;
    MovePickStage stage;
    bool quiescence;
    
    ScoredMove moves[MAX_MOVES];
    int num_moves;
    int current_index;
    
    // Bad captures are deferred to the end of the search
    Move bad_captures[MAX_MOVES];
    int num_bad_captures;
    int current_bad_capture;

    void score_captures();
    void score_quiets();
    Move pick_best();
    
    int mvv_lva(Move m) const;
};

// Static Exchange Evaluation (for good vs bad captures)
bool see_ge(const Position& pos, Move m, int threshold = 0);

#endif // MOVEPICK_H
