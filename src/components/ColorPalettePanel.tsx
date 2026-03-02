import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    getAllPaletteDefinitions,
    getPaletteColors,
    interpolateColors,
    suggestPaletteCategory,
    type PaletteDefinition,
    type PaletteCategory,
} from '../utils/ColorMapper';

interface ColorPalettePanelProps {
    /** Currently selected palette colors */
    currentPalette?: string[];
    /** Current viz field type, or undefined if no field selected */
    fieldType?: string;
    /** Called when the user selects a new palette (array of hex strings) */
    onPaletteChange: (colors: string[], paletteName?: string) => void;
    /** Close the panel */
    onClose: () => void;
}

type CategoryFilter = 'all' | PaletteCategory;

interface CustomPalette {
    name: string;
    colors: string[];
}

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
    all: 'All',
    sequential: 'Sequential',
    qualitative: 'Qualitative',
    diverging: 'Diverging',
    cyclical: 'Cyclical',
};

/** Compute a good recommended step count for a palette */
const getRecommendedSteps = (def: PaletteDefinition): { min: number; max: number; default: number } => {
    const minStep = Math.min(...def.steps);
    const maxStep = Math.max(...def.steps);
    if (def.category === 'qualitative') {
        // qualitative: recommend 5–8
        return { min: Math.max(minStep, 5), max: Math.min(maxStep, 8), default: Math.min(maxStep, 7) };
    }
    if (def.category === 'diverging') {
        // diverging: recommend odd numbers like 7, 9, 11
        const rec = Math.min(maxStep, 9);
        return { min: Math.max(minStep, 5), max: Math.min(maxStep, 11), default: rec };
    }
    if (def.category === 'cyclical') {
        return { min: Math.max(minStep, 6), max: Math.min(maxStep, 12), default: Math.min(maxStep, 8) };
    }
    // sequential: recommend 5–9
    return { min: Math.max(minStep, 5), max: Math.min(maxStep, 9), default: Math.min(maxStep, 7) };
};

/** Format recommended range as a string */
const formatRecommended = (def: PaletteDefinition): string => {
    const rec = getRecommendedSteps(def);
    if (rec.min === rec.max) return `${rec.min} steps`;
    return `${rec.min}–${rec.max} steps`;
};

