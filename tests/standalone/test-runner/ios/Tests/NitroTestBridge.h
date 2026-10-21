#import <Foundation/Foundation.h>

/// Runs one named JS test. A nil result means success; otherwise the string
/// contains the assertion or native exception, including the JS stack.
FOUNDATION_EXPORT NSString* _Nullable NitroRunTest(NSString* _Nonnull bundle, NSString* _Nonnull name, uint32_t timeoutMs,
                                                   void (^_Nullable onTestStarted)(void));

/// Runs the named JS tests of one test file in order, in one Hermes runtime.
/// Returns the failure of every case that failed, keyed by its name, in the
/// same format as `NitroRunTest`. Passing cases have no entry.
FOUNDATION_EXPORT NSDictionary<NSString*, NSString*>* _Nonnull NitroRunTests(NSString* _Nonnull bundle, NSArray<NSString*>* _Nonnull names,
                                                                             uint32_t timeoutMs);
