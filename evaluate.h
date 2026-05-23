#ifndef EVALUATE_H
#define EVALUATE_H

#include "position.h"

// Evaluates the given position and returns a score in centipawns
// from the perspective of the side to move.
Value evaluate(const Position& pos);

#endif // EVALUATE_H