const ColorPalettePanel: React.FC<ColorPalettePanelProps> = ({
    currentPalette,
    fieldType,
    onPaletteChange,
    onClose,
}) => {
    const allDefs = useMemo(() => getAllPaletteDefinitions(), []);
    const suggestedCategory = useMemo(() => fieldType ? suggestPaletteCategory(fieldType) : undefined, [fieldType]);

    const [category, setCategory] = useState<CategoryFilter>(suggestedCategory || 'all');
    const [selectedPalette, setSelectedPalette] = useState<PaletteDefinition | null>(null);
    const [steps, setSteps] = useState<number | 'continuous'>(7);
    const [reversed, setReversed] = useState(false);

    // Custom palette state
    const [showCustom, setShowCustom] = useState(false);
    const [customStops, setCustomStops] = useState<string[]>(['#2563eb', '#f59e0b', '#ef4444']);
    const [customName, setCustomName] = useState('My Palette');
    const [savedCustom, setSavedCustom] = useState<CustomPalette[]>(() => {
        try {
            const saved = sessionStorage.getItem('custom_palettes');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    const [searchQuery, setSearchQuery] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    // Initialize selected palette from current colors
    useEffect(() => {
        if (currentPalette && currentPalette.length > 0 && !selectedPalette) {
            const match = allDefs.find(d =>
                Object.values(d.colorsByStep).some(
                    colors => JSON.stringify(colors) === JSON.stringify(currentPalette)
                )
            );
            if (match) {
                setSelectedPalette(match);
                const stepEntry = Object.entries(match.colorsByStep).find(
                    ([, colors]) => JSON.stringify(colors) === JSON.stringify(currentPalette)
                );
                if (stepEntry) setSteps(parseInt(stepEntry[0]));
            }
        }
    }, []);

    // Filter palettes by category and search
    const filteredDefs = useMemo(() => {
        let filtered = allDefs;
        if (category !== 'all') {
            filtered = filtered.filter(d => d.category === category);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(d => d.name.toLowerCase().includes(q));
        }
        return filtered;
    }, [allDefs, category, searchQuery]);

    // Get preview colors for a palette item — uses the current steps if selected, else recommended default
    const getItemPreview = useCallback((def: PaletteDefinition): string[] => {
        const isSelected = selectedPalette?.name === def.name;
        if (isSelected) {
            let colors = getPaletteColors(def, steps);
            if (reversed) colors = [...colors].reverse();
            return colors;
        }
        // For non-selected items, show at recommended default step count
        const rec = getRecommendedSteps(def);
        return getPaletteColors(def, rec.default);
    }, [selectedPalette, steps, reversed]);



    // Apply palette with current settings
    const applyPalette = useCallback((def: PaletteDefinition, stepOverride?: number | 'continuous') => {
        const s = stepOverride !== undefined ? stepOverride : steps;
        let colors = getPaletteColors(def, s);
        if (reversed) colors = [...colors].reverse();
        onPaletteChange(colors, def.name);
    }, [steps, reversed, onPaletteChange]);

    // Handle palette selection — default step count to recommended value
    const handleSelectPalette = (def: PaletteDefinition) => {
        const rec = getRecommendedSteps(def);
        const minStep = Math.min(...def.steps);
        const maxStep = Math.max(...def.steps);

        // If currently selected palette is the same, just toggle off (deselect)
        if (selectedPalette?.name === def.name) return;

        setSelectedPalette(def);

        // Set steps to recommended default, clamped to palette's range
        let newSteps: number | 'continuous' = rec.default;
        if (typeof steps === 'number') {
            // If the user explicitly chose a step count that fits, keep it
            if (steps >= minStep && steps <= maxStep) {
                newSteps = steps;
            }
        } else if (steps === 'continuous' && def.continuous) {
            newSteps = 'continuous';
        }
        setSteps(newSteps);
        applyPalette(def, newSteps);
    };

    // Handle step change (only shown for selected palette)
    const handleStepChange = (newSteps: number | 'continuous') => {
        setSteps(newSteps);
        if (selectedPalette) applyPalette(selectedPalette, newSteps);
    };

    // Handle reverse
    const handleReverseToggle = () => {
        const newReversed = !reversed;
        setReversed(newReversed);
        if (selectedPalette) {
            let colors = getPaletteColors(selectedPalette, steps);
            if (newReversed) colors = [...colors].reverse();
            onPaletteChange(colors, selectedPalette.name);
        }
    };

    // Custom palette handlers
    const addCustomStop = () => setCustomStops(prev => [...prev, '#888888']);
    const removeCustomStop = (i: number) => setCustomStops(prev => prev.filter((_, idx) => idx !== i));
    const updateCustomStop = (i: number, color: string) =>
        setCustomStops(prev => prev.map((c, idx) => idx === i ? color : c));

    const applyCustomPalette = () => {
        if (customStops.length >= 2) {
            const numSteps = typeof steps === 'number' ? steps : 7;
            const colors = interpolateColors(customStops, numSteps);
            onPaletteChange(colors, customName);
            setSelectedPalette(null);
        }
    };

    const saveCustomPalette = () => {
        const pal: CustomPalette = { name: customName, colors: [...customStops] };
        const updated = [...savedCustom.filter(p => p.name !== customName), pal];
        setSavedCustom(updated);
        try { sessionStorage.setItem('custom_palettes', JSON.stringify(updated)); } catch {}
    };

    const deleteCustomPalette = (name: string) => {
        const updated = savedCustom.filter(p => p.name !== name);
        setSavedCustom(updated);
        try { sessionStorage.setItem('custom_palettes', JSON.stringify(updated)); } catch {}
    };

    const exportPalettesJSON = () => {
        const blob = new Blob([JSON.stringify(savedCustom, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'custom_palettes.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const importPalettesJSON = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e: any) => {
            const file = e.target?.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const parsed = JSON.parse(evt.target?.result as string);
                    if (Array.isArray(parsed)) {
                        const merged = [...savedCustom];
                        parsed.forEach((p: CustomPalette) => {
                            if (p.name && Array.isArray(p.colors)) {
                                const idx = merged.findIndex(m => m.name === p.name);
                                if (idx >= 0) merged[idx] = p;
                                else merged.push(p);
                            }
                        });
                        setSavedCustom(merged);
                        try { sessionStorage.setItem('custom_palettes', JSON.stringify(merged)); } catch {}
                    }
                } catch {
                    alert('Invalid palette JSON file');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };



    return (
        <div
            className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200/80 rounded-2xl shadow-[0_20px_60px_-12px_rgba(0,0,0,0.25)] z-60 animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
            style={{ maxHeight: '560px' }}
        >
            {/* ══════════════ Header + Close ══════════════ */}
            <div className="px-4 py-2.5 bg-linear-to-r from-gray-50 to-white border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 rounded-lg bg-linear-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                        </svg>
                    </div>
                    <h4 className="text-[11px] font-black text-gray-700 uppercase tracking-widest">Color Palette</h4>
                </div>

                <div className="flex items-center gap-1.5">
                    {/* Reverse toggle */}
                    <button
                        onClick={handleReverseToggle}
                        className={`flex items-center space-x-1 px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all ${
                            reversed
                                ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                        }`}
                        title="Reverse palette"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                        <span>Rev</span>
                    </button>

                    {/* Custom toggle */}
                    <button
                        onClick={() => setShowCustom(!showCustom)}
                        className={`flex items-center space-x-1 px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all ${
                            showCustom
                                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                        }`}
                        title="Custom palette"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Custom</span>
                    </button>

                    {/* Close */}
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors ml-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* ══════════════ Category Selector (Dropdown) ══════════════ */}
            <div className="px-4 py-2 bg-gray-50/60 border-b border-gray-100 flex items-center justify-between gap-3">
                <div className="flex flex-col flex-1">
                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Filter by Type</label>
                    <div className="relative group/cat">
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value as CategoryFilter)}
                            className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all cursor-pointer pr-8"
                        >
                            {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map(cat => (
                                <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                            ))}
                        </select>
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Legacy Search bar (condensed) */}
                <div className="flex flex-col w-30">
                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Search</label>
                    <div className="relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-semibold outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all placeholder:text-gray-300"
                            placeholder="Name..."
                        />
                    </div>
                </div>
            </div>

            {/* ══════════════ Custom Palette Builder ══════════════ */}
            {showCustom && (
                <div className="px-4 py-3 border-b border-gray-100 bg-emerald-50/30 space-y-3 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Custom Palette Builder</span>
                        <div className="flex items-center space-x-1">
                            <button onClick={importPalettesJSON} className="text-[8px] font-black text-blue-600 hover:underline uppercase px-1.5 py-0.5 rounded hover:bg-blue-50" title="Import palettes from JSON">Import</button>
                            <button onClick={exportPalettesJSON} className="text-[8px] font-black text-blue-600 hover:underline uppercase px-1.5 py-0.5 rounded hover:bg-blue-50" title="Export palettes as JSON">Export</button>
                        </div>
                    </div>

                    {/* Name input */}
                    <input
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        className="w-full px-2.5 py-1.5 border rounded-lg text-[11px] bg-white focus:ring-1 focus:ring-emerald-400 outline-none"
                        placeholder="Palette name..."
                    />

                    {/* Color stops */}
                    <div className="flex flex-wrap gap-2 items-center">
                        {customStops.map((color, i) => (
                            <div key={i} className="relative group">
                                <input
                                    type="color"
                                    value={color}
                                    onChange={(e) => updateCustomStop(i, e.target.value)}
                                    className="w-8 h-8 rounded-lg border-2 border-white shadow-md cursor-pointer"
                                    title={color}
                                />
                                {customStops.length > 2 && (
                                    <button
                                        onClick={() => removeCustomStop(i)}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-sm"
                                    >×</button>
                                )}
                            </div>
                        ))}
                        <button
                            onClick={addCustomStop}
                            className="w-8 h-8 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
                            title="Add color stop"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                    </div>

                    {/* Preview of custom palette */}
                    <div className="h-3 w-full rounded-md overflow-hidden flex shadow-inner border border-black/5">
                        {interpolateColors(customStops, typeof steps === 'number' ? steps : 7).map((c, i) => (
                            <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                        ))}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                        <button
                            onClick={applyCustomPalette}
                            className="flex-1 py-1.5 bg-emerald-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                        >Apply</button>
                        <button
                            onClick={saveCustomPalette}
                            className="flex-1 py-1.5 bg-white text-emerald-700 text-[9px] font-black uppercase rounded-lg hover:bg-emerald-50 transition-colors border border-emerald-200"
                        >Save</button>
                    </div>

                    {/* Saved custom palettes */}
                    {savedCustom.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-emerald-200/50">
                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider">Saved Palettes</span>
                            {savedCustom.map(p => (
                                <div key={p.name} className="flex items-center gap-2 group">
                                    <button
                                        onClick={() => {
                                            setCustomStops([...p.colors]);
                                            setCustomName(p.name);
                                            const numSteps = typeof steps === 'number' ? steps : 7;
                                            onPaletteChange(interpolateColors(p.colors, numSteps), p.name);
                                            setSelectedPalette(null);
                                        }}
                                        className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white transition-colors"
                                    >
                                        <div className="flex h-2.5 w-12 rounded-sm overflow-hidden border border-black/5 shrink-0">
                                            {p.colors.map((c, i) => <div key={i} className="flex-1" style={{ backgroundColor: c }} />)}
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-600">{p.name}</span>
                                    </button>
                                    <button
                                        onClick={() => deleteCustomPalette(p.name)}
                                        className="p-1 rounded text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════ Palette List ══════════════ */}
            <div ref={scrollRef} className="overflow-auto custom-scrollbar" style={{ maxHeight: showCustom ? '200px' : '380px' }}>
                {/* Field type suggestion */}
                {suggestedCategory && category === 'all' && (
                    <div className="px-4 py-1.5 bg-blue-50/50 border-b border-blue-100/30">
                        <span className="text-[9px] text-blue-600 font-bold">
                            💡 Recommended: <button onClick={() => setCategory(suggestedCategory)} className="underline font-black uppercase">{CATEGORY_LABELS[suggestedCategory]}</button> palettes for {fieldType} fields
                        </span>
                    </div>
                )}

                <div className="py-1">
                    {filteredDefs.length === 0 && (
                        <div className="text-center py-10">
                            <p className="text-[10px] text-gray-400 font-bold uppercase">No palettes found</p>
                        </div>
                    )}

                    {filteredDefs.map(def => {
                        const isSelected = selectedPalette?.name === def.name;
                        const preview = getItemPreview(def);
                        const minStep = Math.min(...def.steps);
                        const maxStep = Math.max(...def.steps);

                        return (
                            <div key={def.name}>
                                {/* ── Palette Item ── */}
                                <button
                                    onClick={() => handleSelectPalette(def)}
                                    className={`w-full text-left px-4 py-2 transition-all ${
                                        isSelected
                                            ? 'bg-blue-50 border-l-[3px] border-l-blue-500'
                                            : 'hover:bg-gray-50/80 border-l-[3px] border-l-transparent'
                                    }`}
                                >
                                    {/* Name + recommended steps row */}
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`text-[10px] truncate ${isSelected ? 'font-black text-blue-700' : 'font-bold text-gray-700'}`}>
                                                {def.name}
                                            </span>
                                            {/* Category badge */}
                                            <span className={`text-[7px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                                                def.category === 'sequential' ? 'bg-emerald-100 text-emerald-600' :
                                                def.category === 'qualitative' ? 'bg-violet-100 text-violet-600' :
                                                def.category === 'diverging' ? 'bg-amber-100 text-amber-600' :
                                                'bg-cyan-100 text-cyan-600'
                                            }`}>
                                                {def.category}
                                            </span>
                                        </div>
                                        <span className="text-[8px] font-medium text-gray-400 shrink-0 ml-2">
                                            {formatRecommended(def)}
                                            {def.continuous ? ' · ∞' : ''}
                                        </span>
                                    </div>

                                    {/* Full-width colorbar */}
                                    <div className={`h-4 w-full rounded-md overflow-hidden flex border transition-shadow ${
                                        isSelected ? 'shadow-md border-blue-300' : 'shadow-sm border-black/5'
                                    }`}>
                                        {steps === 'continuous' && isSelected ? (
                                            <div className="w-full h-full" style={{ background: `linear-gradient(to right, ${preview.join(', ')})` }} />
                                        ) : (
                                            preview.slice(0, 20).map((c, i) => (
                                                <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                                            ))
                                        )}
                                    </div>

                                    {/* Selected checkmark */}
                                    {isSelected && (
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                            <span className="text-[8px] font-bold text-blue-600 uppercase">Selected</span>
                                        </div>
                                    )}
                                </button>

                                {/* ── Step Selector (only for the selected palette) ── */}
                                {isSelected && (
                                    <div className="px-4 py-2.5 bg-blue-50/50 border-t border-blue-100/40 border-b border-b-gray-100 animate-in slide-in-from-top-1 duration-100">
                                        <div className="flex items-center gap-3">
                                            {/* Steps slider */}
                                            <div className="flex items-center space-x-2 flex-1">
                                                <label className="text-[8px] font-black text-gray-500 uppercase tracking-wider shrink-0">Steps</label>
                                                <input
                                                    type="range"
                                                    min={minStep}
                                                    max={maxStep}
                                                    step={1}
                                                    value={typeof steps === 'number' ? steps : maxStep}
                                                    onChange={(e) => handleStepChange(parseInt(e.target.value))}
                                                    className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                    disabled={steps === 'continuous'}
                                                />
                                                <span className="text-[10px] font-mono font-bold text-blue-700 w-5 text-center tabular-nums">
                                                    {typeof steps === 'number' ? steps : '∞'}
                                                </span>
                                            </div>

                                            {/* Gradient toggle */}
                                            {def.continuous && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleStepChange(steps === 'continuous' ? getRecommendedSteps(def).default : 'continuous'); }}
                                                    className={`flex items-center space-x-1 px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all shrink-0 ${
                                                        steps === 'continuous'
                                                            ? 'bg-violet-100 text-violet-700 ring-1 ring-violet-200'
                                                            : 'bg-white text-gray-500 hover:bg-violet-50 border border-gray-200'
                                                    }`}
                                                >
                                                    <span className="text-[10px]">∿</span>
                                                    <span>Gradient</span>
                                                </button>
                                            )}
                                        </div>

                                        {/* Step number buttons (quick-select) */}
                                        <div className="flex gap-1 mt-2">
                                            {def.steps.map(s => (
                                                <button
                                                    key={s}
                                                    onClick={(e) => { e.stopPropagation(); handleStepChange(s); }}
                                                    className={`min-w-6 py-0.5 rounded text-[9px] font-bold transition-all ${
                                                        typeof steps === 'number' && steps === s
                                                            ? 'bg-blue-600 text-white shadow-sm'
                                                            : 'bg-white text-gray-500 hover:bg-blue-50 border border-gray-200'
                                                    }`}
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                            {def.continuous && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleStepChange('continuous'); }}
                                                    className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                                                        steps === 'continuous'
                                                            ? 'bg-violet-600 text-white shadow-sm'
                                                            : 'bg-white text-gray-500 hover:bg-violet-50 border border-gray-200'
                                                    }`}
                                                >
                                                    ∞
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ColorPalettePanel;
