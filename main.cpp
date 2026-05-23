#include "uci.h"
#include <iostream>

int main(int argc, char* argv[]) {
    // Suppress unused parameter warnings
    (void)argc;
    (void)argv;
    
    // Disable output buffering for reliable UCI communication
    std::setvbuf(stdout, NULL, _IONBF, 0);
    
    // Initialize engine components
    UCI::init();
    
    // Enter the UCI loop
    UCI::loop();
    
    return 0;
}
