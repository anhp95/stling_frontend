import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { queryDuckDB } from '../utils/duckdb';
import { Rnd } from 'react-rnd';

interface NumericFilterProps {
  field: string;
  value: any;
  layer: any;
  onChange: (val: any) => void;
}

// ─── Dual Range Slider ──────────────────────────────────────────────────────
function DualRangeSlider({
  domainMin,
  domainMax,
  valueMin,
  valueMax,
  onChange,
  accentColor = '#b45309',  // terracotta amber
}: {
  domainMin: number;
  domainMax: number;
  valueMin: number;
  valueMax: number;
  onChange: (min: number, max: number) => void;
  accentColor?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  // stateRef avoids stale closures in window event listeners
  const stateRef = useRef({ valueMin, valueMax });
  stateRef.current.valueMin = valueMin;
  stateRef.current.valueMax = valueMax;

  const getVal = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return domainMin;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return domainMin + ratio * (domainMax - domainMin);
  };

  const startDrag = (thumb: 'min' | 'max') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // prevent Rnd from intercepting drag

    const onMove = (ev: MouseEvent) => {
      const v = getVal(ev.clientX);
      const { valueMin: vMin, valueMax: vMax } = stateRef.current;
      if (thumb === 'min') {
        onChange(Math.min(v, vMax), vMax);
      } else {
        onChange(vMin, Math.max(v, vMin));
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const range = domainMax - domainMin || 1;
  const leftPct = Math.max(0, Math.min(100, ((valueMin - domainMin) / range) * 100));
  const rightPct = Math.max(0, Math.min(100, ((valueMax - domainMin) / range) * 100));

  return (
    <div
      ref={trackRef}
      className="relative w-full h-5 flex items-center select-none"
      style={{ cursor: 'default' }}
    >
      {/* Track bg */}
      <div className="absolute inset-x-0 h-1 rounded-full" style={{ backgroundColor: '#e2e8f0' }} />
      {/* Active range */}
      <div
        className="absolute h-1 rounded-full"
        style={{ left: `${leftPct}%`, right: `${100 - rightPct}%`, backgroundColor: accentColor }}
      />
      {/* Min thumb */}
      <div
        className="absolute w-4 h-4 rounded-full bg-white shadow-md border-2 cursor-ew-resize hover:scale-110 transition-transform"
        style={{ left: `${leftPct}%`, transform: 'translateX(-50%)', zIndex: 30, borderColor: accentColor }}
        onMouseDown={startDrag('min')}
      />
      {/* Max thumb */}
      <div
        className="absolute w-4 h-4 rounded-full bg-white shadow-md border-2 cursor-ew-resize hover:scale-110 transition-transform"
        style={{ left: `${rightPct}%`, transform: 'translateX(-50%)', zIndex: 30, borderColor: accentColor }}
        onMouseDown={startDrag('max')}
      />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
const NumericFilter: React.FC<NumericFilterProps> = ({ field, value, layer, onChange }) => {
  const [stats, setStats] = useState<{ min: number; max: number } | null>(null);
  const [histogram, setHistogram] = useState<{ bin: number; count: number }[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [panelHeight, setPanelHeight] = useState(220);

  const [localMin, setLocalMin] = useState<number>(0);
  const [localMax, setLocalMax] = useState<number>(1);
  const debounceRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        let min = 0, max = 1;

        if (layer.duckdbTable) {
          const res = await queryDuckDB(
            `SELECT MIN("${field}") as mn, MAX("${field}") as mx FROM ${layer.duckdbTable} WHERE "${field}" IS NOT NULL`
          );
          if (res[0]) { min = Number(res[0].mn) || 0; max = Number(res[0].mx) || 1; }
        } else if (layer.data) {
          const vals: number[] = layer.data.map((d: any) => Number(d[field])).filter(Number.isFinite);
          if (vals.length) { min = Math.min(...vals); max = Math.max(...vals); }
        }

        if (min === max) max = min + 1;

        // Build histogram from raw data (no extra DuckDB roundtrip)
        const BINS = 60;
        const step = (max - min) / BINS;
        const counts = new Array(BINS).fill(0);

        const rawVals: number[] = layer.duckdbTable
          ? (await queryDuckDB(`SELECT "${field}" AS v FROM ${layer.duckdbTable} WHERE "${field}" IS NOT NULL`)).map((r: any) => Number(r.v)).filter(Number.isFinite)
          : (layer.data || []).map((d: any) => Number(d[field])).filter(Number.isFinite);

        for (const v of rawVals) {
          const idx = Math.min(Math.floor((v - min) / step), BINS - 1);
          if (idx >= 0) counts[idx]++;
        }

        const bins = counts.map((count, i) => ({ bin: min + i * step, count }));

        if (mounted) {
          setStats({ min, max });
          setHistogram(bins);
          setLocalMin(value?.min ?? min);
          setLocalMax(value?.max ?? max);
        }
      } catch (err) {
        console.error('NumericFilter error', err);
      }
    };
    run();
    return () => { mounted = false; };
  }, [layer.id, field]);

  useEffect(() => {
    if (!stats) return;
    setLocalMin(value?.min !== undefined ? value.min : stats.min);
    setLocalMax(value?.max !== undefined ? value.max : stats.max);
  }, [stats?.min, stats?.max]);

  const emit = (newMin: number, newMax: number) => {
    setLocalMin(newMin);
    setLocalMax(newMax);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChangeRef.current({ ...valueRef.current, type: 'range', min: newMin, max: newMax });
    }, 200);
  };

  if (!stats) return <div className="h-8 bg-gray-100 animate-pulse rounded-lg" />;

  const { min, max } = stats;
  const maxCount = Math.max(...histogram.map(b => b.count), 1);

  // Smart rounding based on data range
  const range = max - min;
  const decimals = range >= 1000 ? 0 : range >= 10 ? 1 : range >= 1 ? 2 : 3;
  const round = (v: number) => parseFloat(v.toFixed(decimals));

  const Bars = ({ height }: { height: number }) => (
    <div className="flex items-end w-full" style={{ height }}>
      {histogram.map((b, i) => {
        const active = b.bin >= localMin && b.bin <= localMax;
        return (
          <div
            key={i}
            className="flex-1 mx-px transition-all duration-100"
            style={{
              height: `${(b.count / maxCount) * 100}%`,
              backgroundColor: active ? '#d97706' : '#e7d3b3',
              minHeight: b.count > 0 ? '1px' : '0'
            }}
          />
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Compact number inputs */}
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={round(localMin)}
          onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) emit(round(v), localMax); }}
          className="w-0 flex-1 min-w-0 px-2 py-1.5 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-[10px] font-mono"
        />
        <span className="text-gray-300 shrink-0 text-xs">–</span>
        <input
          type="number"
          value={round(localMax)}
          onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) emit(localMin, round(v)); }}
          className="w-0 flex-1 min-w-0 px-2 py-1.5 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all text-[10px] font-mono"
        />
      </div>

      {/* Mini inline histogram + slider */}
      <div className="bg-amber-50/40 border border-amber-200 rounded-lg p-2 pt-2 pb-3 space-y-2">
        <Bars height={40} />
        <DualRangeSlider
          domainMin={min}
          domainMax={max}
          valueMin={localMin}
          valueMax={localMax}
          onChange={emit}
        />
      </div>

      <button
        onClick={() => setIsExpanded(v => !v)}
        className="w-full py-1.5 border border-dashed border-gray-200 rounded-lg text-[9px] font-black uppercase tracking-widest text-gray-400 hover:text-blue-500 hover:border-blue-400 hover:bg-blue-50/30 transition-all"
      >
        {isExpanded ? '↑ Hide Distribution' : '↓ Expand Distribution'}
      </button>

      {/* Floating panel */}
      {isExpanded && createPortal(
        <Rnd
          default={{
            x: Math.round(window.innerWidth / 2 - 400),
            y: window.innerHeight - 240,
            width: 800,
            height: panelHeight,
          }}
          minHeight={180}
          maxHeight={500}
          minWidth={400}
          enableResizing={{ top: true, bottom: false, left: true, right: true }}
          disableDragging={false}
          style={{ zIndex: 9999 }}
          className="bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          onResize={(_e, _d, ref) => setPanelHeight(ref.offsetHeight)}
          cancel=".no-drag" // Prevent Rnd from handling drags from slider elements
        >
          {/* Header — this part is the drag handle */}
          <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100 shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-2.5 h-2.5 bg-amber-700 rounded-sm shadow-sm shadow-amber-200" />
              <div>
                <div className="text-[11px] font-black text-gray-800 uppercase tracking-widest">{field}</div>
                <div className="text-[8px] text-gray-400 font-bold uppercase">{layer.dataset}</div>
              </div>
            </div>
            {/* Range badge */}
            <div className="bg-amber-50 border border-amber-200 rounded-full px-4 py-1 flex items-center space-x-3 no-drag">
              <span className="text-[10px] font-black text-amber-700">{Number.isFinite(localMin) ? round(localMin).toLocaleString() : '—'}</span>
              <div className="w-3 h-px bg-amber-200" />
              <span className="text-[10px] font-black text-amber-700">{Number.isFinite(localMax) ? round(localMax).toLocaleString() : '—'}</span>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1.5 rounded-full hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all no-drag"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Plot + slider — use no-drag to prevent Rnd from consuming mouse events */}
          <div className="flex-1 flex flex-col px-8 pt-4 pb-3 min-h-0 no-drag">
            <div className="flex-1 space-y-2 min-h-0">
              <Bars height={Math.max(80, panelHeight - 130)} />
              {/* explicit no-drag wrapper so Rnd ignores drags here */}
              <div className="no-drag">
                <DualRangeSlider
                  domainMin={min}
                  domainMax={max}
                  valueMin={localMin}
                  valueMax={localMax}
                  onChange={emit}
                />
              </div>
            </div>
            <div className="flex justify-between mt-2 text-[8px] font-bold text-gray-400">
              <span>{min.toLocaleString()}</span>
              <span>{max.toLocaleString()}</span>
            </div>
          </div>
        </Rnd>,
        document.body
      )}
    </div>
  );
};

export default NumericFilter;
