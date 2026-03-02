import * as colorbrewer from 'colorbrewer';
import { scaleOrdinal, scaleQuantize, scaleLinear } from 'd3-scale';
import { extent } from 'd3-array';
import { interpolateRgb } from 'd3-interpolate';

export type PaletteCategory = 'sequential' | 'qualitative' | 'diverging' | 'cyclical';

export interface PaletteDefinition {
    name: string;
    category: PaletteCategory;
    /** Available discrete step counts, e.g. [3,4,5,6,7,8,9] */
    steps: number[];
    /** Map from step count → array of hex colors */
    colorsByStep: Record<number, string[]>;
    /** If true, the palette supports continuous (gradient) mode */
    continuous: boolean;
}

export interface PaletteInfo {
    name: string;
    type: PaletteCategory;
    colors: string[];
}

// === helpers ===
const getBrewer = (): any => {
    try {
        return (colorbrewer as any).default || colorbrewer;
    } catch {
        return {};
    }
};

// Interpolate N colors from an array of anchor colors (linear in RGB for simplicity)
export const interpolateColors = (anchors: string[], n: number): string[] => {
    if (n <= 1) return [anchors[0]];
    if (n <= anchors.length) {
        // pick evenly spaced from anchors
        return Array.from({ length: n }, (_, i) => anchors[Math.round(i * (anchors.length - 1) / (n - 1))]);
    }
    const result: string[] = [];
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const segIndex = t * (anchors.length - 1);
        const lo = Math.floor(segIndex);
        const hi = Math.min(lo + 1, anchors.length - 1);
        const localT = segIndex - lo;
        const interp = interpolateRgb(anchors[lo], anchors[hi]);
        result.push(interp(localT));
    }
    return result;
};

// =====================  PALETTE DEFINITIONS  =====================

const buildBrewerPalette = (
    name: string, category: PaletteCategory, continuous: boolean
): PaletteDefinition | null => {
    const cb = getBrewer();
    const p = cb[name];
    if (!p) return null;

    const keys = Object.keys(p).map(Number).sort((a, b) => a - b);
    const colorsByStep: Record<number, string[]> = {};
    keys.forEach(k => { colorsByStep[k] = p[k]; });

    return { name, category, steps: keys, colorsByStep, continuous };
};

const buildCustomPalette = (
    name: string, category: PaletteCategory, anchors: string[],
    stepRange: [number, number], continuous: boolean
): PaletteDefinition => {
    const steps: number[] = [];
    const colorsByStep: Record<number, string[]> = {};
    for (let s = stepRange[0]; s <= stepRange[1]; s++) {
        steps.push(s);
        colorsByStep[s] = interpolateColors(anchors, s);
    }
    return { name, category, steps, colorsByStep, continuous };
};

