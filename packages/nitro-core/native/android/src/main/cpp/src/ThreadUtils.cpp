//
//  ThreadUtils.cpp
//  react-native-nitro
//
//  Created by Marc Rousavy on 14.07.24.
//

#include "JThreadUtils.hpp"
#include "UIThreadDispatcher.hpp"
#include <NitroModules/ThreadUtils.hpp>
#include <pthread.h>
#include <sstream>
#include <string>
#include <sys/prctl.h>
#include <thread>

namespace margelo::nitro {

namespace jni = facebook::jni;

// Implementation for the C++ shared `ThreadUtils` class
std::string ThreadUtils::getThreadName() {
  std::string name;
  jni::ThreadScope::WithClassLoader([&] { name = JThreadUtils::getCurrentThreadName()->toStdString(); });
  return name;
}

void ThreadUtils::setThreadName(const std::string& name) {
  jni::ThreadScope::WithClassLoader([&]() {
    auto jName = jni::make_jstring(name);
    JThreadUtils::setCurrentThreadName(jName);
  });
}

bool ThreadUtils::isUIThread() {
  bool isUIThread = false;
  jni::ThreadScope::WithClassLoader([&] { isUIThread = JThreadUtils::isOnUIThread(); });
  return isUIThread;
}

std::shared_ptr<Dispatcher> ThreadUtils::createUIThreadDispatcher() {
  return std::make_shared<UIThreadDispatcher>();
}

} // namespace margelo::nitro
