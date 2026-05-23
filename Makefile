CXX = g++
CXXFLAGS = -O3 -march=native -std=c++17 -Wall -Wextra -pthread -DUSE_NEON -Isyzygy

SOURCES = bitboard.cpp position.cpp movegen.cpp evaluate.cpp tt.cpp movepick.cpp search.cpp uci.cpp main.cpp nnue/nnue.cpp nnue/misc.cpp syzygy/tbprobe.cpp
OBJECTS = $(SOURCES:.cpp=.o)
EXECUTABLE = resign

all: $(EXECUTABLE)

$(EXECUTABLE): $(OBJECTS)
	$(CXX) $(CXXFLAGS) -o $@ $^

%.o: %.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	rm -f $(OBJECTS) $(EXECUTABLE) movegen_test
