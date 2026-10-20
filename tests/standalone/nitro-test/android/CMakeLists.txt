cmake_minimum_required(VERSION 3.22.1)
project(NitroTest LANGUAGES C CXX)

set_property(GLOBAL PROPERTY JOB_POOLS nitro_compile=2)
set(CMAKE_JOB_POOL_COMPILE nitro_compile)

set(GENERATED "${CMAKE_CURRENT_LIST_DIR}/../nitrogen/generated")

find_package(hermes REQUIRED CONFIG)
find_package(nitro-test-external REQUIRED CONFIG)

add_library(NitroTest SHARED
  ../cpp/HybridTestObjectCpp.cpp
  src/main/cpp/JNIOnLoad.cpp)
include("${GENERATED}/android/NitroTest+autolinking.cmake")
target_compile_options(NitroTest PRIVATE -frtti -fexceptions -Wall -Wextra)
target_include_directories(NitroTest PRIVATE
  ../cpp)
target_link_libraries(NitroTest
  nitro-test-external::NitroTestExternal hermes::hermesvm android log)

include("${CMAKE_CURRENT_LIST_DIR}/../../test-runner/android/sanitizer.cmake")
nitro_apply_test_sanitizer(NitroTest)