export const getAllPaletteDefinitions = (): PaletteDefinition[] => {
    const defs: PaletteDefinition[] = [];

    // ── Qualitative (ColorBrewer) ──
    const qualNames = ['Accent', 'Dark2', 'Paired', 'Pastel1', 'Pastel2', 'Set1', 'Set2', 'Set3'];
    qualNames.forEach(n => {
        const d = buildBrewerPalette(n, 'qualitative', false);
        if (d) defs.push(d);
    });
    // Extra qualitative palettes (not in brewer)
    defs.push(buildCustomPalette('Vivid', 'qualitative',
        ['#e58606', '#5d69b1', '#52bca3', '#99c945', '#cc61b0', '#24796c', '#daa51b', '#2f8ac4', '#764e9f', '#ed645a'],
        [3, 10], false));
    defs.push(buildCustomPalette('Bold', 'qualitative',
        ['#7f3c8d', '#11a579', '#3969ac', '#f2b701', '#e73f74', '#80ba5a', '#e68310', '#008695', '#cf1c90', '#a5aa99'],
        [3, 10], false));
    defs.push(buildCustomPalette('Safe', 'qualitative',
        ['#88ccee', '#cc6677', '#ddcc77', '#117733', '#332288', '#aa4499', '#44aa99', '#999933', '#882255', '#661100'],
        [3, 10], false));
    defs.push(buildCustomPalette('Tableau10', 'qualitative',
        ['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac'],
        [3, 10], false));

    // ── Sequential (ColorBrewer + Scientific) ──
    const seqNames = ['Blues', 'Greens', 'Greys', 'Oranges', 'Purples', 'Reds',
        'BuGn', 'BuPu', 'GnBu', 'OrRd', 'PuBu', 'PuBuGn', 'PuRd', 'RdPu',
        'YlGn', 'YlGnBu', 'YlOrBr', 'YlOrRd'];
    seqNames.forEach(n => {
        const d = buildBrewerPalette(n, 'sequential', true);
        if (d) defs.push(d);
    });
    // Perceptually uniform scientific palettes
    defs.push(buildCustomPalette('Viridis', 'sequential',
        ['#440154','#482777','#3f4a8a','#31678e','#26838f','#1f9d8a','#6cce5a','#b6de2b','#fee825'],
        [3, 11], true));
    defs.push(buildCustomPalette('Inferno', 'sequential',
        ['#000004','#1b0c41','#4a0c6b','#781c6d','#a52c60','#cf4446','#ed6925','#fb9b06','#f7d13d','#fcffa4'],
        [3, 11], true));
    defs.push(buildCustomPalette('Magma', 'sequential',
        ['#000004','#140e36','#3b0f70','#641a80','#8c2981','#b73779','#de4968','#f7705c','#fe9f6d','#fecf92','#fcfdbf'],
        [3, 11], true));
    defs.push(buildCustomPalette('Plasma', 'sequential',
        ['#0d0887','#46039f','#7201a8','#9c179e','#bd3786','#d8576b','#ed7953','#fb9f3a','#fdca26','#f0f921'],
        [3, 11], true));
    defs.push(buildCustomPalette('Cividis', 'sequential',
        ['#002051','#0a326a','#2b446e','#4d566d','#6b6b6f','#8a8269','#a99b5b','#c9b64a','#ead337','#fdea45'],
        [3, 11], true));
    defs.push(buildCustomPalette('Turbo', 'sequential',
        ['#30123b','#4662d7','#36aaf9','#1ae4b6','#72fe5e','#c8ef34','#faba39','#f66b19','#ca2a04','#7a0403'],
        [3, 11], true));
    defs.push(buildCustomPalette('Warm', 'sequential',
        ['#6e40aa','#a83cb3','#df40a1','#ff507a','#ff704e','#f89b31','#d2c934','#aff05b'],
        [3, 11], true));
    defs.push(buildCustomPalette('Cool', 'sequential',
        ['#6e40aa','#6054c8','#4c6edb','#368ce1','#23abd8','#18c7c1','#1ddfa3','#30ef82'],
        [3, 11], true));

    // ── Diverging (ColorBrewer + extras) ──
    const divNames = ['BrBG', 'PiYG', 'PRGn', 'PuOr', 'RdBu', 'RdGy', 'RdYlBu', 'RdYlGn', 'Spectral'];
    divNames.forEach(n => {
        const d = buildBrewerPalette(n, 'diverging', true);
        if (d) defs.push(d);
    });
    defs.push(buildCustomPalette('CoolWarm', 'diverging',
        ['#3b4cc0','#6788ee','#9abbff','#c9d7ef','#edd1c2','#f7a889','#e26952','#b40426'],
        [3, 11], true));
    defs.push(buildCustomPalette('RedBlue', 'diverging',
        ['#67001f','#b2182b','#d6604d','#f4a582','#fddbc7','#f7f7f7','#d1e5f0','#92c5de','#4393c3','#2166ac','#053061'],
        [3, 11], true));
    defs.push(buildCustomPalette('Earth', 'diverging',
        ['#8c510a','#bf812d','#dfc27d','#f6e8c3','#f5f5f5','#c7eae5','#80cdc1','#35978f','#01665e'],
        [3, 11], true));

    // ── Cyclical ──
    defs.push(buildCustomPalette('HSL', 'cyclical',
        ['#ff0000','#ff8800','#ffff00','#00ff00','#0088ff','#0000ff','#8800ff','#ff00ff','#ff0000'],
        [4, 12], true));
    defs.push(buildCustomPalette('Twilight', 'cyclical',
        ['#e2d9e2','#9e9ac8','#6a51a3','#2d004b','#3f007d','#6a51a3','#9e9ac8','#e2d9e2'],
        [4, 12], true));
    defs.push(buildCustomPalette('IceFire', 'cyclical',
        ['#000000','#001f5c','#003fbb','#1485d4','#6bc5e8','#e6e6e6','#e8b86c','#d47514','#bb3f00','#5c1f00','#000000'],
        [4, 12], true));
    defs.push(buildCustomPalette('Phase', 'cyclical',
        ['#a8326e','#de60a1','#f99cc5','#ffddee','#c7e7ff','#6fb8f2','#2d7dc4','#164ea8','#4a1471','#a8326e'],
        [4, 12], true));

    // ── Fallback if brewer failed to load anything useful ──
    if (defs.length < 5) {
        defs.push(buildCustomPalette('FallbackQual', 'qualitative',
            ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf'],
            [3, 8], false));
        defs.push(buildCustomPalette('FallbackSeq', 'sequential',
            ['#f7fbff','#deebf7','#c6dbef','#9ecae1','#6baed6','#4292c6','#2171b5','#084594'],
            [3, 8], true));
    }

    return defs;
};

