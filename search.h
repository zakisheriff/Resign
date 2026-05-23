#ifndef SEARCH_H
#define SEARCH_H

#include "position.h"
#include <atomic>
#include <vector>
#include <thread>
#include <mutex>
#include <condition_variable>

// ============================================================================
// Time Management
// ============================================================================

struct SearchLimits {
    bool infinite = false;
    int depth = 0;
    int time[2] = {0, 0};
    int inc[2] = {0, 0};
    int movetime = 0;
    int movestogo = 0;
    uint64_t nodes = 0;
};

extern std::atomic<bool> stop_search;

// ============================================================================
// Lazy SMP Thread
// ============================================================================

class SearchThread {
public:
    SearchThread(int id);
    ~SearchThread();
    
    void start_search(const Position& pos, const SearchLimits& limits);
    void wait_for_search_finish();
    
    uint64_t get_nodes() const { return nodes; }
    
    // Commands for the thread loop
    std::atomic<bool> exit_flag;
    std::atomic<bool> is_searching;
    
private:
    void loop();
    void search();
    
    int alpha_beta(Position& pos, int depth, int alpha, int beta, int ply, bool do_null);
    int quiescence(Position& pos, int alpha, int beta, int ply);
    
    void check_time();

    int thread_id;
    uint64_t nodes;
    Position root_pos;
    SearchLimits limits;
    
    std::thread worker;
    std::mutex mtx;
    std::condition_variable cv;
    
    int64_t start_time_ms;
    int64_t allocated_time_ms;
};

// ============================================================================
// Thread Pool
// ============================================================================

class ThreadPool {
public:
    ThreadPool() {}
    ~ThreadPool() { clear(); }

    void init(int num_threads);
    void clear();
    
    void start_search(const Position& pos, const SearchLimits& limits);
    void stop();
    
    uint64_t get_total_nodes() const;
    
    std::vector<SearchThread*> threads;
};

extern ThreadPool Threads;

// Utility to get current time in milliseconds
int64_t now_ms();

#endif // SEARCH_H
