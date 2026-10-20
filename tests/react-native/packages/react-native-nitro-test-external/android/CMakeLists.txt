cmake_minimum_required(VERSION 3.22.1)
project(NitroTestExternal LANGUAGES C CXX)

add_library(NitroTestExternal SHARED src/main/cpp/cpp-adapter.cpp)
target_compile_features(NitroTestExternal PUBLIC cxx_std_20)
include(${CMAKE_CURRENT_SOURCE_DIR}/../nitrogen/generated/android/NitroTestExternal+autolinking.cmake)

find_library(LOG_LIB log)
target_link_libraries(NitroTestExternal ${LOG_LIB} android)
