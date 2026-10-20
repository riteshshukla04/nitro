//
//  HybridCppChild.hpp
//  NitroTest
//
//  Created by Marc Rousavy on 03.10.24.
//

#pragma once

#include "HybridCppBase.hpp"
#include <NitroTest/HybridCppChildSpec.hpp>

namespace margelo::nitro::test {

using namespace facebook;

class HybridCppChild : public virtual HybridCppChildSpec, public virtual HybridCppBase {
public:
  explicit HybridCppChild() = default;

public:
  double getBaseValue() override {
    return 20;
  }
  double getChildValue() override {
    return 30;
  }

  std::variant<std::string, Car> bounceVariant(const std::variant<std::string, Car>& variant) override {
    return variant;
  }

  const std::shared_ptr<const HybridClass>& getHybridClass() override {
    return HybridCppChildSpec::Class::get();
  }

  std::string toString() override {
    return "HybridCppChild custom toString() :)";
  }
};

}; // namespace margelo::nitro::test
