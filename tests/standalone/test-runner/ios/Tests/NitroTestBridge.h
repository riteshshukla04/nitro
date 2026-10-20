#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// JavaScript cases that run in order in one Hermes runtime.
NS_SWIFT_SENDABLE
@interface NitroTestGroup : NSObject

- (instancetype)initWithName:(NSString*)name cases:(NSArray<NSString*>*)cases NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

@property(nonatomic, readonly, copy) NSString* name;
@property(nonatomic, readonly, copy) NSArray<NSString*>* cases;

@end

/// Runs groups of JavaScript cases, each group in its own Hermes runtime on a
/// dedicated worker thread. A failed case gets the rest of its group a fresh runtime.
NS_SWIFT_SENDABLE
@interface NitroTestScheduler : NSObject

/// Groups start in the given order. `sourceMap` is the bundle's source map, which
/// lets failures report TypeScript locations. `onCaseStarted` runs on a worker thread
/// after setup, right before each case. `onGroupFinished` receives a one-line
/// JSON timing report after each group's runtime was destroyed.
- (nullable instancetype)initWithBundle:(NSString*)bundle
                                 groups:(NSArray<NitroTestGroup*>*)groups
                                workers:(NSUInteger)workers
                              timeoutMs:(uint32_t)timeoutMs
                              sourceMap:(nullable NSString*)sourceMap
                          onCaseStarted:(void(NS_SWIFT_SENDABLE ^ _Nullable)(NSString* name))onCaseStarted
                        onGroupFinished:(void(NS_SWIFT_SENDABLE ^ _Nullable)(NSString* report))onGroupFinished
                                  error:(NSError**)error NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

/// Calls `completion` exactly once, on any thread. `failure` is nil on success;
/// otherwise it holds the assertion or native exception, including the JS stack.
- (void)runCase:(NSString*)name completion:(void(NS_SWIFT_SENDABLE ^)(NSString* _Nullable failure, double durationMs))completion;

/// Highest number of groups that ran at the same time.
@property(nonatomic, readonly) NSUInteger peakConcurrency;

@end

NS_ASSUME_NONNULL_END
