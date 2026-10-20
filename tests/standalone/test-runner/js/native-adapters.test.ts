import { expect } from 'chai'
import { NitroModules } from 'nitro-core'
import { Base, Child, CppBase, CppChild, CppGrandchild, SizeUnit, TestObjectCpp, type Size } from 'nitro-test'
import { SomeExternalObject } from 'nitro-test-external'
import { namedCases } from './utils/cases'
import { TEST_CAR } from './utils/fixtures'

const SIZE: Size = { width: 640, height: 480, unit: SizeUnit.Pixels }

export const cases = {
  ...namedCases('C++ consuming Swift HybridObjects', {
    'adapter constructors preserve the registered Swift classes': () => {
      const object = new TestObjectCpp()
      const base = object.createBase()
      const child = object.createChild()
      expect(base).to.be.instanceOf(Base)
      expect(child).to.be.instanceOf(Child)
      expect(child).to.be.instanceOf(Base)
      expect(base.constructor).to.equal(Base)
      expect(child.constructor).to.equal(Child)
    },

    'calls dispatch to the actual Swift implementation': () => {
      const object = new TestObjectCpp()
      expect(object.readBaseValue(new Base())).to.equal(10)
      expect(object.readBaseValue(new Child())).to.equal(20)
      expect(object.readChildBaseValue(new Child())).to.equal(20)
    },

    'multiple Swift implementations share the same class and prototype': () => {
      const object = new TestObjectCpp()
      const alternative = object.createAlternativeBase()
      expect(alternative).to.be.instanceOf(Base)
      expect(alternative.constructor).to.equal(Base)
      expect(Object.is(Object.getPrototypeOf(alternative), Base.prototype)).to.equal(true)
      expect(alternative.baseValue).to.equal(11)
      expect(object.readBaseValue(alternative)).to.equal(11)
      expect(object.bounceBase(alternative)).to.equal(alternative)
    },

    'converts structs and enums for a Swift method call': () => {
      const object = new TestObjectCpp()
      expect(object.bounceSizeThroughBase(new Base(), SIZE)).to.deep.equal(SIZE)
      expect(object.bounceSizeThroughBase(new Child(), SIZE)).to.deep.equal(SIZE)
    },

    'converts a callback and Promise around a Swift method call': async () => {
      const object = new TestObjectCpp()
      const result: Size = { width: 20, height: 30, unit: SizeUnit.Points }
      let calls = 0
      const value = await object.mapSizeThroughBase(new Child(), SIZE, (size) => {
        calls += 1
        expect(size).to.deep.equal(SIZE)
        return result
      })
      expect(calls).to.equal(1)
      expect(value).to.deep.equal(result)
    },

    'converts both members of a Swift variant': () => {
      const object = new TestObjectCpp()
      const child = new Child()
      expect(object.bounceVariantThroughChild(child, 'hello')).to.equal('hello')
      expect(object.bounceVariantThroughChild(child, TEST_CAR)).to.deep.equal(TEST_CAR)
    },

    'retaining and returning an adapter preserves JS identity': () => {
      const object = new TestObjectCpp()
      const child = new Child()
      expect(object.retainedBase).to.equal(undefined)
      object.retainedBase = child
      expect(object.retainedBase).to.equal(child)
      expect(object.castBase(object.retainedBase!)).to.equal(child)
      object.retainedBase = undefined
      expect(object.retainedBase).to.equal(undefined)
    },

    'retained adapters keep Swift objects alive across JS garbage collection': () => {
      const object = new TestObjectCpp()
      object.retainedBase = new Child()
      gc()
      const child = object.retainedBase!
      expect(child).to.be.instanceOf(Child)
      expect(child).to.be.instanceOf(Base)
      expect(object.readBaseValue(child)).to.equal(20)
      expect(object.castBase(child)).to.equal(child)
      object.retainedBase = undefined
    },

    'external adapters call the original Swift implementation': () => {
      const object = new TestObjectCpp()
      const external = new SomeExternalObject()
      expect(object.readExternalValue(external)).to.equal('Hello world!')
      expect(object.bounceExternalHybrid(external)).to.equal(external)
    },

    'external Swift structs preserve populated optional fields': () => {
      const object = new TestObjectCpp()
      const external = new SomeExternalObject()
      expect(object.createExternalOptionalPrimitives(external, 4.5, true, 13n, -7n)).to.deep.equal({
        optionalNumber: 4.5,
        optionalBoolean: true,
        optionalUInt64: 13n,
        optionalInt64: -7n,
      })
    },

    'external Swift structs preserve absent optional fields': () => {
      const object = new TestObjectCpp()
      expect(object.createExternalOptionalPrimitives(new SomeExternalObject())).to.deep.equal({
        optionalNumber: undefined,
        optionalBoolean: undefined,
        optionalUInt64: undefined,
        optionalInt64: undefined,
      })
    },

    'external Swift structs preserve false, zero, and integer limits': () => {
      const object = new TestObjectCpp()
      const external = object.createInternalObject()
      expect(object.createExternalOptionalPrimitives(external, 0, false, 2n ** 64n - 1n, -(2n ** 63n))).to.deep.equal({
        optionalNumber: 0,
        optionalBoolean: false,
        optionalUInt64: 2n ** 64n - 1n,
        optionalInt64: -(2n ** 63n),
      })
    },

    'external protocol implementations keep their class and dispatch': () => {
      const object = new TestObjectCpp()
      const internal = object.createInternalObject()
      expect(internal).to.be.instanceOf(SomeExternalObject)
      expect(internal.constructor).to.equal(SomeExternalObject)
      expect(object.readExternalValue(internal)).to.equal('This is overridden!')
      expect(object.bounceExternalHybrid(internal)).to.equal(internal)
    },
  }),
  ...namedCases('Declared C++ inheritance', {
    'constructors and prototypes follow the declared hierarchy': () => {
      const base = new CppBase()
      const child = new CppChild()
      expect(base).to.be.instanceOf(CppBase)
      expect(child).to.be.instanceOf(CppChild)
      expect(child).to.be.instanceOf(CppBase)
      expect(Object.is(Object.getPrototypeOf(CppChild), CppBase)).to.equal(true)
      expect(Object.is(Object.getPrototypeOf(CppChild.prototype), CppBase.prototype)).to.equal(true)
      expect(NitroModules.isHybridObject(child)).to.equal(true)
    },

    'factories reuse the registered C++ class': () => {
      const object = new TestObjectCpp()
      expect(object.createCppBase()).to.be.instanceOf(CppBase)
      const child = object.createCppChild()
      expect(child.constructor).to.equal(CppChild)
      expect(child).to.be.instanceOf(CppChild)
      expect(child).to.be.instanceOf(CppBase)
      expect(object.createCppBaseActualChild()).to.be.instanceOf(CppChild)
    },

    'inherited methods call the C++ implementation': async () => {
      const child = new CppChild()
      expect(new CppBase().baseValue).to.equal(10)
      expect(child.baseValue).to.equal(20)
      expect(child.childValue).to.equal(30)
      expect(child.toString()).to.equal('HybridCppChild custom toString() :)')
      expect(child.bounceSize(SIZE)).to.deep.equal(SIZE)
      expect(child.bounceSizeUnit(SizeUnit.Pixels)).to.equal(SizeUnit.Pixels)
      expect(child.bounceVariant(TEST_CAR)).to.deep.equal(TEST_CAR)
      expect(await child.mapSize(SIZE, (size) => size)).to.deep.equal(SIZE)
    },

    'upcasting and downcasting preserve the original object': () => {
      const object = new TestObjectCpp()
      const child = new CppChild()
      const base = object.bounceCppBase(child)
      expect(base).to.equal(child)
      expect(object.castCppBase(base)).to.equal(child)
      expect(() => object.castCppBase(new CppBase())).to.throw('Cannot cast CppBase to CppChild!')
    },

    'three-level constructors and prototypes follow the declared C++ hierarchy': () => {
      const object = new TestObjectCpp()
      for (const grandchild of [new CppGrandchild(), object.createCppGrandchild()]) {
        expect(grandchild).to.be.instanceOf(CppGrandchild)
        expect(grandchild).to.be.instanceOf(CppChild)
        expect(grandchild).to.be.instanceOf(CppBase)
        expect(grandchild.constructor).to.equal(CppGrandchild)
        expect(NitroModules.isHybridObject(grandchild)).to.equal(true)
      }
      expect(Object.is(Object.getPrototypeOf(CppGrandchild), CppChild)).to.equal(true)
      expect(Object.is(Object.getPrototypeOf(CppGrandchild.prototype), CppChild.prototype)).to.equal(true)
    },

    'three-level C++ inheritance dispatches inherited methods and getters': async () => {
      const grandchild = new CppGrandchild()
      expect(grandchild.baseValue).to.equal(20)
      expect(grandchild.childValue).to.equal(30)
      expect(grandchild.grandchildValue).to.equal(40)
      expect(grandchild.toString()).to.equal('HybridCppChild custom toString() :)')
      expect(grandchild.bounceSize(SIZE)).to.deep.equal(SIZE)
      expect(grandchild.bounceSizeUnit(SizeUnit.Points)).to.equal(SizeUnit.Points)
      expect(grandchild.bounceVariant(TEST_CAR)).to.deep.equal(TEST_CAR)
      expect(await grandchild.mapSize(SIZE, (size) => size)).to.deep.equal(SIZE)
    },

    'three-level C++ upcasts and downcasts preserve the original object': () => {
      const object = new TestObjectCpp()
      const grandchild = object.createCppGrandchild()
      const base = object.bounceCppBase(grandchild)
      expect(base).to.equal(grandchild)
      expect(object.castCppBase(base)).to.equal(grandchild)
      expect(base).to.be.instanceOf(CppGrandchild)
      expect(base).to.be.instanceOf(CppChild)
      expect(base).to.be.instanceOf(CppBase)
    },

    'C++ and Swift classes keep distinct identities': () => {
      expect(new CppBase()).not.to.be.instanceOf(Base)
      expect(new Base()).not.to.be.instanceOf(CppBase)
      expect(new CppChild()).not.to.be.instanceOf(Child)
      expect(new Child()).not.to.be.instanceOf(CppChild)
    },
  }),
}
