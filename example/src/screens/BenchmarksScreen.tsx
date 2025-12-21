/* eslint-disable react-native/no-inline-styles */

import * as React from 'react'

import {
  StyleSheet,
  View,
  Text,
  Button,
  Platform,
  ScrollView,
} from 'react-native'
import { NitroModules } from 'react-native-nitro-modules'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useColors } from '../useColors'
import { encode, decode } from '@msgpack/msgpack'
import type { TestObjectSwiftKotlin } from 'react-native-nitro-test'

declare global {
  var gc: () => void
  var performance: {
    now: () => number
  }
}

interface BenchmarkResult {
  iterations: string[]
  average: string
  total: string
  min: string
  max: string
  dataSize: string
  method: 'msgpackRoundtrip' | 'copyAnyMap'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForGc(): Promise<void> {
  if (typeof gc === 'function') {
    gc()
  }
  await delay(500)
}

function createTestData(): Record<string, any> {
  const jsonData: Record<string, any> = {}
  for (let i = 0; i < 2000; i++) {
    jsonData[`key${i}`] = {
      id: i,
      name: `Item ${i}`,
      value: i * 2,
      active: i % 2 === 0,
      tags: [`tag${i}`, `category${i % 10}`],
      metadata: {
        created: Date.now() + i,
        updated: Date.now() + i * 2,
      },
    }
  }
  return jsonData
}

const ITERATIONS = 10

async function runMsgpackBenchmark(): Promise<BenchmarkResult> {
  console.log(`Running msgpackRoundtrip benchmark ${ITERATIONS}x...`)
  await waitForGc()

  const testObject = NitroModules.createHybridObject<TestObjectSwiftKotlin>(
    'TestObjectSwiftKotlin'
  )
  const jsonData = createTestData()

  const times: number[] = []
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now()
    const msgpackBuffer = encode(jsonData)
    const resultBuffer = testObject.msgpackRoundtrip(msgpackBuffer.buffer as ArrayBuffer)
    const decoded = decode(new Uint8Array(resultBuffer))
    const end = performance.now()
    times.push(end - start)
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length
  const total = times.reduce((a, b) => a + b, 0)

  console.log(
    `msgpackRoundtrip finished! Average: ${avg.toFixed(2)}ms | Total: ${total.toFixed(2)}ms`
  )

  return {
    iterations: times.map((t, i) => `Run ${i + 1}: ${t.toFixed(2)}ms`),
    average: `${avg.toFixed(2)}ms`,
    total: `${total.toFixed(2)}ms`,
    min: `${Math.min(...times).toFixed(2)}ms`,
    max: `${Math.max(...times).toFixed(2)}ms`,
    dataSize: '2000 keys with nested objects',
    method: 'msgpackRoundtrip',
  }
}

async function runCopyAnyMapBenchmark(): Promise<BenchmarkResult> {
  console.log(`Running copyAnyMap benchmark ${ITERATIONS}x...`)
  await waitForGc()

  const testObject = NitroModules.createHybridObject<TestObjectSwiftKotlin>(
    'TestObjectSwiftKotlin'
  )
  const jsonData = createTestData()

  const anyMap = testObject.mapRoundtrip(jsonData)

  const times: number[] = []
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now()
    const copied = testObject.copyAnyMap(anyMap)
    const end = performance.now()
    times.push(end - start)
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length
  const total = times.reduce((a, b) => a + b, 0)

  console.log(
    `copyAnyMap finished! Average: ${avg.toFixed(2)}ms | Total: ${total.toFixed(2)}ms`
  )

  return {
    iterations: times.map((t, i) => `Run ${i + 1}: ${t.toFixed(2)}ms`),
    average: `${avg.toFixed(2)}ms`,
    total: `${total.toFixed(2)}ms`,
    min: `${Math.min(...times).toFixed(2)}ms`,
    max: `${Math.max(...times).toFixed(2)}ms`,
    dataSize: '2000 keys with nested objects',
    method: 'copyAnyMap',
  }
}

export function BenchmarksScreen() {
  const safeArea = useSafeAreaInsets()
  const colors = useColors()
  const [status, setStatus] = React.useState('📱 Idle')
  const [msgpackResults, setMsgpackResults] = React.useState<BenchmarkResult>()
  const [copyAnyMapResults, setCopyAnyMapResults] = React.useState<BenchmarkResult>()

  const runMsgpack = async () => {
    setStatus('⏳ Running msgpackRoundtrip...')
    const r = await runMsgpackBenchmark()
    setMsgpackResults(r)
    setStatus('📱 Idle')
  }

  const runCopyAnyMap = async () => {
    setStatus('⏳ Running copyAnyMap...')
    const r = await runCopyAnyMapBenchmark()
    setCopyAnyMapResults(r)
    setStatus('📱 Idle')
  }

  const renderResults = (results: BenchmarkResult | undefined, title: string) => {
    if (results == null) {
      return null
    }

    return (
      <View style={styles.benchmarkSection}>
        <Text style={styles.benchmarkTitle}>{title}</Text>
        <View style={styles.smallVSpacer} />

        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Average:</Text>
          <Text style={styles.resultValue}>{results.average}</Text>
        </View>

        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Total:</Text>
          <Text style={styles.resultValue}>{results.total}</Text>
        </View>

        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Min:</Text>
          <Text style={styles.resultValue}>{results.min}</Text>
        </View>

        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Max:</Text>
          <Text style={styles.resultValue}>{results.max}</Text>
        </View>

        <View style={styles.mediumVSpacer} />

        <Text style={styles.sectionTitle}>Individual Runs</Text>
        <View style={styles.smallVSpacer} />
        {results.iterations.map((iteration, index) => (
          <Text key={index} style={styles.iterationText}>
            {iteration}
          </Text>
        ))}
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: safeArea.top }]}>
      <Text style={styles.header}>Benchmark Comparison</Text>
      <View style={styles.topControls}>
        <View style={styles.flex} />
        <Text style={styles.buildTypeText}>{NitroModules.buildType}</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {msgpackResults != null || copyAnyMapResults != null ? (
          <View style={styles.resultsContainer}>
            {renderResults(msgpackResults, 'msgpackRoundtrip')}
            
            {msgpackResults != null && copyAnyMapResults != null && (
              <>
                <View style={styles.largeVSpacer} />
                <View style={styles.comparisonSection}>
                  <Text style={styles.sectionTitle}>Comparison</Text>
                  <View style={styles.smallVSpacer} />
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>msgpackRoundtrip Avg:</Text>
                    <Text style={styles.resultValue}>{msgpackResults.average}</Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>copyAnyMap Avg:</Text>
                    <Text style={styles.resultValue}>{copyAnyMapResults.average}</Text>
                  </View>
                  <View style={styles.mediumVSpacer} />
                  <Text style={styles.dataSizeText}>
                    {parseFloat(msgpackResults.average) < parseFloat(copyAnyMapResults.average)
                      ? 'msgpackRoundtrip is faster'
                      : 'copyAnyMap is faster'}
                  </Text>
                </View>
              </>
            )}

            {renderResults(copyAnyMapResults, 'copyAnyMap')}

            <View style={styles.largeVSpacer} />
            <Text style={styles.sectionTitle}>Test Data</Text>
            <View style={styles.smallVSpacer} />
            <Text style={styles.dataSizeText}>2000 keys with nested objects</Text>
            <Text style={styles.dataSizeText}>Iterations: {ITERATIONS}</Text>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              Press <Text style={styles.bold}>Run</Text> buttons to benchmark each method.
            </Text>
            <View style={styles.largeVSpacer} />
            <Text style={styles.emptySubtext}>
              <Text style={styles.bold}>msgpackRoundtrip:</Text>
              {'\n'}1. Create JSON with 2000 keys
              {'\n'}2. Encode to MessagePack
              {'\n'}3. Roundtrip through native (Kotlin)
              {'\n'}4. Decode back to JSON
              {'\n\n'}
              <Text style={styles.bold}>copyAnyMap:</Text>
              {'\n'}1. Create JSON with 2000 keys
              {'\n'}2. Convert to AnyMap
              {'\n'}3. Copy AnyMap through native
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomView, { backgroundColor: colors.background }]}>
        <Text style={styles.resultText} numberOfLines={2}>
          {status}
        </Text>
        <View style={styles.buttonContainer}>
          <Button title="Run msgpack" onPress={runMsgpack} />
          <View style={styles.buttonSpacer} />
          <Button title="Run copyAnyMap" onPress={runCopyAnyMap} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    fontSize: 26,
    fontWeight: 'bold',
    paddingBottom: 15,
    marginHorizontal: 15,
  },
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  topControls: {
    marginHorizontal: 15,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  buildTypeText: {
    fontFamily: Platform.select({
      ios: 'Menlo',
      macos: 'Menlo',
      android: 'monospace',
    }),
    fontWeight: 'bold',
  },
  resultsContainer: {
    marginTop: 20,
  },
  benchmarkSection: {
    marginBottom: 30,
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#444',
  },
  benchmarkTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 10,
  },
  comparisonSection: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 8,
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonSpacer: {
    width: 10,
  },
  mediumVSpacer: {
    height: 15,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  resultLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  resultValue: {
    fontSize: 16,
    fontFamily: Platform.select({
      ios: 'Menlo',
      macos: 'Menlo',
      android: 'monospace',
    }),
  },
  iterationText: {
    fontSize: 14,
    fontFamily: Platform.select({
      ios: 'Menlo',
      macos: 'Menlo',
      android: 'monospace',
    }),
    paddingVertical: 4,
  },
  dataSizeText: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 10,
  },
  smallVSpacer: {
    height: 10,
  },
  largeVSpacer: {
    height: 25,
  },
  bold: {
    fontWeight: 'bold',
  },
  flex: { flex: 1 },
  resultText: {
    flexShrink: 1,
  },
  bottomView: {
    borderTopRightRadius: 15,
    borderTopLeftRadius: 15,
    elevation: 15,
    shadowColor: 'black',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowRadius: 7,
    shadowOpacity: 0.4,

    paddingHorizontal: 15,
    paddingVertical: 9,
    alignItems: 'center',
    flexDirection: 'row',
  },
})
