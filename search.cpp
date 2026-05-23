#include "search.h"
#include "tt.h"
#include "evaluate.h"
#include "movepick.h"
#include "syzygy/tbprobe.h"
#include <iostream>
#include <chrono>
#include <algorithm>
#include <cmath>

std::atomic<bool> stop_search(false);
ThreadPool Threads;

int64_t now_ms() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now().time_since_epoch()
    ).count();
}

// ============================================================================
// SearchThread implementation
// ============================================================================

SearchThread::SearchThread(int id) : exit_flag(false), is_searching(false), thread_id(id), nodes(0) {
    worker = std::thread(&SearchThread::loop, this);
}

SearchThread::~SearchThread() {
    exit_flag = true;
    cv.notify_one();
    if (worker.joinable()) {
        worker.join();
    }
}

void SearchThread::start_search(const Position& pos, const SearchLimits& lim) {
    std::unique_lock<std::mutex> lock(mtx);
    root_pos = pos;
    limits = lim;
    nodes = 0;
    is_searching = true;
    cv.notify_one();
}

void SearchThread::wait_for_search_finish() {
    while (is_searching) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
}

void SearchThread::loop() {
    while (!exit_flag) {
        std::unique_lock<std::mutex> lock(mtx);
        cv.wait(lock, [this]{ return is_searching.load() || exit_flag.load(); });
        
        if (exit_flag) break;
        
        lock.unlock();
        
        search();
        
        is_searching = false;
    }
}

void SearchThread::check_time() {
    if (limits.infinite || limits.depth > 0 || limits.nodes > 0) return;
    
    if (now_ms() - start_time_ms >= allocated_time_ms) {
        stop_search = true;
    }
}

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

void SearchThread::search() {
    start_time_ms = now_ms();
    
    // Simple time management for Thread 0
    if (thread_id == 0 && !limits.infinite && limits.depth == 0) {
        Color us = root_pos.side_to_move();
        if (limits.movetime > 0) {
            allocated_time_ms = limits.movetime - 20; // 20ms buffer
        } else if (limits.time[us] > 0) {
            int moves_to_go = limits.movestogo > 0 ? limits.movestogo : 40;
            allocated_time_ms = limits.time[us] / moves_to_go + limits.inc[us] / 2;
            if (allocated_time_ms > limits.time[us] - 50) allocated_time_ms = limits.time[us] - 50;
        } else {
            allocated_time_ms = 1000; // default 1s
        }
        if (allocated_time_ms < 1) allocated_time_ms = 1;
    }

    int max_depth = limits.depth > 0 ? limits.depth : MAX_PLY - 1;
    Move best_move_root;
    int best_score_root = -VALUE_INFINITE;

    // Iterative Deepening
    for (int d = 1; d <= max_depth; ++d) {
        if (stop_search) break;
        
        if (thread_id == 0) {
            std::cout << "info string debug starting depth " << d << std::endl;
        }
        
        int alpha = -VALUE_INFINITE;
        int beta = VALUE_INFINITE;
        
        // Aspiration Windows
        if (d >= 4 && best_score_root != -VALUE_INFINITE) {
            alpha = std::max(-VALUE_INFINITE, best_score_root - 50);
            beta  = std::min( VALUE_INFINITE, best_score_root + 50);
        }
        
        int score;
        while (true) {
            score = alpha_beta(root_pos, d, alpha, beta, 0, false);
            if (stop_search) break;
            
            if (score <= alpha) {
                alpha = std::max(-VALUE_INFINITE, alpha - 200); // Fail low, widen window
            } else if (score >= beta) {
                beta = std::min(VALUE_INFINITE, beta + 200);    // Fail high, widen window
            } else {
                break; // Score is strictly inside the window
            }
        }
        
        if (stop_search) break;
        
        if (thread_id == 0) {
            std::cout << "info string debug finished depth " << d << " score " << score << std::endl;
        }

        
        // Output info only from Main Thread (ID = 0)
        if (thread_id == 0) {
            // Get best move from TT
            int tt_score;
            Move tt_move;
            TT.probe(root_pos.key(), 0, -VALUE_INFINITE, VALUE_INFINITE, tt_score, tt_move);
            if (tt_move.is_ok()) best_move_root = tt_move;
            best_score_root = score;
            
            int64_t time_spent = now_ms() - start_time_ms;
            uint64_t total_nodes = Threads.get_total_nodes();
            int nps = time_spent > 0 ? (total_nodes * 1000) / time_spent : 0;
            
            std::cout << "info depth " << d 
                      << " score cp " << score 
                      << " time " << time_spent 
                      << " nodes " << total_nodes 
                      << " nps " << nps;
            if (best_move_root.is_ok()) {
                std::cout << " pv " << move_to_uci(best_move_root);
            }
            std::cout << std::endl;
        }
        
        // Early stop logic
        if (thread_id == 0 && limits.movetime == 0 && limits.time[root_pos.side_to_move()] > 0) {
            int64_t time_spent = now_ms() - start_time_ms;
            if (time_spent > allocated_time_ms / 2) {
                break; // Don't start next depth if we've used more than half our target time
            }
        }
    }
    
    if (thread_id == 0) {
        std::cout << "bestmove " << move_to_uci(best_move_root) << std::endl;
    }
}

