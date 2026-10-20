#pragma once

#include "HybridCppChild.hpp"
#include <NitroTest/HybridCppGrandchildSpec.hpp>

namespace margelo::nitro::test {

class HybridCppGrandchild : public virtual HybridCppGrandchildSpec, public virtual HybridCppChild {
public:
  double getGrandchildValue() override {
    return 40;
  }

  const std::shared_ptr<const HybridClass>& getHybridClass() override {
    return HybridCppGrandchildSpec::Class::get();
  }
};

} // namespace margelo::nitro::test
