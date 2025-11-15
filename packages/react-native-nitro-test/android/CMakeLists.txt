project(NitroTest)
cmake_minimum_required(VERSION 3.9.0)

set (PACKAGE_NAME NitroTest)
set (CMAKE_VERBOSE_MAKEFILE ON)
set (CMAKE_CXX_STANDARD 20)

# Define C++ library and add all sources
add_library(${PACKAGE_NAME} SHARED
        src/main/cpp/cpp-adapter.cpp
        ../cpp/HybridTestObjectCpp.cpp
)

# Add Nitrogen specs :)
include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/NitroTest+autolinking.cmake)

# Determine target architecture
if(ANDROID_ABI STREQUAL "armeabi-v7a")
    set(RUST_TARGET "armv7-linux-androideabi")
elseif(ANDROID_ABI STREQUAL "arm64-v8a")
    set(RUST_TARGET "aarch64-linux-android")
elseif(ANDROID_ABI STREQUAL "x86")
    set(RUST_TARGET "i686-linux-android")
elseif(ANDROID_ABI STREQUAL "x86_64")
    set(RUST_TARGET "x86_64-linux-android")
else()
    message(FATAL_ERROR "Unsupported Android ABI: ${ANDROID_ABI}")
endif()



set(RUST_LIB_DIR "${CMAKE_SOURCE_DIR}/../rust/target/${RUST_TARGET}/release")




# Set up local includes
include_directories(
        "src/main/cpp"
        "../cpp"
)

find_library(LOG_LIB log)
find_package(react-native-nitro-test-external REQUIRED)   # <-- for the SomeExternalObject type

# Link all libraries together
target_link_libraries(
        ${PACKAGE_NAME}
        ${RUST_LIB_DIR}/librust_module.a
        ${LOG_LIB}
        android                                   # <-- Android core
        react-native-nitro-test-external::NitroTestExternal
)
