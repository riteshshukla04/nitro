//
//  HybridClass.cpp
//  NitroModules
//
//  Created by Marc Rousavy on 07.08.24.
//

#include "HybridClass.hpp"
#include "CommonGlobals.hpp"
#include "NitroDefines.hpp"
#include "JSICache.hpp"
#include "NitroLogger.hpp"

namespace margelo::nitro {

const JSClass& HybridClass::getOrCreateJSClass(jsi::Runtime& runtime) const {
  // 1. Reuse both objects from this Runtime's cache.
  JSICache& cache = JSICache::getOrCreateCache(runtime);
  const JSClass* cached = cache.getClass(getId());
  if (cached != nullptr) {
    return *cached;
  }

  // 2. Materialize the base first, then create this type's instance prototype.
  Logger::log(LogLevel::Info, "HybridClass", "Creating new JS prototype for \"%s\"...", _name.c_str());
  const JSClass* base = _base != nullptr ? &_base->getOrCreateJSClass(runtime) : nullptr;
  jsi::Object prototypeObject = base != nullptr ? jsi::Object::create(runtime, jsi::Value(runtime, base->prototype)) : jsi::Object(runtime);

  // 3. Add all Hybrid Methods to it
  for (const auto& method : getMethods()) {
    // method()
    const std::string& name = method.first;
    CommonGlobals::Object::defineProperty(runtime, prototypeObject, name.c_str(),
                                          PlainPropertyDescriptor{
                                              .configurable = false,
                                              .enumerable = true,
                                              .value = method.second.toJSFunction(runtime),
                                              .writable = false,
                                          });
  }

  // 4. Add all properties (getter + setter) to it using defineProperty
  for (const auto& [name, getter] : getGetters()) {
    const auto& setterIterator = getSetters().find(name);
    if (setterIterator != getSetters().end()) {
      // get + set
      const HybridFunction& setter = setterIterator->second;
      CommonGlobals::Object::defineProperty(runtime, prototypeObject, name.c_str(),
                                            ComputedPropertyDescriptor{// getter + setter
                                                                       .configurable = false,
                                                                       .enumerable = true,
                                                                       .get = getter.toJSFunction(runtime),
                                                                       .set = setter.toJSFunction(runtime)});
    } else {
      // get
      CommonGlobals::Object::defineProperty(runtime, prototypeObject, name.c_str(),
                                            ComputedReadonlyPropertyDescriptor{// getter
                                                                               .configurable = false,
                                                                               .enumerable = true,
                                                                               .get = getter.toJSFunction(runtime)});
    }
  }

  // 5. In DEBUG, add a __type info to the prototype object.
#ifdef NITRO_DEBUG
  std::string prototypeName = "Prototype<" + _name + ">";
  CommonGlobals::Object::defineProperty(runtime, prototypeObject, "__type",
                                        PlainPropertyDescriptor{
                                            .configurable = false,
                                            .enumerable = true,
                                            .value = jsi::String::createFromAscii(runtime, prototypeName),
                                            .writable = false,
                                        });
#endif

  // 6. Create the constructor function.
  jsi::HostFunctionType constructor;
  size_t argumentCount = 0;
  if (_constructor.has_value()) {
    constructor = _constructor->getHostFunction();
    argumentCount = _constructor->getParamCount();
  } else {
    constructor = [name = _name](jsi::Runtime& runtime, const jsi::Value&, const jsi::Value*, size_t) -> jsi::Value {
      throw jsi::JSError(runtime, "HybridClass \"" + name + "\" has no public constructor.");
    };
  }
  auto constructorFunction = jsi::Function::createFromHostFunction(runtime, jsi::PropNameID::forAscii(runtime, _name),
                                                                 static_cast<unsigned int>(argumentCount), std::move(constructor));

  // 7. Set the constructor's prototype to the base constructor to inherit static methods.
  if (base != nullptr) {
    constructorFunction.setPrototype(runtime, jsi::Value(runtime, base->constructor));
  }

  // 8. Add own static methods.
  for (const auto& [name, method] : _staticMethods) {
    CommonGlobals::Object::defineProperty(runtime, constructorFunction, name.c_str(), PlainPropertyDescriptor{
      .configurable = false, .enumerable = false, .value = method.toJSFunction(runtime), .writable = false,
    });
  }

  // 9. Link .prototype and .constructor for JavaScript.
  CommonGlobals::Object::defineProperty(runtime, constructorFunction, "prototype", PlainPropertyDescriptor{
    .configurable = false, .enumerable = false, .value = jsi::Value(runtime, prototypeObject), .writable = false,
  });
  CommonGlobals::Object::defineProperty(runtime, prototypeObject, "constructor", PlainPropertyDescriptor{
    .configurable = false, .enumerable = false, .value = jsi::Value(runtime, constructorFunction), .writable = false,
  });

  // 10. Freeze the completed instance prototype in debug builds.
#ifdef NITRO_DEBUG
  CommonGlobals::Object::freeze(runtime, prototypeObject);
#endif

  // 11. Publish one complete cache entry. Its references stay valid until Runtime teardown.
  return cache.setClass(getId(), JSClass{std::move(prototypeObject), std::move(constructorFunction)});
}

} // namespace margelo::nitro
