#import "NitroTestBridge.h"
#include "TestRuntime.hpp"
#include <exception>
#include <string>
#include <vector>

static NSString* toNSString(const std::string& string) {
  return [[NSString alloc] initWithBytes:string.data() length:string.size() encoding:NSUTF8StringEncoding]
             ?: @"Native test failure could not be decoded as UTF-8.";
}

NSString* _Nullable NitroRunTest(NSString* bundle, NSString* name, uint32_t timeoutMs, void (^onTestStarted)(void)) {
  try {
    auto failure = margelo::nitro::testing::runTest(bundle.UTF8String, name.UTF8String, timeoutMs, [onTestStarted] {
      if (onTestStarted)
        onTestStarted();
    });
    if (failure.empty()) {
      return nil;
    }
    return toNSString(failure);
  } catch (const std::exception& error) {
    return [NSString stringWithUTF8String:error.what()] ?: @"Native exception could not be decoded as UTF-8.";
  } catch (...) {
    return @"Unknown native exception while running the JavaScript test.";
  }
}

NSDictionary<NSString*, NSString*>* NitroRunTests(NSString* bundle, NSArray<NSString*>* names, uint32_t timeoutMs) {
  NSMutableDictionary<NSString*, NSString*>* failures = [NSMutableDictionary dictionary];
  try {
    std::vector<std::string> nativeNames;
    nativeNames.reserve(names.count);
    for (NSString* name in names)
      nativeNames.emplace_back(name.UTF8String);
    auto results = margelo::nitro::testing::runTests(bundle.UTF8String, nativeNames, timeoutMs);
    for (size_t index = 0; index < results.size() && index < names.count; index++) {
      if (!results[index].empty())
        failures[names[index]] = toNSString(results[index]);
    }
  } catch (const std::exception& error) {
    NSString* message = [NSString stringWithUTF8String:error.what()] ?: @"Native exception could not be decoded as UTF-8.";
    for (NSString* name in names)
      failures[name] = message;
  } catch (...) {
    for (NSString* name in names)
      failures[name] = @"Unknown native exception while running the JavaScript tests.";
  }
  return failures;
}
