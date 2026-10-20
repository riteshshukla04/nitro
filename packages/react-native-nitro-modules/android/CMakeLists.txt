cmake_minimum_required(VERSION 3.22.1)
project(NitroModules)

set (CMAKE_VERBOSE_MAKEFILE ON)

# Find all C++ files (shared and platform specifics)
file(GLOB shared_files CONFIGURE_DEPENDS
     "../cpp/core/src/*.cpp"
     "../cpp/src/*.cpp"
)
file(GLOB android_files CONFIGURE_DEPENDS
     "src/main/cpp/src/*.cpp"
     "core/main/cpp/src/*.cpp"
)

# Create library "NitroModules" and add all C++ files to it
add_library(NitroModules SHARED
            ${shared_files}
            ${android_files}
)

# Specifies a path to native header files.
target_compile_features(NitroModules PUBLIC cxx_std_20)
target_include_directories(NitroModules PRIVATE
  # Shared Nitro Core public headers
  ../cpp/core/include
  # React Native C++ includes
  ../include
  src/main/cpp/turbomodule
  src/main/cpp/views
  # Android-specific Nitro Core C++ includes
  core/main/cpp
  core/main/cpp/core
  core/main/cpp/threading
  core/main/cpp/utils
)

# Find required libraries
find_library(LOG_LIB log)
find_package(fbjni REQUIRED CONFIG)
find_package(ReactAndroid REQUIRED CONFIG)

# Link all libraries together
target_link_libraries(
        NitroModules
        ${LOG_LIB}                                # <-- Logcat logger
        android                                   # <-- Android JNI core
        fbjni::fbjni                              # <-- Facebook C++ JNI helpers
        ReactAndroid::jsi                         # <-- RN: JSI
        ReactAndroid::reactnative                 # <-- RN: TurboModules
)