/** Legacy compat: getAllPalettes returns the old flat format */
export const getAllPalettes = (): PaletteInfo[] => {
    return getAllPaletteDefinitions().map(d => {
        const maxStep = Math.max(...d.steps);
        return { name: d.name, type: d.category, colors: d.colorsByStep[maxStep] };
    });
};

/** Get colors for a specific palette at a given step count */
export const getPaletteColors = (def: PaletteDefinition, steps: number | 'continuous'): string[] => {
    if (steps === 'continuous') {
        // Return high-resolution continuous ramp
        const maxStep = Math.max(...def.steps);
        const anchors = def.colorsByStep[maxStep];
        return interpolateColors(anchors, 256);
    }
    if (def.colorsByStep[steps]) return def.colorsByStep[steps];
    // If exact step not available, interpolate from the max available
    const maxStep = Math.max(...def.steps);
    return interpolateColors(def.colorsByStep[maxStep], steps);
};

/** Suggest default palette category based on field type */
export const suggestPaletteCategory = (fieldType: string): PaletteCategory => {
    const upper = (fieldType || '').toUpperCase();
    const isNum = ['DOUBLE', 'INT', 'FLOAT', 'DECIMAL', 'REAL', 'BIGINT', 'NUMBER'].some(t => upper.includes(t));
    if (!isNum) return 'qualitative';
    return 'sequential';
};

// === Color conversion ===
export const hexToRgb = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [0, 0, 0];
};

export const rgbToHex = (r: number, g: number, b: number): string =>
    '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

// === Color Scale Factories ===
export const createColorScale = (type: 'categorical' | 'numerical', values: any[], palette: string[]) => {
    if (type === 'categorical') {
        const uniqueValues = Array.from(new Set(values));
        const scale = scaleOrdinal<string>()
            .domain(uniqueValues)
            .range(palette);
        return (val: any) => hexToRgb(scale(val));
    } else {
        const [min, max] = extent(values.map(Number)) as [number, number];
        const scale = scaleQuantize<string>()
            .domain([min || 0, max || 1])
            .range(palette);
        return (val: any) => hexToRgb(scale(Number(val)));
    }
};

export const createContinuousScale = (values: number[], palette: string[]) => {
    const [min, max] = extent(values) as [number, number];
    const scale = scaleLinear<string>()
        .domain(palette.map((_, i, arr) => min + (i / (arr.length - 1)) * (max - min)))
        .range(palette);
    return (val: number) => {
        const color = scale(val);
        const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color || '');
        if (m) return [+m[1], +m[2], +m[3]] as [number, number, number];
        return hexToRgb(color || '#000000');
    };
};
