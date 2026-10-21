#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace margelo::nitro::testing {

// Each call owns a fresh Hermes runtime on the calling thread. Native fixtures
// must be registered first. An empty result means success; failures include the
// test name and JS stack. No C++ exception crosses the Swift/JNI boundary.
// Bundle compilation is cached outside the JS deadlines. Setup and execution
// each receive timeoutMs; getNitroTestTimeoutMs(name) can override execution only.
// onTestStarted lets runner contract tests synchronize two initialized runtimes.
std::string runTest(const std::string& bundle, const std::string& name, uint32_t timeoutMs = 10000,
                    const std::function<void()>& onTestStarted = {});

// Runs the cases of one test file in order, in one Hermes runtime owned by the
// calling thread, and returns one runTest()-style result per case. After a case
// passes, work it already queued runs before the next case starts. A failed case
// may leave work behind, so the cases after it get a fresh runtime. A non-empty
// sourceMap is the bundle's source map, which JS reads through
// `__nitroTestSourceMap()` to report failures at their TypeScript locations.
std::vector<std::string> runTests(const std::string& bundle, const std::vector<std::string>& names, uint32_t timeoutMs = 10000,
                                  const std::string& sourceMap = "");

} // namespace margelo::nitro::testing
