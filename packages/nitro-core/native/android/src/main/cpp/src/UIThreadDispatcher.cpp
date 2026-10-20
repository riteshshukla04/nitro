//
// Created by Marc Rousavy on 29.01.26.
//

#include "UIThreadDispatcher.hpp"
#include "JNativeRunnable.hpp"
#include "JThreadUtils.hpp"
#include <fbjni/fbjni.h>
#include <future>

namespace margelo::nitro {
namespace jni = facebook::jni;

void UIThreadDispatcher::runAsync(std::function<void()>&& function) {
  jni::ThreadScope::WithClassLoader([&] {
    auto runnable = JNativeRunnable::newObjectCxxArgs(std::move(function));
    JThreadUtils::runOnUIThread(runnable);
  });
}

bool UIThreadDispatcher::isOnDispatcher() {
  bool isUIThread = false;
  jni::ThreadScope::WithClassLoader([&] { isUIThread = JThreadUtils::isOnUIThread(); });
  return isUIThread;
}

void UIThreadDispatcher::runSync(std::function<void()>&& function) {
  if (isOnDispatcher()) {
    function();
    return;
  }
  auto completion = std::make_shared<std::promise<void>>();
  auto future = completion->get_future();
  runAsync([function = std::move(function), completion] {
    try {
      function();
      completion->set_value();
    } catch (...) {
      completion->set_exception(std::current_exception());
    }
  });
  future.get();
}
} // namespace margelo::nitro
