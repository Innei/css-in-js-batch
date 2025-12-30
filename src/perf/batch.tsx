import React, { Profiler, useLayoutEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

import FlexBasic from '../Flex/FlexBasic'
import {
  defineFlexBasicElement,
  NativeFlexBasicElement,
} from '../Flex/FlexBasicElement'
import { Flexbox as RlkFlexbox } from 'react-layout-kit'

defineFlexBasicElement()

type BenchName =
  | 'local(FlexBasic)'
  | 'native(WebComponent)'
  | 'react-layout-kit(Flexbox)'

type MemorySample = {
  usedJSHeapSize?: number
  totalJSHeapSize?: number
  jsHeapSizeLimit?: number
}

type CaseResult = {
  name: BenchName
  createOnlyMsTotal: number
  createOnlyMsPerOp: number
  updateMsTotal: number
  updateMsPerOp: number
  reactActualDurationMsTotal: number
  memory?: {
    createBefore?: MemorySample
    createAfter?: MemorySample
    mountBefore?: MemorySample
    mountAfter?: MemorySample
  }
}

declare global {
  interface Performance {
    memory?: {
      usedJSHeapSize: number
      totalJSHeapSize: number
      jsHeapSizeLimit: number
    }
  }

  interface Window {
    gc?: () => void
  }
}

const raf = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

const now = () => performance.now()

const maybeGC = async () => {
  // Only available in Chromium with `--js-flags=--expose-gc`
  if (typeof window !== 'undefined' && typeof window.gc === 'function') {
    window.gc()
    await raf()
  }
}

const readMemory = (): MemorySample | undefined => {
  const mem = performance.memory
  if (!mem) return

  return {
    usedJSHeapSize: mem.usedJSHeapSize,
    totalJSHeapSize: mem.totalJSHeapSize,
    jsHeapSizeLimit: mem.jsHeapSizeLimit,
  }
}

const formatMs = (ms: number) => `${ms.toFixed(2)} ms`

const formatBytes = (bytes?: number) => {
  if (bytes === undefined) return '-'
  const sign = bytes < 0 ? '-' : ''
  let abs = Math.abs(bytes)
  const units = ['B', 'KB', 'MB', 'GB'] as const
  let v = abs
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${sign}${v.toFixed(2)} ${units[i]}`
}

const memDelta = (a?: MemorySample, b?: MemorySample) => {
  const av = a?.usedJSHeapSize
  const bv = b?.usedJSHeapSize
  if (av === undefined || bv === undefined) return
  return bv - av
}

const cleanupEmotionStyleTags = () => {
  // `@emotion/css` uses a default cache key of `css` and injects tags like:
  // <style data-emotion="css ..."> ...
  const styles = Array.from(
    document.querySelectorAll<HTMLStyleElement>('style[data-emotion]'),
  )

  for (const el of styles) {
    const key = el.getAttribute('data-emotion') || ''
    if (key.trim().startsWith('css')) el.remove()
  }
}

function MountSignal({ onCommitted }: { onCommitted: () => void }) {
  useLayoutEffect(() => {
    onCommitted()
  }, [onCommitted])
  return null
}

function buildChildren(count: number) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} style={{ width: 4, height: 4 }} />
  ))
}

export default function PerfBatch() {
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<CaseResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [createIterations, setCreateIterations] = useState(20)
  const [mountLoops, setMountLoops] = useState(20)
  const [flexboxCount, setFlexboxCount] = useState(20)
  const [itemsPerFlexbox, setItemsPerFlexbox] = useState(8)

  const [randomPropsEnabled, setRandomPropsEnabled] = useState(true)

  const pick = <T,>(arr: readonly T[]): T =>
    arr[Math.floor(Math.random() * arr.length)]

  const maybe = <T,>(value: T, probability = 0.5): T | undefined =>
    Math.random() < probability ? value : undefined

  const buildRandomProps = (): Record<string, unknown> => {
    const directions = [
      'horizontal',
      'horizontal-reverse',
      'vertical',
      'vertical-reverse',
    ] as const
    const aligns = [
      'stretch',
      'center',
      'flex-start',
      'flex-end',
      'start',
      'end',
      'baseline',
    ] as const
    const justifies = [
      'flex-start',
      'center',
      'flex-end',
      'space-between',
      'space-around',
      'space-evenly',
      'start',
      'end',
      'left',
      'right',
    ] as const
    const wraps = ['nowrap', 'wrap', 'wrap-reverse'] as const

    const gaps: readonly number[] = [0, 2, 4, 8, 12, 16, 24]
    const paddings: readonly number[] = [0, 2, 4, 8, 12, 16, 24]
    const sizes: readonly number[] = [120, 240, 360, 480, 640]

    const next: Record<string, unknown> = {
      direction: pick(directions),
      align: pick(aligns),
      justify: pick(justifies),
      wrap: pick(wraps),
      gap: pick(gaps),
      padding: pick(paddings),
    }

    const w = maybe(pick(sizes), 0.35)
    if (w !== undefined) next.width = w

    const h = maybe(pick(sizes), 0.35)
    if (h !== undefined) next.height = h

    const flexChoices: readonly (number | string)[] = [0, 1, 2, 3, '0 1 auto']
    const f = maybe(pick(flexChoices), 0.4)
    if (f !== undefined) next.flex = f

    return next
  }

  const buildFixedProps = (): Record<string, unknown> => ({
    direction: 'horizontal',
    gap: 8,
    padding: 8,
    justify: 'space-between',
    align: 'center',
    wrap: 'wrap',
  })

  const buildPropsList = () => {
    const list: Record<string, unknown>[] = []
    for (let i = 0; i < flexboxCount; i++) {
      list.push(randomPropsEnabled ? buildRandomProps() : buildFixedProps())
    }
    return list
  }

  const cases = useMemo(
    () =>
      [
        {
          name: 'local(FlexBasic)' as const,
          Impl: FlexBasic,
        },
        {
          name: 'native(WebComponent)' as const,
          Impl: NativeFlexBasicElement,
        },
        {
          name: 'react-layout-kit(Flexbox)' as const,
          Impl: RlkFlexbox,
        },
      ] as const,
    [],
  )

  const upsertResult = (next: CaseResult) => {
    setResults((prev) => {
      const list = prev ? [...prev] : []
      const idx = list.findIndex((r) => r.name === next.name)
      if (idx >= 0) list[idx] = next
      else list.push(next)
      return list
    })
  }

  const buildBenchmarkTree = (
    Impl: React.ElementType,
    propsList: Record<string, unknown>[],
    onCommitted: () => void,
    onProfile: (actualDurationMs: number) => void,
  ) => {
    const children: React.ReactNode[] = propsList.map((p, idx) =>
      React.createElement(
        Impl,
        { ...p, key: idx },
        buildChildren(itemsPerFlexbox),
      ),
    )

    children.push(<MountSignal key="__m" onCommitted={onCommitted} />)

    return (
      <Profiler
        id="bench"
        onRender={(_id, _phase, actualDuration) => onProfile(actualDuration)}
      >
        <>{children}</>
      </Profiler>
    )
  }

  const runCreateOnlyForest = async (
    name: BenchName,
    Impl: React.ElementType,
    propsList: Record<string, unknown>[],
    iterations: number,
  ) => {
    await maybeGC()
    const before = readMemory()

    let last: unknown = null
    const start = now()
    for (let i = 0; i < iterations; i++) {
      last = React.createElement(
        React.Fragment,
        null,
        propsList.map((p, idx) =>
          React.createElement(
            Impl,
            { ...p, key: idx },
            buildChildren(itemsPerFlexbox),
          ),
        ),
      )
    }

    if (!React.isValidElement(last))
      throw new Error('create-only sanity check failed')
    last = null

    const end = now()
    await maybeGC()
    const afterCreate = readMemory()

    const total = end - start
    return {
      name,
      createOnlyMsTotal: total,
      createOnlyMsPerOp: total / iterations,
      memory: { createBefore: before, createAfter: afterCreate },
    }
  }

  const runUpdateBatchKeepMounted = async (
    name: BenchName,
    Impl: React.ElementType,
    propsLists: Record<string, unknown>[][],
    loops: number,
  ) => {
    if (propsLists.length < loops + 1)
      throw new Error('propsLists must include warmup + loops')

    const container = document.createElement('div')
    container.style.position = 'absolute'
    container.style.left = '-10000px'
    container.style.top = '0'
    document.body.appendChild(container)

    const root = createRoot(container)

    const renderAndWait = async (nextPropsList: Record<string, unknown>[]) => {
      let resolveCommit!: () => void
      const committed = new Promise<void>((resolve) => {
        resolveCommit = resolve
      })

      let actualDurationMs = 0
      const onProfile = (d: number) => {
        actualDurationMs += d
      }

      const t0 = now()
      root.render(
        buildBenchmarkTree(
          Impl,
          nextPropsList,
          () => resolveCommit(),
          onProfile,
        ),
      )
      await committed
      await raf()
      const t1 = now()

      return { wallMs: t1 - t0, actualDurationMs }
    }

    // Warmup mount (not measured)
    await renderAndWait(propsLists[0])

    // Baseline memory while still mounted
    await maybeGC()
    const before = readMemory()

    let wallTotal = 0
    let actualTotal = 0

    for (let i = 0; i < loops; i++) {
      const { wallMs, actualDurationMs } = await renderAndWait(
        propsLists[i + 1],
      )
      wallTotal += wallMs
      actualTotal += actualDurationMs
    }

    // Sample retained heap at the end while still mounted
    await maybeGC()
    const after = readMemory()

    // Cleanup after measurement
    root.unmount()
    container.remove()
    await raf()

    // Emotion caches styles globally in <head>. Clean up after each run.
    cleanupEmotionStyleTags()
    await maybeGC()

    return {
      name,
      updateMsTotal: wallTotal,
      updateMsPerOp: wallTotal / loops,
      reactActualDurationMsTotal: actualTotal,
      memory: { mountBefore: before, mountAfter: after },
    }
  }

  const runOne = async (name: BenchName) => {
    setError(null)
    setRunning(true)

    try {
      // Warmup
      await raf()

      const c = cases.find((x) => x.name === name)
      if (!c) throw new Error(`Unknown case: ${name}`)

      const propsList = buildPropsList()

      // Precompute per-iteration props to avoid timing RNG work.
      const propsListsForUpdate = Array.from({ length: mountLoops + 1 }, () =>
        buildPropsList(),
      )

      const create = await runCreateOnlyForest(
        c.name,
        c.Impl,
        propsList,
        createIterations,
      )
      const update = await runUpdateBatchKeepMounted(
        c.name,
        c.Impl,
        propsListsForUpdate,
        mountLoops,
      )

      const merged: CaseResult = {
        name: c.name,
        createOnlyMsTotal: create.createOnlyMsTotal,
        createOnlyMsPerOp: create.createOnlyMsPerOp,
        updateMsTotal: update.updateMsTotal,
        updateMsPerOp: update.updateMsPerOp,
        reactActualDurationMsTotal: update.reactActualDurationMsTotal,
        memory: {
          createBefore: create.memory?.createBefore,
          createAfter: create.memory?.createAfter,
          mountBefore: update.memory?.mountBefore,
          mountAfter: update.memory?.mountAfter,
        },
      }

      upsertResult(merged)
      // Also print to console for easy copy/paste
      console.table(
        [merged].map((r) => ({
          name: r.name,
          random: randomPropsEnabled,
          flexboxes: flexboxCount,
          items_per_flexbox: itemsPerFlexbox,
          props_sample: JSON.stringify(propsList[0] ?? null),
          create_total_ms: Number(r.createOnlyMsTotal.toFixed(2)),
          create_ms_per_op: Number(r.createOnlyMsPerOp.toFixed(6)),
          update_total_ms: Number(r.updateMsTotal.toFixed(2)),
          update_ms_per_op: Number(r.updateMsPerOp.toFixed(4)),
          react_actual_ms_total: Number(
            r.reactActualDurationMsTotal.toFixed(2),
          ),
          heap_delta_create: formatBytes(
            memDelta(r.memory?.createBefore, r.memory?.createAfter),
          ),
          heap_delta_after_batch: formatBytes(
            memDelta(r.memory?.mountBefore, r.memory?.mountAfter),
          ),
        })),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: 0, fontSize: 18 }}>Flexbox perf batch</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Compare local Flex (CSS vars) vs Web Component vs react-layout-kit
        Flexbox.
      </p>

      <div style={{ marginTop: 8 }}>
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={randomPropsEnabled}
              onChange={(e) => setRandomPropsEnabled(e.target.checked)}
            />
            random flexbox props
          </label>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <label>
          create iterations{' '}
          <input
            type="number"
            value={createIterations}
            min={1000}
            step={1000}
            onChange={(e) => setCreateIterations(Number(e.target.value))}
            style={{ width: 120 }}
          />
        </label>
        <label>
          mount loops{' '}
          <input
            type="number"
            value={mountLoops}
            min={10}
            step={10}
            onChange={(e) => setMountLoops(Number(e.target.value))}
            style={{ width: 120 }}
          />
        </label>
        <label>
          flexboxes{' '}
          <input
            type="number"
            value={flexboxCount}
            min={1}
            step={50}
            onChange={(e) => setFlexboxCount(Number(e.target.value))}
            style={{ width: 120 }}
          />
        </label>

        <label>
          items / flexbox{' '}
          <input
            type="number"
            value={itemsPerFlexbox}
            min={0}
            step={1}
            onChange={(e) => setItemsPerFlexbox(Number(e.target.value))}
            style={{ width: 120 }}
          />
        </label>

        <button onClick={() => runOne('local(FlexBasic)')} disabled={running}>
          {running ? 'Running…' : 'Run local'}
        </button>
        <button
          onClick={() => runOne('native(WebComponent)')}
          disabled={running}
        >
          {running ? 'Running…' : 'Run native'}
        </button>
        <button
          onClick={() => runOne('react-layout-kit(Flexbox)')}
          disabled={running}
        >
          {running ? 'Running…' : 'Run react-layout-kit'}
        </button>
        <button onClick={() => setResults(null)} disabled={running}>
          Clear
        </button>
      </div>

      <p style={{ marginTop: 10, opacity: 0.75 }}>
        Memory uses <code>performance.memory</code> (Chromium only). For more
        stable heap numbers, run Chrome with <code>--js-flags=--expose-gc</code>
        .
      </p>

      <p style={{ marginTop: 6, opacity: 0.75 }}>
        Update batch keeps the root mounted and repeatedly re-renders; memory is
        sampled at the end while still mounted.
      </p>

      {error ? (
        <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre>
      ) : null}

      {results ? (
        <table
          style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse' }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: 'left',
                  borderBottom: '1px solid #ddd',
                  padding: 6,
                }}
              >
                case
              </th>
              <th
                style={{
                  textAlign: 'right',
                  borderBottom: '1px solid #ddd',
                  padding: 6,
                }}
              >
                create total
              </th>
              <th
                style={{
                  textAlign: 'right',
                  borderBottom: '1px solid #ddd',
                  padding: 6,
                }}
              >
                create/op
              </th>
              <th
                style={{
                  textAlign: 'right',
                  borderBottom: '1px solid #ddd',
                  padding: 6,
                }}
              >
                update total
              </th>
              <th
                style={{
                  textAlign: 'right',
                  borderBottom: '1px solid #ddd',
                  padding: 6,
                }}
              >
                update/op
              </th>
              <th
                style={{
                  textAlign: 'right',
                  borderBottom: '1px solid #ddd',
                  padding: 6,
                }}
              >
                react actual
              </th>
              <th
                style={{
                  textAlign: 'right',
                  borderBottom: '1px solid #ddd',
                  padding: 6,
                }}
              >
                heap Δ (create)
              </th>
              <th
                style={{
                  textAlign: 'right',
                  borderBottom: '1px solid #ddd',
                  padding: 6,
                }}
              >
                heap Δ (after batch)
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.name}>
                <td style={{ padding: 6, borderBottom: '1px solid #f1f1f1' }}>
                  {r.name}
                </td>
                <td
                  style={{
                    padding: 6,
                    borderBottom: '1px solid #f1f1f1',
                    textAlign: 'right',
                  }}
                >
                  {formatMs(r.createOnlyMsTotal)}
                </td>
                <td
                  style={{
                    padding: 6,
                    borderBottom: '1px solid #f1f1f1',
                    textAlign: 'right',
                  }}
                >
                  {formatMs(r.createOnlyMsPerOp)}
                </td>
                <td
                  style={{
                    padding: 6,
                    borderBottom: '1px solid #f1f1f1',
                    textAlign: 'right',
                  }}
                >
                  {formatMs(r.updateMsTotal)}
                </td>
                <td
                  style={{
                    padding: 6,
                    borderBottom: '1px solid #f1f1f1',
                    textAlign: 'right',
                  }}
                >
                  {formatMs(r.updateMsPerOp)}
                </td>
                <td
                  style={{
                    padding: 6,
                    borderBottom: '1px solid #f1f1f1',
                    textAlign: 'right',
                  }}
                >
                  {formatMs(r.reactActualDurationMsTotal)}
                </td>
                <td
                  style={{
                    padding: 6,
                    borderBottom: '1px solid #f1f1f1',
                    textAlign: 'right',
                  }}
                >
                  {formatBytes(
                    memDelta(r.memory?.createBefore, r.memory?.createAfter),
                  )}
                </td>
                <td
                  style={{
                    padding: 6,
                    borderBottom: '1px solid #f1f1f1',
                    textAlign: 'right',
                  }}
                >
                  {formatBytes(
                    memDelta(r.memory?.mountBefore, r.memory?.mountAfter),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}
