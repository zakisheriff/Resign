#ifndef UCI_H
#define UCI_H

#include "position.h"
#include <string>

namespace UCI {
    // Initialize global tables and engine components
    void init();
    
    // Enter the main UCI command loop
    void loop();
    
    // Expose move to UCI converter globally if needed
    std::string move_to_uci(Move m);
}

#endif // UCI_H
