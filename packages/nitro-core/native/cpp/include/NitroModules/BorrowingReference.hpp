//
//  BorrowingReference.hpp
//  react-native-nitro
//
//  Created by Marc Rousavy on 23.06.24.
//

#pragma once

#include <NitroModules/NitroDefines.hpp>
#include <NitroModules/NitroTypeInfo.hpp>
#include <NitroModules/ReferenceState.hpp>
#include <NitroModules/WeakReference.hpp>
#include <atomic>
#include <cstddef>
#include <mutex>

namespace margelo::nitro {

/**
 * A `BorrowingReference<T>` is a smart-pointer that holds a strong reference to a pointer.
 * You can have multiple `BorrowingReference<T>` instances point to the same pointer, as they internally keep a ref-count.
 * As opposed to a `shared_ptr<T>`, a `BorrowingReference<T>` can also be imperatively manually deleted, even if there
 * are multiple strong references still holding onto the pointer.
 * This is useful in cases where the `BorrowingReference` might keep a reference alive, but an external value holder
 * is actually responsible for truly deleting the underlying value - like a `jsi::Runtime` for a `jsi::Value`.
 *
 * A `BorrowingReference<T>` can be weakified, which gives the user a `WeakReference<T>`.
 * A `WeakReference<T>` can be locked to get a `BorrowingReference<T>` again, assuming it has not been deleted yet.
 *
 * Default-constructed, moved-from, and reset (`ref = {}`) references have no value or shared state.
 * Weakifying them returns an empty reference; `destroy()` is a no-op.
 */
template <typename T>
class BorrowingReference final {
public:
  BorrowingReference() : _value(nullptr), _state(nullptr) {}

  explicit BorrowingReference(T* NULLABLE value) : _value(value), _state(new ReferenceState()) {}

  BorrowingReference(const BorrowingReference& ref) : _value(ref._value), _state(ref._state) {
    if (_state != nullptr) {
      // increment ref count after copy
      _state->strongRefCount++;
    }
  }

  BorrowingReference(BorrowingReference&& ref) noexcept : _value(ref._value), _state(ref._state) {
    ref._value = nullptr;
    ref._state = nullptr;
  }

  BorrowingReference& operator=(const BorrowingReference& ref) {
    if (this == &ref)
      return *this;

    if (_state != nullptr) {
      // destroy previous pointer
      release();
    }

    _value = ref._value;
    _state = ref._state;
    if (_state != nullptr) {
      // increment new pointer
      _state->strongRefCount++;
    }

    return *this;
  }

  BorrowingReference& operator=(BorrowingReference&& ref) noexcept {
    if (this == &ref)
      return *this;

    if (_state != nullptr) {
      // destroy previous pointer
      release();
    }

    _value = ref._value;
    _state = ref._state;
    ref._value = nullptr;
    ref._state = nullptr;

    return *this;
  }

private:
  // WeakReference<T> -> BorrowingReference<T> Lock-constructor.
  // Adopts the strong reference that `WeakReference<T>::lock()` already acquired.
  explicit BorrowingReference(const WeakReference<T>& ref) : _value(ref._value), _state(ref._state) {}

public:
  ~BorrowingReference() {
    if (_state == nullptr) {
      // we are just a dangling nullptr.
      return;
    }

    // decrement strong ref count on destroy
    release();
  }

public:
  /**
   * Get whether the `BorrowingReference<T>` is still pointing to a valid value, or not.
   */
  [[nodiscard]]
  inline bool hasValue() const {
    return _value != nullptr && !_state->isDeleted;
  }

  /**
   * Get a weak reference to this borrowing reference.
   */
  [[nodiscard]]
  WeakReference<T> weak() const {
    return WeakReference(*this);
  }

  /**
   * Delete and destroy the value this BorrowingReference is pointing to.
   * This can even be called if there are still multiple strong references to the value.
   */
  void destroy() {
    if (_state == nullptr) {
      return;
    }

    std::unique_lock lock(_state->mutex);

    forceDestroyValue();
  }

public:
  // Dereference (*)
  inline T& operator*() const {
#ifdef NITRO_DEBUG
    if (!hasValue()) [[unlikely]] {
      std::string typeName = TypeInfo::getFriendlyTypename<T>(true);
      throw std::runtime_error("Tried to dereference (*) nullptr BorrowingReference<" + typeName + ">!");
    }
#endif
    return *_value;
  }

  // Dereference (->)
  inline T* NON_NULL operator->() const {
#ifdef NITRO_DEBUG
    if (!hasValue()) [[unlikely]] {
      std::string typeName = TypeInfo::getFriendlyTypename<T>(true);
      throw std::runtime_error("Tried to dereference (->) nullptr BorrowingReference<" + typeName + ">!");
    }
#endif
    return _value;
  }

  // null-check (bool)
  explicit inline operator bool() const {
    return hasValue();
  }
  // null-check (== nullptr)
  inline bool operator==(std::nullptr_t) const {
    return !hasValue();
  }
  // null-check (!= nullptr)
  inline bool operator!=(std::nullptr_t) const {
    return hasValue();
  }

  // comparison (== *)
  inline bool operator==(T* NULLABLE other) const {
    return _value == other;
  }
  // comparison (!= *)
  inline bool operator!=(T* NULLABLE other) const {
    return _value != other;
  }

  // comparison (== BorrowingReference<T>)
  inline bool operator==(const BorrowingReference<T>& other) const {
    return _value == other._value;
  }
  // comparison (!= BorrowingReference<T>)
  inline bool operator!=(const BorrowingReference<T>& other) const {
    return _value != other._value;
  }

private:
  void release() {
    bool shouldDestroy = _state->decrementStrongRefCount();
    if (shouldDestroy) {
      // we were the last strong reference - delete the value, then drop the weak reference all strong references share
      forceDestroyValue();
      if (_state->decrementWeakRefCount()) {
        // free the full memory if there are no more references at all
        delete _state;
      }
    }
    _state = nullptr;
  }

  void forceDestroyValue() {
    if (_state->isDeleted) [[unlikely]] {
      // it has already been destroyed.
      return;
    }
    delete _value;
    _value = nullptr;
    _state->isDeleted = true;
  }

public:
  friend class WeakReference<T>;

private:
  T* NULLABLE _value;
  ReferenceState* NULLABLE _state;
};

} // namespace margelo::nitro

#include <NitroModules/WeakReference+Borrowing.hpp>
