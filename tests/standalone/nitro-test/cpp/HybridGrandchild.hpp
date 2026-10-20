#pragma once

#include "HybridChild.hpp"
#include <NitroTest/HybridGrandchildSpec.hpp>

namespace margelo::nitro::test {

class HybridGrandchild : public virtual HybridGrandchildSpec, public virtual HybridChild {
public:
  double getGrandchildValue() override {
    return 40;
  }

  const std::shared_ptr<const HybridClass>& getHybridClass() override {
    return HybridGrandchildSpec::Class::get();
  }
};

} // namespace margelo::nitro::test
