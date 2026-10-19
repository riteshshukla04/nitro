//
//  WeakReference+Borrowing.hpp
//  react-native-nitro
//
//  Created by Marc Rousavy on 23.06.24.
//

#pragma once

#include <NitroModules/BorrowingReference.hpp>

namespace margelo::nitro {

template <typename T>
WeakReference<T>::WeakReference(const BorrowingReference<T>& ref) {
  _value = ref._value;
  _state = ref._state;
  if (_state != nullptr) {
    _state->weakRefCount++;
  }
}

template <typename T>
BorrowingReference<T> WeakReference<T>::lock() const {
  if (_state == nullptr) {
    return BorrowingReference<T>();
  }

  std::unique_lock lock(_state->mutex);

  if (_state->isDeleted) {
    // return nullptr
    return BorrowingReference<T>();
  }

  // only acquire a strong reference if there still is one - once the last strong reference
  // has been released (possibly on another Thread), the value is about to be deleted.
  size_t strongRefCount = _state->strongRefCount.load();
  do {
    if (strongRefCount == 0) {
      // return nullptr
      return BorrowingReference<T>();
    }
  } while (!_state->strongRefCount.compare_exchange_weak(strongRefCount, strongRefCount + 1));

  return BorrowingReference(*this);
}

} // namespace margelo::nitro
