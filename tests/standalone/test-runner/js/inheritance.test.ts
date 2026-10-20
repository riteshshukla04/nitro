import { expect } from 'chai'
import { casesForTestObjects, namedCases } from './utils/cases'

import { NitroModules } from 'nitro-core'
import { Base, Child, Grandchild, SizeUnit, TestObjectSwiftKotlin, type Size } from 'nitro-test'
import { HybridChild } from './utils/testObjects'
import { TEST_CAR } from './utils/fixtures'

const CHILD_TO_STRING = 'HybridChild custom toString() :)'

/**
 * Returns the debug `__type` of every Nitro prototype in the prototype chain of
 * {@linkcode object}, most derived first. Only reads own data properties, so
 * it never invokes a native getter.
 */
function getPrototypeTypes(object: object): unknown[] {
  const types: unknown[] = []
  let prototype: object | null = Object.getPrototypeOf(object)
  while (prototype != null && Object.hasOwn(prototype, '__type')) {
    types.push(Object.getOwnPropertyDescriptor(prototype, '__type')?.value)
    prototype = Object.getPrototypeOf(prototype)
  }
  return types
}

/**
 * Compares prototypes as a boolean so a failure never prints a prototype.
 */
function isSamePrototype(a: object | null, b: object | null): boolean {
  return a === b
}