int SearchThread::quiescence(Position& pos, int alpha, int beta, int ply) {
    if ((nodes++ & 2047) == 0 && thread_id == 0) check_time();
    if (stop_search) return 0;
    
    if (pos.is_draw(ply)) return 0;
    if (ply >= MAX_PLY - 1) return evaluate(pos);
    
    bool in_check = pos.is_in_check();
    
    int stand_pat = -VALUE_INFINITE;
    if (!in_check) {
        stand_pat = evaluate(pos);
        if (stand_pat >= beta) return beta;
        if (alpha < stand_pat) alpha = stand_pat;
    }
    
    MovePicker picker(pos, Move()); // Quiescence picker
    Move m;
    int best_score = -VALUE_INFINITE;
    
    while ((m = picker.next_move()).is_ok()) {
        if (!pos.is_legal(m)) continue;
        
        StateInfo st;
        pos.do_move(m, st);
        int score = -quiescence(pos, -beta, -alpha, ply + 1);
        pos.undo_move(m);
        
        if (score > best_score) {
            best_score = score;
            if (score > alpha) {
                alpha = score;
                if (score >= beta) return beta;
            }
        }
    }
    
    if (in_check && best_score == -VALUE_INFINITE) {
        return -VALUE_MATE + ply;
    }
    
    return in_check ? best_score : std::max(stand_pat, best_score);
}

