LIBPD_DIR = ../../libpd
PATCH_DIR = pd
SRC_FILES = main.cpp hello.cpp
TARGET = main.html
PD_DIR = pd
OUTPUT_FILES = $(TARGET) main.js main.data main.wasm

CXXFLAGS = -I$(LIBPD_DIR)/pure-data/src -I$(LIBPD_DIR)/cpp -I$(LIBPD_DIR)/libpd_wrapper -I$(LIBPD_DIR)/libpd_wrapper/util -O3
LDFLAGS = -L$(LIBPD_DIR)/libs -lpd -lm

.PHONY: clean clobber

$(TARGET): $(SRC_FILES) $(PATCH_DIR)
	emcc $(CXXFLAGS) --bind -o $(TARGET) $(SRC_FILES) --closure 1 -s USE_SDL=2 -s ERROR_ON_UNDEFINED_SYMBOLS=0 --preload-file $(PATCH_DIR) $(LDFLAGS)

clean:
	rm -f $(OUTPUT_FILES)