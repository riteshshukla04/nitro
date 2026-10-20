#import "NitroTestBridge.h"
#include "TestRuntime.hpp"
#include <cmath>
#include <exception>
#include <memory>

using namespace margelo::nitro::testing;

static NSString* toNSString(const std::string& string) {
  return [[NSString alloc] initWithBytes:string.data() length:string.size() encoding:NSUTF8StringEncoding]
             ?: @"Native test failure could not be decoded as UTF-8.";
}

@implementation NitroTestGroup

- (instancetype)initWithName:(NSString*)name cases:(NSArray<NSString*>*)cases {
  if (self = [super init]) {
    _name = [name copy];
    _cases = [cases copy];
  }
  return self;
}

@end

@implementation NitroTestScheduler {
  std::unique_ptr<TestScheduler> _scheduler;
}

- (nullable instancetype)initWithBundle:(NSString*)bundle
                                 groups:(NSArray<NitroTestGroup*>*)groups
                                workers:(NSUInteger)workers
                              timeoutMs:(uint32_t)timeoutMs
                          onCaseStarted:(void (^)(NSString*))onCaseStarted
                        onGroupFinished:(void (^)(NSString*))onGroupFinished
                                  error:(NSError**)error {
  if (!(self = [super init]))
    return nil;
  try {
    std::vector<TestGroup> nativeGroups;
    nativeGroups.reserve(groups.count);
    for (NitroTestGroup* group in groups) {
      TestGroup nativeGroup{group.name.UTF8String, {}};
      nativeGroup.cases.reserve(group.cases.count);
      for (NSString* name in group.cases)
        nativeGroup.cases.emplace_back(name.UTF8String);
      nativeGroups.push_back(std::move(nativeGroup));
    }
    TestSchedulerOptions options;
    options.workers = workers;
    options.timeoutMs = timeoutMs;
    if (onCaseStarted) {
      void (^block)(NSString*) = [onCaseStarted copy];
      options.onCaseStarted = [block](const std::string& name) { block(toNSString(name)); };
    }
    if (onGroupFinished) {
      void (^block)(NSString*) = [onGroupFinished copy];
      options.onGroupFinished = [block, workers](const TestGroupReport& report) {
        @autoreleasepool {
          NSDictionary* fields = @{
            @"name" : toNSString(report.name),
            @"cases" : @(report.cases),
            @"failures" : @(report.failures),
            @"runtimes" : @(report.runtimes),
            @"setupMs" : @(std::round(report.setupMs)),
            @"casesMs" : @(std::round(report.casesMs)),
            @"teardownMs" : @(std::round(report.teardownMs)),
            @"workers" : @(workers),
          };
          NSData* json = [NSJSONSerialization dataWithJSONObject:fields options:NSJSONWritingSortedKeys error:nil];
          block([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding]);
        }
      };
    }
    // Worker threads have no autorelease pool of their own. Drain whatever
    // Swift and Objective-C fixtures autorelease after every case.
    options.caseScope = [](const std::function<void()>& body) {
      @autoreleasepool {
        body();
      }
    };
    _scheduler = std::make_unique<TestScheduler>(bundle.UTF8String, std::move(nativeGroups), std::move(options));
  } catch (const std::exception& exception) {
    if (error)
      *error = [NSError errorWithDomain:@"NitroTestScheduler" code:1 userInfo:@{NSLocalizedDescriptionKey : toNSString(exception.what())}];
    return nil;
  }
  return self;
}

- (void)runCase:(NSString*)name completion:(void (^)(NSString* _Nullable, double))completion {
  void (^block)(NSString* _Nullable, double) = [completion copy];
  _scheduler->request(name.UTF8String, [block](const TestCaseResult& result) {
    @autoreleasepool {
      block(result.failure.empty() ? nil : toNSString(result.failure), result.durationMs);
    }
  });
}

- (NSUInteger)peakConcurrency {
  return _scheduler->peakConcurrency();
}

@end
