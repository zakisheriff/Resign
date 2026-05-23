#ifndef TYPES_H
#define TYPES_H

#include <cstdint>

// ============================================================================
// Core Types
// ============================================================================

// Color represents the side to move
enum Color { 
    WHITE, 
    BLACK, 
    COLOR_NB = 2 
};

// PieceType represents the kind of piece regardless of color
enum PieceType {
    PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, 
    NO_PIECE_TYPE, 
    PIECE_TYPE_NB = 6
};

// Piece represents a colored piece on the board.
// Designed such that piece = make_piece(color, piece_type) = (color << 3) | piece_type
enum Piece {
    W_PAWN = 0, W_KNIGHT, W_BISHOP, W_ROOK, W_QUEEN, W_KING,
    B_PAWN = 8, B_KNIGHT, B_BISHOP, B_ROOK, B_QUEEN, B_KING,
    NO_PIECE = 16
};

// Square represents a square on the chessboard from A1 to H8.
enum Square : int {
    SQ_A1, SQ_B1, SQ_C1, SQ_D1, SQ_E1, SQ_F1, SQ_G1, SQ_H1,
    SQ_A2, SQ_B2, SQ_C2, SQ_D2, SQ_E2, SQ_F2, SQ_G2, SQ_H2,
    SQ_A3, SQ_B3, SQ_C3, SQ_D3, SQ_E3, SQ_F3, SQ_G3, SQ_H3,
    SQ_A4, SQ_B4, SQ_C4, SQ_D4, SQ_E4, SQ_F4, SQ_G4, SQ_H4,
    SQ_A5, SQ_B5, SQ_C5, SQ_D5, SQ_E5, SQ_F5, SQ_G5, SQ_H5,
    SQ_A6, SQ_B6, SQ_C6, SQ_D6, SQ_E6, SQ_F6, SQ_G6, SQ_H6,
    SQ_A7, SQ_B7, SQ_C7, SQ_D7, SQ_E7, SQ_F7, SQ_G7, SQ_H7,
    SQ_A8, SQ_B8, SQ_C8, SQ_D8, SQ_E8, SQ_F8, SQ_G8, SQ_H8,
    SQ_NONE,
    SQUARE_NB = 64
};

// Direction offsets for squares
enum Direction : int {
    NORTH =  8,
    EAST  =  1,
    SOUTH = -8,
    WEST  = -1,
    NORTH_EAST =  9,
    NORTH_WEST =  7,
    SOUTH_EAST = -7,
    SOUTH_WEST = -9
};

// Move types for move encoding
enum MoveType {
    NORMAL, CASTLING, EN_PASSANT, PROMOTION
};

// Move encoded as uint32_t
// Bits 0-5:   Destination square (0-63)
// Bits 6-11:  Origin square (0-63)
// Bits 12-13: Move type (0-3)
// Bits 14-16: Promotion piece type (0-7)
class Move {
    uint32_t data;
public:
    Move() : data(0) {}
    explicit Move(uint32_t d) : data(d) {}
    Move(Square from, Square to, MoveType type = NORMAL, PieceType pt = NO_PIECE_TYPE) {
        data = to | (from << 6) | (type << 12) | (pt << 14);
    }
    
    Square to() const { return static_cast<Square>(data & 0x3F); }
    Square from() const { return static_cast<Square>((data >> 6) & 0x3F); }
    MoveType type() const { return static_cast<MoveType>((data >> 12) & 0x3); }
    PieceType promotion_piece() const { return static_cast<PieceType>((data >> 14) & 0x7); }
    
    bool operator==(const Move& m) const { return data == m.data; }
    bool operator!=(const Move& m) const { return data != m.data; }
    
    uint32_t value() const { return data; }
    
    // A null move check
    bool is_ok() const { return data != 0; }
};

// Core typedefs
typedef int32_t Value;
typedef int Depth;
typedef int Ply;
typedef uint64_t Bitboard;

// ============================================================================
// Constants
// ============================================================================

constexpr Value VALUE_INFINITE = 32000;
constexpr Value VALUE_MATE = 31000;
constexpr Value VALUE_DRAW = 0;
constexpr int MAX_MOVES = 256;
constexpr int MAX_PLY = 256;

// Compile-time piece values for evaluation (in centipawns)
constexpr Value PIECE_VALUE[PIECE_TYPE_NB] = {
    100, // PAWN
    320, // KNIGHT
    330, // BISHOP
    500, // ROOK
    900, // QUEEN
    0    // KING
};

// ============================================================================
// Operator Overloads & Utilities
// ============================================================================

// Flip color (WHITE -> BLACK, BLACK -> WHITE)
inline Color operator~(Color c) {
    return static_cast<Color>(c ^ 1);
}

// Square arithmetic
inline Square operator+(Square s, Direction d) {
    return static_cast<Square>(static_cast<int>(s) + static_cast<int>(d));
}

inline Square operator-(Square s, Direction d) {
    return static_cast<Square>(static_cast<int>(s) - static_cast<int>(d));
}

inline Square& operator+=(Square& s, Direction d) {
    s = s + d;
    return s;
}

inline Square& operator-=(Square& s, Direction d) {
    s = s - d;
    return s;
}

// Utility to create a square from file (0-7) and rank (0-7)
inline constexpr Square make_square(int file, int rank) {
    return static_cast<Square>((rank << 3) + file);
}

// Utility to create a piece from color and piece type
inline constexpr Piece make_piece(Color c, PieceType pt) {
    return static_cast<Piece>((c << 3) | pt);
}

// Utility to get color of a piece
inline constexpr Color type_of_color(Piece p) {
    return static_cast<Color>(p >> 3);
}

// Utility to get piece type from a piece
inline constexpr PieceType type_of_piece(Piece p) {
    return static_cast<PieceType>(p & 7);
}

// Bitboard utilities
constexpr Bitboard FileABB = 0x0101010101010101ULL;
constexpr Bitboard FileBBB = FileABB << 1;
constexpr Bitboard FileCBB = FileABB << 2;
constexpr Bitboard FileDBB = FileABB << 3;
constexpr Bitboard FileEBB = FileABB << 4;
constexpr Bitboard FileFBB = FileABB << 5;
constexpr Bitboard FileGBB = FileABB << 6;
constexpr Bitboard FileHBB = FileABB << 7;

constexpr Bitboard Rank1BB = 0xFFULL;
constexpr Bitboard Rank2BB = Rank1BB << (8 * 1);
constexpr Bitboard Rank3BB = Rank1BB << (8 * 2);
constexpr Bitboard Rank4BB = Rank1BB << (8 * 3);
constexpr Bitboard Rank5BB = Rank1BB << (8 * 4);
constexpr Bitboard Rank6BB = Rank1BB << (8 * 5);
constexpr Bitboard Rank7BB = Rank1BB << (8 * 6);
constexpr Bitboard Rank8BB = Rank1BB << (8 * 7);

#endif // TYPES_H
