//
//  HybridCppBase.hpp
//  NitroTest
//
//  Created by Marc Rousavy on 03.10.24.
//

#pragma once

#include <NitroTest/HybridCppBaseSpec.hpp>

namespace margelo::nitro::test {

using namespace facebook;

class HybridCppBase : public virtual HybridCppBaseSpec {
public:
  HybridCppBase() = default;

public:
  double getBaseValue() override {
    return 10;
  }

  Size bounceSize(const Size& size) override {
    return size;
  }

  SizeUnit bounceSizeUnit(SizeUnit unit) override {
    return unit;
  }

  Promise<Size> mapSize(const Size& size, const Callback<Size(const Size&)>& callback) override {
    return callback(size);
  }
};

}; // namespace margelo::nitro::test
