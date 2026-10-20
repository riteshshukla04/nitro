//
//  ReferenceState.hpp
//  react-native-nitro
//
//  Created by Marc Rousavy on 03.02.24.
//

#pragma once

#include <atomic>
#include <mutex>

namespace margelo::nitro::detail {

/**
 * Holds state for an `BorrowingReference` (or `WeakReference`).
 *
 * The state tracks the amount of strong- and weak- references to any kind of value,
 * `isDeleted` becomes true before value destruction begins. The mutex remains
 * locked until the destructor returns.
 *
 * Like the control block of a `std::shared_ptr`, all strong references together hold one weak reference,
 * so `weakRefCount` is the number of `WeakReference`s plus one until the final strong release finishes.
 * This way exactly one reference (the last `WeakReference`, or the last `BorrowingReference`) sees `weakRefCount`
 * drop to zero and deletes the state, even if they are released on different Threads.
 *
 * The mutex lets cache pruning and runtime teardown wait for destruction to finish. Ordinary
 * weak-reference queries do not wait, so destructors can query other references.
 */
struct ReferenceState {
  std::atomic_size_t strongRefCount;
  std::atomic_size_t weakRefCount;
  std::atomic<bool> isDeleted;
  std::mutex mutex;

  /**
   * Decrements the strong ref count by one, and returns whether the value should be deleted.
   */
  inline bool decrementStrongRefCount() {
    size_t oldRefCount = strongRefCount.fetch_sub(1);
    return oldRefCount <= 1;
  }

  /**
   * Decrements the weak ref count by one, and returns whether the state should be deleted.
   */
  inline bool decrementWeakRefCount() {
    size_t oldRefCount = weakRefCount.fetch_sub(1);
    return oldRefCount <= 1;
  }

  explicit ReferenceState() : strongRefCount(1), weakRefCount(1), isDeleted(false) {}
};

} // namespace margelo::nitro::detail