int SearchThread::alpha_beta(Position& pos, int depth, int alpha, int beta, int ply, bool do_null) {
    if (depth <= 0) {
        return quiescence(pos, alpha, beta, ply);
    }
    
    if ((nodes++ & 2047) == 0 && thread_id == 0) check_time();
    if (stop_search) return 0;
    
    if (ply > 0 && pos.is_draw(ply)) return 0;
    if (ply >= MAX_PLY - 1) return evaluate(pos);
    
    // Syzygy Endgame Tablebases Probe
    if (TB_LARGEST > 0 && popcount(pos.pieces()) <= TB_LARGEST) {
        int ep_sq = pos.state()->ep_square;
        unsigned ep = ep_sq == SQ_NONE ? 0 : ep_sq;
        unsigned res = tb_probe_wdl(
            pos.pieces(WHITE), pos.pieces(BLACK),
            pos.pieces(KING), pos.pieces(QUEEN), pos.pieces(ROOK),
            pos.pieces(BISHOP), pos.pieces(KNIGHT), pos.pieces(PAWN),
            pos.state()->half_move_clock, pos.state()->castling_rights,
            ep, pos.side_to_move() == WHITE);
            
        if (res != TB_RESULT_FAILED) {
            int wdl = TB_GET_WDL(res);
            int tb_score;
            if (wdl == TB_WIN) tb_score = 20000 - ply;
            else if (wdl == TB_LOSS) tb_score = -20000 + ply;
            else tb_score = 0;
            return tb_score;
        }
    }
    
    // Mate distance pruning
    alpha = std::max(alpha, -VALUE_MATE + ply);
    beta = std::min(beta, VALUE_MATE - ply - 1);
    if (alpha >= beta) return alpha;
    
    bool in_check = pos.is_in_check();
    if (in_check) depth++; // Check extension
    
    // TT Probe
    int tt_score = 0;
    Move tt_move;
    if (TT.probe(pos.key(), depth, alpha, beta, tt_score, tt_move)) {
        if (ply > 0) return TT.score_from_tt(tt_score, ply);
    }
    
    int eval = evaluate(pos);
    
    // Reverse Futility Pruning (Static Null Move Pruning)
    if (!in_check && depth <= 3 && !do_null && std::abs(beta) < VALUE_MATE - MAX_PLY) {
        int rfp_margin = 75 * depth;
        if (eval - rfp_margin >= beta) {
            return eval; // Fail-high statically
        }
    }
    
    // Adaptive Null Move Pruning
    if (do_null && !in_check && depth >= 3 && eval >= beta && pos.has_non_pawn_material(pos.side_to_move())) {
        int R = 3 + depth / 6;
        StateInfo st;
        pos.do_null_move(st);
        int null_score = -alpha_beta(pos, depth - R - 1, -beta, -beta + 1, ply + 1, false);
        pos.undo_null_move();
        
        if (null_score >= beta) {
            return beta;
        }
    }
    
    MovePicker picker(pos, tt_move, ply, Move());
    Move m;
    int best_score = -VALUE_INFINITE;
    Move best_move;
    int moves_searched = 0;
    
    while ((m = picker.next_move()).is_ok()) {
        if (!pos.is_legal(m)) continue;
        
        bool is_capture = pos.piece_on(m.to()) != NO_PIECE || m.type() == EN_PASSANT;
        
        // Futility Pruning
        if (depth == 1 && !in_check && !is_capture && m.type() != PROMOTION && best_score > -VALUE_MATE + MAX_PLY) {
            int fp_margin = 300; // Minor piece approx
            if (eval + fp_margin <= alpha) {
                continue; // Skip quiet moves if hopelessly behind
            }
        }
        
        StateInfo st;
        pos.do_move(m, st);
        moves_searched++;
        
        int score = 0;
        
        // PVS & LMR
        if (moves_searched == 1) {
            score = -alpha_beta(pos, depth - 1, -beta, -alpha, ply + 1, true);
        } else {
            int r = 0;
            // Late Move Reductions (LMR)
            if (depth >= 3 && moves_searched >= 4 && !in_check && !is_capture && m.type() != PROMOTION) {
                r = 1;
                if (moves_searched >= 8) r = 2;
            }
            
            score = -alpha_beta(pos, depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
            if (score > alpha && r > 0) {
                // Re-search without reduction
                score = -alpha_beta(pos, depth - 1, -alpha - 1, -alpha, ply + 1, true);
            }
            if (score > alpha && score < beta) {
                // Re-search full window
                score = -alpha_beta(pos, depth - 1, -beta, -alpha, ply + 1, true);
            }
        }
        
        pos.undo_move(m);
        
        if (score > best_score) {
            best_score = score;
            best_move = m;
            if (score > alpha) {
                alpha = score;
                if (score >= beta) {
                    if (!is_capture) {
                        update_history(pos.side_to_move(), m, depth * depth);
                        update_killers(m, ply);
                    }
                    TT.store(pos.key(), TT.score_to_tt(score, ply), depth, BOUND_LOWER, m);
                    return beta; // Fail-high
                }
            }
        }
    }
    
    if (moves_searched == 0) {
        if (in_check) return -VALUE_MATE + ply;
        return 0; // Stalemate
    }
    
    Bound bound = best_score >= beta ? BOUND_LOWER : (best_score > alpha ? BOUND_EXACT : BOUND_UPPER);
    TT.store(pos.key(), TT.score_to_tt(best_score, ply), depth, bound, best_move);
    
    return best_score;
}

// ============================================================================
// ThreadPool implementation
// ============================================================================

void ThreadPool::init(int num_threads) {
    clear();
    for (int i = 0; i < num_threads; ++i) {
        threads.push_back(new SearchThread(i));
    }
}

void ThreadPool::clear() {
    for (SearchThread* t : threads) {
        delete t;
    }
    threads.clear();
}

void ThreadPool::start_search(const Position& pos, const SearchLimits& limits) {
    stop_search = false;
    TT.new_search();
    clear_history(); // Usually history decays, but clear is ok for now
    
    for (SearchThread* t : threads) {
        t->start_search(pos, limits);
    }
}

void ThreadPool::stop() {
    stop_search = true;
    for (SearchThread* t : threads) {
        t->wait_for_search_finish();
    }
}

uint64_t ThreadPool::get_total_nodes() const {
    uint64_t nodes = 0;
    for (SearchThread* t : threads) {
        nodes += t->get_nodes();
    }
    return nodes;
}
