#include "uci.h"
#include "nnue/nnue.h"
#include "evaluate.h"
#include <iostream>
#include <fstream>

int main(int argc, char* argv[]) {
    // Suppress unused parameter warnings
    (void)argc;
    (void)argv;
    
    // Disable output buffering for reliable UCI communication
    std::setvbuf(stdout, NULL, _IONBF, 0);
    
    // Initialize engine components
    UCI::init();
    
    // Load NNUE
    std::string nnue_path = "nn-62ef826d1a6d.nnue";
    std::ifstream f(nnue_path.c_str());
    if (f.good()) {
        f.close();
        nnue_init(nnue_path.c_str());
        nnue_loaded = true;
    } else {
        std::cout << "info string Warning: NNUE network " << nnue_path << " not found. Falling back to handcrafted evaluation." << std::endl;
        nnue_loaded = false;
    }
    
    // Enter the UCI loop
    UCI::loop();
    
    return 0;
}
