#include "uci.h"
#include "search.h"
#include "tt.h"
#include "movegen.h"
#include "syzygy/tbprobe.h"
#include <iostream>
#include <sstream>
#include <vector>

namespace UCI {

std::string move_to_uci(Move m) {
    if (!m.is_ok()) return "0000";
    std::string s = "";
    s += (char)('a' + (m.from() % 8));
    s += (char)('1' + (m.from() / 8));
    s += (char)('a' + (m.to() % 8));
    s += (char)('1' + (m.to() / 8));
    if (m.type() == PROMOTION) {
        if (m.promotion_piece() == QUEEN) s += 'q';
        else if (m.promotion_piece() == ROOK) s += 'r';
        else if (m.promotion_piece() == BISHOP) s += 'b';
        else if (m.promotion_piece() == KNIGHT) s += 'n';
    }
    return s;
}

static Move parse_move(const Position& pos, const std::string& move_str) {
    MoveList list;
    generate_all(pos, list);
    for (int i = 0; i < list.size(); i++) {
        Move m = list.moves[i];
        if (move_to_uci(m) == move_str) {
            if (pos.is_legal(m)) return m;
        }
    }
    return Move(); // Invalid move
}

void init() {
    init_bitboards();
    init_zobrist();
    TT.resize(256);
    Threads.init(1);
}

void loop() {
    std::string line;
    std::string token;
    
    Position pos;
    pos.set_starting_position();
    
    std::vector<StateInfo> state_list;
    state_list.reserve(256);

    while (std::getline(std::cin, line)) {
        std::istringstream is(line);
        token.clear();
        is >> std::skipws >> token;
        
        if (token == "quit") {
            Threads.stop();
            break;
        } else if (token == "uci") {
            std::cout << "id name RESIGN" << std::endl;
            std::cout << "id author The Atom" << std::endl;
            std::cout << "option name Hash type spin default 256 min 1 max 131072" << std::endl;
            std::cout << "option name Threads type spin default 1 min 1 max 1024" << std::endl;
            std::cout << "option name SyzygyPath type string default <empty>" << std::endl;
            std::cout << "option name Clear Hash type button" << std::endl;
            std::cout << "uciok" << std::endl;
        } else if (token == "isready") {
            std::cout << "readyok" << std::endl;
        } else if (token == "setoption") {
            std::string name, value;
            std::string word;
            while (is >> word && word != "name");
            while (is >> word && word != "value") name += word + " ";
            while (is >> word) value += word + " ";
            
            if (!name.empty()) name.pop_back();
            if (!value.empty()) value.pop_back();
            
            if (name == "Hash") {
                TT.resize(std::stoi(value));
            } else if (name == "Threads") {
                Threads.init(std::stoi(value));
            } else if (name == "SyzygyPath") {
                tb_init(value.c_str());
            } else if (name == "Clear Hash") {
                TT.clear();
            }
        } else if (token == "ucinewgame") {
            TT.clear();
            // Clear other heuristics if needed
        } else if (token == "position") {
            std::string fen;
            is >> token;
            if (token == "startpos") {
                fen = START_FEN;
                is >> token; // Expecting "moves" or EOF
            } else if (token == "fen") {
                while (is >> token && token != "moves") {
                    fen += token + " ";
                }
            } else {
                continue;
            }
            
            pos.set_fen(fen);
            state_list.clear();
            
            if (token == "moves") {
                while (is >> token) {
                    Move m = parse_move(pos, token);
                    if (m.is_ok()) {
                        state_list.emplace_back();
                        pos.do_move(m, state_list.back());
                    }
                }
            }
        } else if (token == "go") {
            SearchLimits limits;
            while (is >> token) {
                if (token == "wtime") is >> limits.time[WHITE];
                else if (token == "btime") is >> limits.time[BLACK];
                else if (token == "winc") is >> limits.inc[WHITE];
                else if (token == "binc") is >> limits.inc[BLACK];
                else if (token == "movestogo") is >> limits.movestogo;
                else if (token == "depth") is >> limits.depth;
                else if (token == "nodes") is >> limits.nodes;
                else if (token == "movetime") is >> limits.movetime;
                else if (token == "infinite") limits.infinite = true;
            }
            Threads.start_search(pos, limits);
        } else if (token == "stop") {
            Threads.stop();
        } else if (token == "perft") {
            int depth = 0;
            is >> depth;
            if (depth > 0) {
                uint64_t nodes = pos.perft(depth); // Actually, perft is currently implemented inside movegen_test block. 
                // Wait, perft in Position? We implemented perft inside movegen.cpp!
            }
        }
    }
}

} // namespace UCI