export const cases = {
  ...namedCases('Three-level Swift inheritance', {
    'constructors and prototypes preserve every declared level': () => {
      const grandchild = new Grandchild()
      expect(Object.is(grandchild.constructor, Grandchild)).to.equal(true)
      expect(Object.is(Object.getPrototypeOf(grandchild), Grandchild.prototype)).to.equal(true)
      expect(Object.is(Object.getPrototypeOf(Grandchild.prototype), Child.prototype)).to.equal(true)
      expect(Object.is(Object.getPrototypeOf(Child.prototype), Base.prototype)).to.equal(true)
      expect(Object.is(Object.getPrototypeOf(Grandchild), Child)).to.equal(true)
      expect(Object.is(Object.getPrototypeOf(Child), Base)).to.equal(true)
    },

    'borrowed ancestor getters dispatch to the Grandchild implementation': () => {
      const grandchild = new Grandchild()
      const getBaseValue = Object.getOwnPropertyDescriptor(Base.prototype, 'baseValue')?.get
      const getChildValue = Object.getOwnPropertyDescriptor(Child.prototype, 'childValue')?.get
      expect(getBaseValue).to.be.a('function')
      expect(getChildValue).to.be.a('function')
      expect(getBaseValue!.call(grandchild)).to.equal(20)
      expect(getChildValue!.call(grandchild)).to.equal(30)
    },

    'borrowed ancestor methods accept Grandchild receivers': async () => {
      const grandchild = new Grandchild()
      const size: Size = { width: 20, height: 30, unit: SizeUnit.Points }
      expect(Base.prototype.bounceSize.call(grandchild, size)).to.deep.equal(size)
      expect(Child.prototype.bounceVariant.call(grandchild, TEST_CAR)).to.deep.equal(TEST_CAR)
      let calls = 0
      expect(
        await Base.prototype.mapSize.call(grandchild, size, (value) => {
          calls += 1
          return value
        })
      ).to.deep.equal(size)
      expect(calls).to.equal(1)
    },
  }),
  ...casesForTestObjects('Inheritance', {
    'createBase() returns a Base': (testObject) => {
      const base = testObject.createBase()
      expect(Object.is(NitroModules.isHybridObject(base), true)).to.equal(true)
      expect(base).to.have.property('baseValue', 10)
      expect(base).not.to.have.property('childValue')
    },

    'createChild() returns a Child with Base members': (testObject) => {
      const child = testObject.createChild()
      expect(Object.is(NitroModules.isHybridObject(child), true)).to.equal(true)
      expect(child).to.have.property('childValue', 30)
      expect(child).to.have.property('baseValue', 20)
    },

    'createGrandchild() returns a Grandchild with Child and Base members': (testObject) => {
      const grandchild = testObject.createGrandchild()
      expect(NitroModules.isHybridObject(grandchild)).to.equal(true)
      expect(grandchild.constructor.name).to.equal('Grandchild')
      expect(grandchild.grandchildValue).to.equal(40)
      expect(grandchild.childValue).to.equal(30)
      expect(grandchild.baseValue).to.equal(20)
    },

    'createChildActualGrandchild() preserves the Grandchild type': (testObject) => {
      const child = testObject.createChildActualGrandchild()
      expect(child.constructor.name).to.equal('Grandchild')
      expect(child).to.have.property('grandchildValue', 40)
      // @ts-expect-error - typed as a Child, but it is actually a Grandchild
      expect(Object.is(testObject.bounceGrandchild(child), child)).to.equal(true)
    },

    'createBaseActualGrandchild() preserves the Grandchild type': (testObject) => {
      const base = testObject.createBaseActualGrandchild()
      expect(base.constructor.name).to.equal('Grandchild')
      expect(base).to.have.property('grandchildValue', 40)
      expect(base).to.have.property('childValue', 30)
      // @ts-expect-error - typed as a Base, but it is actually a Grandchild
      expect(Object.is(testObject.bounceGrandchild(base), base)).to.equal(true)
    },

    'createBase() has name "Base"': (testObject) => {
      expect(Object.is(testObject.createBase().constructor.name, 'Base')).to.equal(true)
    },

    'createChild() has name "Child"': (testObject) => {
      expect(Object.is(testObject.createChild().constructor.name, 'Child')).to.equal(true)
    },

    'createChild() has overridden toString()': (testObject) => {
      expect(Object.is(testObject.createChild().toString(), CHILD_TO_STRING)).to.equal(true)
    },

    'createBaseActualChild() has overridden toString()': (testObject) => {
      expect(Object.is(testObject.createBaseActualChild().toString(), CHILD_TO_STRING)).to.equal(true)
    },

    'createBaseActualChild() has name "Child"': (testObject) => {
      expect(Object.is(testObject.createBaseActualChild().constructor.name, 'Child')).to.equal(true)
    },

    'createBaseActualChild() returns a Base': (testObject) => {
      const base = testObject.createBaseActualChild()
      expect(Object.is(NitroModules.isHybridObject(base), true)).to.equal(true)
      expect(base).to.have.property('baseValue', 20)
    },

    'createBaseActualChild() is actually a Child': (testObject) => {
      const base = testObject.createBaseActualChild()
      expect(base).to.have.property('childValue', 30)
      expect(base).to.have.property('baseValue', 20)
    },
  }),
  ...casesForTestObjects('Inheritance casts', {
    'bounceChild(Child) returns the same Child': (testObject) => {
      const child = testObject.createChild()
      expect(Object.is(testObject.bounceChild(child), child)).to.equal(true)
    },

    'bounceBase(Base) returns the same Base': (testObject) => {
      const base = testObject.createBase()
      expect(Object.is(testObject.bounceBase(base), base)).to.equal(true)
    },

    'bounceBase(Child) returns the same Child': (testObject) => {
      const child = testObject.createChild()
      expect(Object.is(testObject.bounceBase(child), child)).to.equal(true)
    },

    'Grandchild roundtrips through Grandchild, Child and Base': (testObject) => {
      const grandchild = testObject.createGrandchild()
      expect(Object.is(testObject.bounceGrandchild(grandchild), grandchild)).to.equal(true)
      expect(Object.is(testObject.bounceChild(grandchild), grandchild)).to.equal(true)
      expect(Object.is(testObject.bounceBase(grandchild), grandchild)).to.equal(true)
      expect(Object.is(testObject.bounceChildBase(grandchild), grandchild)).to.equal(true)
      expect(Object.is(testObject.castBase(grandchild), grandchild)).to.equal(true)
    },

    // In release, the downcast check is optimized away and this would crash.

    'bounceChild(Base) throws': (testObject) => {
      const base = testObject.createBase()
      // @ts-expect-error - a Base is not a Child
      const bounceBaseAsChild = () => testObject.bounceChild(base)
      expect(bounceBaseAsChild).to.throw(`${testObject.constructor.name}.bounceChild(...)`)
      expect(bounceBaseAsChild).to.throw('Downcasting failed - It has a different NativeState<T>!')
    },

    'bounceChildBase(Child) returns the same Child': (testObject) => {
      const child = testObject.createChild()
      expect(Object.is(testObject.bounceChildBase(child), child)).to.equal(true)
    },

    'castBase(Child) returns the same Child': (testObject) => {
      const child = testObject.createChild()
      expect(Object.is(testObject.castBase(child), child)).to.equal(true)
    },

    'castBase(createBaseActualChild()) returns the same object': (testObject) => {
      const base = testObject.createBaseActualChild()
      expect(Object.is(testObject.castBase(base), base)).to.equal(true)
    },

    'castBase(registered Child) returns the same object': (testObject) => {
      expect(Object.is(testObject.castBase(HybridChild), HybridChild)).to.equal(true)
    },

    'bounceBase(createBaseActualChild()) returns the same object': (testObject) => {
      const base = testObject.createBaseActualChild()
      expect(Object.is(testObject.bounceBase(base), base)).to.equal(true)
    },

    'bounceChild(createBaseActualChild()) accepts the actual Child': (testObject) => {
      const base = testObject.createBaseActualChild()
      // @ts-expect-error - typed as a Base, but it is actually a Child
      expect(Object.is(testObject.bounceChild(base), base)).to.equal(true)
    },

    'bounceChildBase(Base) throws': (testObject) => {
      const base = testObject.createBase()
      // @ts-expect-error - a Base is not a Child
      const bounceBaseAsChild = () => testObject.bounceChildBase(base)
      expect(bounceBaseAsChild).to.throw(`${testObject.constructor.name}.bounceChildBase(...)`)
      expect(bounceBaseAsChild).to.throw('Downcasting failed - It has a different NativeState<T>!')
    },

    'bounceBase(another HybridObject type) throws': (testObject) => {
      // @ts-expect-error - a TestObject is not a Base
      expect(() => testObject.bounceBase(testObject)).to.throw('Downcasting failed - It has a different NativeState<T>!')
    },

    'bounceBase({}) throws because it has no NativeState': (testObject) => {
      // @ts-expect-error - a plain object is not a Base
      expect(() => testObject.bounceBase({})).to.throw('It does not have a NativeState!')
    },
  }),
  ...casesForTestObjects('Inheritance members', {
    'createBase() has the default toString()': (testObject) => {
      expect(Object.is(testObject.createBase().toString(), '[HybridObject Base]')).to.equal(true)
    },

    'createBase() does not have Child methods': (testObject) => {
      expect(testObject.createBase()).not.to.have.property('bounceVariant')
    },

    'createChild() is not equal to another Child': (testObject) => {
      expect(Object.is(testObject.createChild().equals(testObject.createChild()), false)).to.equal(true)
    },

    'createGrandchild() inherits Child and Base methods': async (testObject) => {
      const grandchild = testObject.createGrandchild()
      const size = { width: 12, height: 34, unit: SizeUnit.Points }
      expect(grandchild.toString()).to.equal(CHILD_TO_STRING)
      expect(grandchild.bounceVariant('grandchild')).to.equal('grandchild')
      expect(grandchild.bounceSize(size)).to.deep.equal(size)
      expect(grandchild.bounceSizeUnit(SizeUnit.Pixels)).to.equal(SizeUnit.Pixels)
      expect(await grandchild.mapSize(size, (value) => ({ ...value, width: value.width * 2 }))).to.deep.equal({
        ...size,
        width: 24,
      })
    },

    'Base and Child do not have Grandchild members': (testObject) => {
      expect(testObject.createBase()).not.to.have.property('grandchildValue')
      expect(testObject.createChild()).not.to.have.property('grandchildValue')
    },
  }),
  ...casesForTestObjects('Inheritance prototypes', {
    'createGrandchild() prototype extends Child and Base': (testObject) => {
      const grandchild = testObject.createGrandchild()
      const child = testObject.createChild()
      const base = testObject.createBase()
      const grandchildPrototype = Object.getPrototypeOf(grandchild)
      const childPrototype = Object.getPrototypeOf(child)
      const basePrototype = Object.getPrototypeOf(base)
      expect(isSamePrototype(Object.getPrototypeOf(grandchildPrototype), childPrototype)).to.equal(true)
      expect(isSamePrototype(Object.getPrototypeOf(childPrototype), basePrototype)).to.equal(true)
      expect(grandchild).to.be.instanceOf(grandchild.constructor)
      expect(grandchild).to.be.instanceOf(child.constructor)
      expect(grandchild).to.be.instanceOf(base.constructor)
      expect(isSamePrototype(grandchildPrototype, Object.getPrototypeOf(testObject.createGrandchild()))).to.equal(true)
      expect(isSamePrototype(grandchildPrototype, Object.getPrototypeOf(testObject.createChildActualGrandchild()))).to.equal(true)
      expect(isSamePrototype(grandchildPrototype, Object.getPrototypeOf(testObject.createBaseActualGrandchild()))).to.equal(true)
    },

    'createChild() prototype extends the createBase() prototype': (testObject) => {
      const childPrototype = Object.getPrototypeOf(testObject.createChild())
      const basePrototype = Object.getPrototypeOf(testObject.createBase())
      expect(
        Object.is(isSamePrototype(Object.getPrototypeOf(childPrototype), basePrototype), true),
        'Object.getPrototypeOf(childPrototype) === basePrototype'
      ).to.equal(true)
    },

    'createBaseActualChild() has the Child prototype': (testObject) => {
      expect(
        Object.is(
          isSamePrototype(Object.getPrototypeOf(testObject.createBaseActualChild()), Object.getPrototypeOf(testObject.createChild())),
          true
        ),
        'Object.getPrototypeOf(actualChild) === Object.getPrototypeOf(child)'
      ).to.equal(true)
    },

    "createChild() reuses its implementation's constructor and prototype": (testObject) => {
      const child = testObject.createChild()
      const anotherChild = testObject.createChild()
      const base = testObject.createBase()
      expect(child.constructor).to.equal(anotherChild.constructor)
      expect(isSamePrototype(Object.getPrototypeOf(child), Object.getPrototypeOf(anotherChild))).to.equal(true)
      expect(child).to.be.instanceOf(child.constructor)
      expect(child).to.be.instanceOf(base.constructor)
    },

    'createChild() shares the registered Child prototype': (testObject) => {
      expect(
        isSamePrototype(Object.getPrototypeOf(testObject.createChild()), Object.getPrototypeOf(HybridChild)),
        'Object.getPrototypeOf(child) === Object.getPrototypeOf(HybridChild)'
      ).to.equal(true)
    },

    'createChild() prototype chain is Child, Base, HybridObject': (testObject) => {
      expect(getPrototypeTypes(testObject.createChild())).to.deep.equal(['Prototype<Child>', 'Prototype<Base>', 'Prototype<HybridObject>'])
    },

    'createBase() prototype chain is Base, HybridObject': (testObject) => {
      expect(getPrototypeTypes(testObject.createBase())).to.deep.equal(['Prototype<Base>', 'Prototype<HybridObject>'])
    },
  }),
}

