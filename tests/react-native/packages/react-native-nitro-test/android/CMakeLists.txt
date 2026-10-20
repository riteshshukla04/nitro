cmake_minimum_required(VERSION 3.22.1)
project(NitroTest LANGUAGES C CXX)

set (PACKAGE_NAME NitroTest)

# Define C++ library and add all sources
add_library(${PACKAGE_NAME} SHARED
        src/main/cpp/cpp-adapter.cpp
        ../cpp/HybridBenchmarkObjectCpp.cpp
)
target_compile_features(${PACKAGE_NAME} PUBLIC cxx_std_20)

# Add Nitrogen specs :)
include(${CMAKE_CURRENT_SOURCE_DIR}/../nitrogen/generated/android/NitroTest+autolinking.cmake)

# Set up local includes
target_include_directories(${PACKAGE_NAME} PRIVATE
        "src/main/cpp"
        "../cpp"
)

find_library(LOG_LIB log)

# Link all libraries together
target_link_libraries(
        ${PACKAGE_NAME}
        ${LOG_LIB}
        android                                   # <-- Android core
)