export function registeredGrandchildConstructor(): void {
  const grandchild = new Grandchild()
  const testObject = new TestObjectSwiftKotlin()
  expect(grandchild.grandchildValue).to.equal(40)
  expect(grandchild).to.be.instanceOf(Grandchild)
  expect(grandchild).to.be.instanceOf(Child)
  expect(grandchild).to.be.instanceOf(Base)
  expect(isSamePrototype(Object.getPrototypeOf(grandchild), Object.getPrototypeOf(testObject.createGrandchild()))).to.equal(true)
  expect(Object.is(testObject.bounceGrandchild(grandchild), grandchild)).to.equal(true)
}

export const skips = {
  'Inheritance casts / TestObjectCpp / bounceChild(Base) throws': {
    release: "Existing main exclusion: NitroModules.buildType === 'debug'",
  },
  'Inheritance casts / TestObjectSwiftKotlin / bounceChild(Base) throws': {
    release: "Existing main exclusion: NitroModules.buildType === 'debug'",
  },
  'Inheritance casts / TestObjectCpp / bounceChildBase(Base) throws': {
    release: 'Existing main exclusion: IS_DEBUG',
  },
  'Inheritance casts / TestObjectSwiftKotlin / bounceChildBase(Base) throws': {
    release: 'Existing main exclusion: IS_DEBUG',
  },
  'Inheritance casts / TestObjectCpp / bounceBase(another HybridObject type) throws': {
    release: 'Existing main exclusion: IS_DEBUG',
  },
  'Inheritance casts / TestObjectSwiftKotlin / bounceBase(another HybridObject type) throws': {
    release: 'Existing main exclusion: IS_DEBUG',
  },
  'Inheritance casts / TestObjectCpp / bounceBase({}) throws because it has no NativeState': {
    release: 'Existing main exclusion: IS_DEBUG',
  },
  'Inheritance casts / TestObjectSwiftKotlin / bounceBase({}) throws because it has no NativeState': {
    release: 'Existing main exclusion: IS_DEBUG',
  },
  'Inheritance prototypes / TestObjectCpp / createChild() prototype chain is Child, Base, HybridObject': {
    release: 'Existing main exclusion: IS_DEBUG',
  },
  'Inheritance prototypes / TestObjectSwiftKotlin / createChild() prototype chain is Child, Base, HybridObject': {
    release: 'Existing main exclusion: IS_DEBUG',
  },
  'Inheritance prototypes / TestObjectCpp / createBase() prototype chain is Base, HybridObject': {
    release: 'Existing main exclusion: IS_DEBUG',
  },
  'Inheritance prototypes / TestObjectSwiftKotlin / createBase() prototype chain is Base, HybridObject': {
    release: 'Existing main exclusion: IS_DEBUG',
  },
} as const
